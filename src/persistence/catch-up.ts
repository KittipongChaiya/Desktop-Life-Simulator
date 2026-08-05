/**
 * Offline progress. Phase-07d — `SAVE_FORMAT.md` §6, `GAME_DESIGN.md` §9,
 * ADR-002 §6, ADR-013 §6.
 *
 * Eight hours at 20 Hz is 576,000 ticks; replaying them on load would hang
 * the app at the exact moment an idle game must feel effortless. Each system
 * instead advances CLOSED-FORM, under one asymmetric rule: the result may
 * be LESS than running the ticks for real, never MORE (`GAME_DESIGN.md`
 * §9.2 — the round-down rule). Concretely:
 *
 * - GROWTH is exact and free: crops derive maturity from `tick −
 *   plantedTick` (ADR-009), so advancing the tick IS the catch-up.
 * - ECONOMY recovery is exact: the batch multiplier form equals the stepped
 *   form (proven in 06a), applied over the PERIOD CROSSINGS the real
 *   scheduler would have fired.
 * - WORKER production is statistical and deliberately conservative: standing
 *   crops are harvested and replanted on a cycle whose handling cost is a
 *   named constant CHOSEN ABOVE the real simulation's per-cycle worker cost,
 *   so the model under-counts wherever workers are the bottleneck and
 *   converges with reality where growth is (the regime an 8-hour return
 *   actually lives in). Untilled ground is never newly planted, overflow
 *   fills worker carry-holds before anything sells, and sold units are
 *   priced at the WORST multiplier the real path could have reached — every
 *   approximation points down.
 * - The RNG stream is untouched: catch-up is closed-form arithmetic, not a
 *   replay (ADR-002 §Alternatives C rejected replay outright).
 *
 * Runs at the load boundary, after hydration, before the loop starts. Wall
 * clock enters exactly once, in `computeElapsedTicks` — the sim itself never
 * reads a clock (ADR-007 §1).
 */

import { OFFLINE_CAP_TICKS, TICK_MS } from '../shared/constants';
import type { ContentId } from '../shared/ids';
import { CORE_MARKET_STALL, CORE_REST_HUT, CORE_SEED_BIN } from '../sim/content/buildings';
import {
  acceptable,
  addItems,
  containerCount,
  removeItems,
  type Container,
} from '../sim/world/container';
import {
  MULTIPLIER_CAP,
  RECOVERY_PERIOD_TICKS,
  decayedMultiplier,
  multiplierOf,
  recoveredMultiplier,
  salePrice,
} from '../sim/world/economy';
import {
  ENERGY_DRAIN_PER_PERIOD,
  ENERGY_RECOVER_PER_PERIOD,
  REST_HUT_RECOVER_PER_PERIOD,
} from '../sim/world/worker';
import type { World } from '../sim/world/world';

/**
 * Worker time charged per harvest-and-replant cycle, in ticks.
 *
 * DELIBERATELY ABOVE the real simulation's per-cycle cost (harvest 30 + till 30
 * + plant 20 + movement, typically 90–160 ticks with deposit trips and replan
 * gaps amortized in): wherever worker time is the binding constraint, the
 * model must credit FEWER cycles than real workers achieve — the round-down
 * rule as a constant. At growth-bound saturation the margin costs only a few
 * percent (cycle = growthTicks + this, versus growthTicks + ~90–160 real).
 *
 * RAISED FROM 150 IN 07.9: harvesting now clears the tilling, so every real
 * cycle pays a 30-tick till it did not pay before (`GAME_DESIGN.md` §2.2). The
 * old constant would have slipped under the real cost on a busy farm and
 * started over-crediting — the one direction catch-up may never fail in.
 */
const CYCLE_HANDLING_TICKS = 200;

export interface CatchUpReport {
  readonly elapsedTicks: number;
  /** Crop harvests credited. */
  readonly harvests: number;
  /** Replants performed (each consumed one seed). */
  readonly replants: number;
  /** Items landed in storage, the inventory, or worker holds. */
  readonly itemsStored: number;
  /** Items auto-sold through the market stall. */
  readonly itemsSold: number;
  readonly coinsEarned: number;
  /** Set when production stopped early — the §9.4 "what blocked progress". */
  readonly blocked: { readonly reason: 'storage-full'; readonly atTick: number } | null;
}

const EMPTY_REPORT = (elapsedTicks: number): CatchUpReport => ({
  elapsedTicks,
  harvests: 0,
  replants: 0,
  itemsStored: 0,
  itemsSold: 0,
  coinsEarned: 0,
  blocked: null,
});

/**
 * Wall time → capped tick delta (`SAVE_FORMAT.md` §6.2). Negative elapsed
 * time — clock moved back, timezone change, manual edit — clamps to zero:
 * never an error, never a rewind (criterion 18).
 */
export function computeElapsedTicks(savedAtUnixMs: number, nowMs: number): number {
  const elapsedMs = nowMs - savedAtUnixMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(Math.floor(elapsedMs / TICK_MS), OFFLINE_CAP_TICKS);
}

/** Advances `world` by `elapsedTicks` of closed-form offline progress. */
export function catchUpWorld(world: World, elapsedTicks: number): CatchUpReport {
  if (elapsedTicks <= 0) return EMPTY_REPORT(0);

  const start = world.tick;
  const end = start + elapsedTicks;

  // Captured BEFORE recovery: sold units must be priced against the save-time
  // multiplier (see the sale block below for why that is the safe floor).
  const multiplierAtSave = new Map<ContentId, number>();
  for (const [item, value] of world.economy.multipliers) multiplierAtSave.set(item, value);

  // GROWTH — exact and free (ADR-009): the tick advance is the catch-up.
  world.tick = end;

  // ECONOMY — exact: recovery fires on tick % PERIOD === 0, so the batch form
  // gets the PERIOD CROSSINGS in (start, end], not floor(elapsed / period) —
  // an unaligned start would otherwise drift by one period.
  const periods =
    Math.floor(end / RECOVERY_PERIOD_TICKS) - Math.floor(start / RECOVERY_PERIOD_TICKS);
  if (periods > 0) {
    for (const [item, value] of world.economy.multipliers) {
      const recovered = recoveredMultiplier(value, periods);
      if (recovered >= MULTIPLIER_CAP) world.economy.multipliers.delete(item);
      else world.economy.multipliers.set(item, recovered);
    }
  }

  // WORKER PRODUCTION — statistical, floor everything.
  const workerCount = world.workers.size;
  if (workerCount === 0 || world.crops.size === 0) return EMPTY_REPORT(elapsedTicks);

  const hasRestHut = [...world.buildings.values()].some((b) => b.buildingId === CORE_REST_HUT);
  // Replanting is modeled ONLY through the seed bin's per-tile memory — the
  // real rule (06c): with a bin, workers replant the REMEMBERED crop; without
  // one they fall back to the default crop, which this model deliberately
  // does not simulate (found by the never-over property: crediting same-crop
  // replants that real workers would not perform OVER-credits a wheat tile
  // whose only seeds are wheat while the default is turnip).
  const hasSeedBin = [...world.buildings.values()].some((b) => b.buildingId === CORE_SEED_BIN);
  const recover = hasRestHut ? REST_HUT_RECOVER_PER_PERIOD : ENERGY_RECOVER_PER_PERIOD;
  // The §4.5 energy duty cycle: sustainable work fraction = recover/(recover+drain).
  let budget =
    workerCount * Math.floor((elapsedTicks * recover) / (recover + ENERGY_DRAIN_PER_PERIOD));

  // Deposit destinations: storage sheds (id order) then the player inventory.
  // The stall's pass-through container is NOT storage; worker carry-holds
  // buffer BEFORE anything sells, mirroring items real workers would still be
  // carrying — selling those would over-credit coins versus reality.
  const stallIds = new Set(
    [...world.buildings.values()]
      .filter((b) => b.buildingId === CORE_MARKET_STALL)
      .map((b) => b.id),
  );
  const hasStall = stallIds.size > 0;
  const storageTargets: Container[] = [...world.buildingStorage.entries()]
    .filter(([id]) => !stallIds.has(id))
    .sort(([a], [b]) => a - b)
    .map(([, container]) => container);
  storageTargets.push(world.inventory);
  const carryTargets: Container[] = [...world.workers.values()]
    .sort((a, b) => a.id - b.id)
    .map((worker) => worker.carrying);

  const stackSizeOf = (item: ContentId): number => {
    const definition = world.itemRegistry.get(item);
    return definition.ok ? definition.value.stackSize : 1;
  };

  let harvests = 0;
  let replants = 0;
  let itemsStored = 0;
  let itemsSold = 0;
  const sold = new Map<ContentId, number>();
  let blocked: CatchUpReport['blocked'] = null;

  // Deposits one yield stack: storage first, carry-holds next, stall last.
  // Returns false when nothing can take it — the storage-full blocker.
  const credit = (item: ContentId, quantity: number): boolean => {
    const stackSize = stackSizeOf(item);
    let remaining = quantity;
    for (const target of [...storageTargets, ...carryTargets]) {
      if (remaining <= 0) break;
      const { added } = addItems(target, item, remaining, stackSize);
      itemsStored += added;
      remaining -= added;
    }
    if (remaining > 0) {
      if (!hasStall) return false;
      sold.set(item, (sold.get(item) ?? 0) + remaining);
      itemsSold += remaining;
    }
    return true;
  };

  // A yield "fits somewhere" iff every stack has a home (or a stall exists).
  const canCredit = (stacks: readonly { item: ContentId; quantity: number }[]): boolean => {
    if (hasStall) return true;
    return stacks.every((stack) => {
      const space = [...storageTargets, ...carryTargets].reduce(
        (sum, target) => sum + acceptable(target, stack.item, stackSizeOf(stack.item)),
        0,
      );
      return space >= stack.quantity;
    });
  };

  const seedsConsumed = new Map<ContentId, number>();
  const seedsLeft = (seedItem: ContentId): number =>
    containerCount(world.inventory, seedItem) - (seedsConsumed.get(seedItem) ?? 0);

  // Standing crops in tile order — the model NEVER plants new ground (real
  // workers do; the omission only under-credits).
  outer: for (const crop of [...world.crops.values()].sort((a, b) => a.tile - b.tile)) {
    const definition = world.cropRegistry.get(crop.cropId);
    if (!definition.ok) continue;
    const { growthTicks, harvestYield, seedItem } = definition.value;

    // The k-th harvest lands at firstAt + k × cycle — always LATER than a
    // real worker standing next to the tile could manage (handling margin).
    const matureAt = crop.plantedTick + growthTicks;
    const firstAt = Math.max(matureAt, start) + CYCLE_HANDLING_TICKS;
    if (firstAt > end) continue; // still growing, or no time to work it
    const cycle = growthTicks + CYCLE_HANDLING_TICKS;

    const byGrowth = 1 + Math.floor((end - firstAt) / cycle);
    const bySeeds = 1 + seedsLeft(seedItem); // first harvest needs no seed
    const byBudget = Math.floor(budget / CYCLE_HANDLING_TICKS);
    const replantAllowed = hasSeedBin && world.lastPlanted.get(crop.tile) === crop.cropId;
    const count = replantAllowed
      ? Math.min(byGrowth, bySeeds, byBudget)
      : Math.min(1, byGrowth, byBudget);
    if (count <= 0) continue;

    // Credit harvest by harvest so the capacity blocker lands mid-stream
    // with an honest timestamp, not after the fact.
    let done = 0;
    for (let k = 0; k < count; k += 1) {
      if (!canCredit(harvestYield)) {
        blocked = { reason: 'storage-full', atTick: firstAt + k * cycle };
        break;
      }
      for (const stack of harvestYield) credit(stack.item, stack.quantity);
      done += 1;
    }

    budget -= done * CYCLE_HANDLING_TICKS;
    harvests += done;
    if (done > 0) {
      const replanted = Math.min(done - 1, seedsLeft(seedItem));
      // A final replant leaves the tile growing when a seed remains.
      const finalReplant =
        replantAllowed && seedsLeft(seedItem) - replanted > 0 && blocked === null;
      const consumed = replanted + (finalReplant ? 1 : 0);
      if (consumed > 0) {
        seedsConsumed.set(seedItem, (seedsConsumed.get(seedItem) ?? 0) + consumed);
        replants += consumed;
      }
      const lastHarvestAt = firstAt + (done - 1) * cycle;
      if (finalReplant) {
        world.crops.set(crop.tile, {
          cropId: crop.cropId,
          tile: crop.tile,
          plantedTick: Math.min(lastHarvestAt + CYCLE_HANDLING_TICKS, end),
        });
      } else {
        world.crops.delete(crop.tile); // harvested out, nothing to replant
        // …and the last harvest took the tilling with it, exactly as the real
        // command does (07.9). Without this, coming back from a gap would show
        // tilled soil the live game would have reverted — the model's state
        // has to be a state the simulation could have reached.
        world.tiles.tilledAt[crop.tile] = 0;
      }
    }

    if (blocked !== null) break outer;
  }

  // Consume the seeds the replants used — a conversion boundary (ADR-013 §7).
  for (const [seedItem, consumed] of seedsConsumed) {
    removeItems(world.inventory, seedItem, consumed);
  }

  // AUTO-SELL — §6.3, at prices that can only round DOWN versus reality:
  // every real sale happened at a multiplier ≥ decayed(saveTimeValue,
  // unitsSoldSoFar) ≥ decayed(saveTimeValue, totalUnits) — recovery only ever
  // raises it — so pricing EVERY unit at that floor cannot over-credit. The
  // end-state multiplier then takes the recovery the gap earned.
  let coinsEarned = 0;
  for (const [item, units] of sold) {
    const definition = world.itemRegistry.get(item);
    if (!definition.ok) continue;
    const floorMultiplier = decayedMultiplier(
      multiplierAtSave.get(item) ?? multiplierOf(world.economy, item),
      units,
    );
    coinsEarned += units * salePrice(definition.value.basePrice, floorMultiplier);
    const endMultiplier = recoveredMultiplier(floorMultiplier, periods);
    if (endMultiplier >= MULTIPLIER_CAP) world.economy.multipliers.delete(item);
    else world.economy.multipliers.set(item, endMultiplier);
  }
  // The offline sale boundary (ADR-013 §6) — the one declared source here.
  world.wallet.coins += coinsEarned;

  if (harvests > 0) {
    world.cropStats.harvested += harvests;
    world.cropStats.planted += replants;
    world.cropStats.lastActivityTick = end;
  }

  return {
    elapsedTicks,
    harvests,
    replants,
    itemsStored,
    itemsSold,
    coinsEarned,
    blocked,
  };
}
