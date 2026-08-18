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
import { allowsWork } from '../sim/ai/constraints';
import { CORE_MARKET_STALL, CORE_REST_HUT, CORE_SEED_BIN } from '../sim/content/buildings';
import { isInSeason, type CropDefinition } from '../sim/content/crops';
import { dayFor, phasesBetween, seasonsBetween } from '../sim/time/game-clock';
import {
  acceptable,
  addItems,
  containerCount,
  removeItems,
  type Container,
} from '../sim/world/container';
import {
  seasonalMultiplier,
  worstDemandOver,
  MULTIPLIER_CAP,
  RECOVERY_PERIOD_TICKS,
  decayedMultiplier,
  multiplierOf,
  recoveredMultiplier,
  salePrice,
} from '../sim/world/economy';
import {
  WorkerTaskKind,
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
  /** Crafts completed by factories while away (phase-25, ADR-035). */
  readonly crafts: number;
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
  crafts: 0,
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

/**
 * Whether a crop was plantable for the WHOLE of a gap. Phase-11b — ADR-021 §5.
 *
 * The rule is deliberately blunt: if the gap touched any season the crop
 * cannot be sown in, no replant is credited for that tile at all — not even
 * for the part of the gap that was in season.
 *
 * A finer model would segment the gap and credit each in-season stretch. It
 * would also have to decide what a worker was doing at each boundary, with
 * every wrong guess landing on the side that credits work the real simulation
 * would have refused. ADR-021 §5 settles it: *"where the model cannot be
 * certain it credits nothing."* The cost is under-crediting a player who was
 * away across a boundary; the alternative is the over-credit that took a
 * property test months to find in phase-09.
 *
 * The first harvest of a standing crop is unaffected — it consumes no seed and
 * plants nothing, and ADR-021 §3 guarantees a standing crop matures regardless
 * of season.
 */
function plantableThroughout(
  world: World,
  definition: CropDefinition,
  startTick: number,
  endTick: number,
): boolean {
  if (definition.seasons.length === 0) return true;

  const touched = seasonsBetween(
    dayFor(startTick, world.ticksPerDay),
    dayFor(endTick, world.ticksPerDay),
    world.daysPerSeason,
    world.seasons.length,
  );
  // No season system at all — nothing to be out of step with.
  if (touched.length === 0) return true;

  return touched.every((index) => isInSeason(definition, world.seasons[index]));
}

/**
 * Whether ANY worker could legally have worked this tile. Phase-14d — ADR-024.
 *
 * Catch-up models what workers would have done, so a schedule that forbids the
 * work forbids the credit. The question is asked of the whole crew rather than
 * per worker, because the model never decided WHICH worker did a cycle — and
 * asking "could anyone" is the conservative direction: it credits at most what
 * the real simulation could have produced, never more.
 *
 * A crew with no workers answers false, which is already the model's own
 * precondition, and an unconstrained crew answers true — so a save written
 * before schedules existed is credited exactly as it was.
 */
function anyWorkerMayWork(
  world: World,
  tile: number,
  kind: WorkerTaskKind,
  startTick: number,
  endTick: number,
): boolean {
  // ACROSS THE WINDOW, not at an instant. The first version of this asked
  // `phaseFor(world.tick)` — one phase, applied to up to eight hours — and a
  // crew on shift for one phase in four was credited exactly what an
  // unconstrained crew earned. That is ADR-024 §4's over-credit, and it was
  // invisible because the zone case cannot expose it: a zone does not change
  // with the clock, so evaluating it once is correct.
  //
  // The same shape `plantableThroughout` already used for seasons, two
  // functions up.
  const phases = phasesBetween(startTick, endTick, world.ticksPerDay);

  for (const worker of world.workers.values()) {
    // "Throughout" per worker rather than per phase: crediting a cycle needs
    // ONE worker who could have done it for the whole window, not a relay of
    // workers who each could have done part of it. The model never decided
    // which worker did a cycle, so it may not assume a handover.
    if (phases.every((phase) => allowsWork(worker.schedule, { kind, tile, phase }))) return true;
  }
  return false;
}

/**
 * Advances every factory across the gap. Phase-25 — ADR-035, §9.2.
 *
 * EXACT, not statistical, and that is worth stating because everything else in
 * this file is an approximation. A factory's three limits are all FIXED for the
 * duration of a gap: the ticks available, the inputs it already holds, and the
 * space already in its output. Nothing delivers to a factory while the player
 * is away — logistics does not exist yet — so the smallest of those three is
 * the answer rather than an estimate of it.
 *
 * **Phase 26 ends that.** Once haulers move goods between buildings, inputs
 * grow during the gap and a chain has to be modelled: an upstream mill's output
 * becomes a downstream kitchen's input at a rate that depends on both. The
 * round-down rule will then bind here the way it binds worker production, and
 * `tests/catch-up-factories.test.ts` is written so that transition surfaces as
 * failures rather than as silence.
 *
 * The completion test is `>` rather than `>=` — a craft must finish STRICTLY
 * inside the gap to be credited. That is the same margin the crop model keeps
 * and the same place its 09c over-credit lived: crediting work that lands
 * exactly on the boundary is crediting a tick the player was not away for.
 */
function catchUpFactories(world: World, start: number, end: number): number {
  let crafted = 0;

  // Building-id order, matching `productionSystem` — a catch-up whose result
  // depended on Map insertion order would not survive a save round-trip.
  for (const [, factory] of [...world.factories.entries()].sort(([a], [b]) => a - b)) {
    if (factory.recipeId === null) continue;
    const found = world.recipeRegistry.get(factory.recipeId);
    if (!found.ok) continue; // a source was uninstalled; the goods stay put
    const recipe = found.value;

    const stackSize = (item: ContentId): number => {
      const definition = world.itemRegistry.get(item);
      return definition.ok ? definition.value.stackSize : 1;
    };

    // TIME. A craft already running finishes at its own tick; the ones after it
    // follow at the recipe's cadence.
    const firstAt = (factory.startedTick ?? start) + recipe.craftTicks;
    if (firstAt > end) continue;
    const byTime = 1 + Math.floor((end - firstAt) / recipe.craftTicks);

    // INPUTS. The running craft's have already been consumed, so it needs none.
    const running = factory.startedTick === null ? 0 : 1;
    let byInputs = Number.POSITIVE_INFINITY;
    for (const stack of recipe.inputs) {
      byInputs = Math.min(
        byInputs,
        running + Math.floor(containerCount(factory.input, stack.item) / stack.quantity),
      );
    }
    if (recipe.inputs.length === 0) byInputs = Number.POSITIVE_INFINITY;

    // OUTPUT SPACE. Rule A across a gap: nothing is consumed that could not
    // have been delivered.
    let byOutput = Number.POSITIVE_INFINITY;
    for (const stack of recipe.outputs) {
      byOutput = Math.min(
        byOutput,
        Math.floor(acceptable(factory.output, stack.item, stackSize(stack.item)) / stack.quantity),
      );
    }

    const count = Math.min(byTime, byInputs, byOutput);
    if (count <= 0) continue;

    // Apply. The running craft consumed its inputs before the gap began, so
    // only the crafts STARTED during it pay for theirs.
    for (const stack of recipe.inputs) {
      removeItems(factory.input, stack.item, stack.quantity * (count - running));
    }
    for (const stack of recipe.outputs) {
      addItems(factory.output, stack.item, stack.quantity * count, stackSize(stack.item));
    }

    factory.startedTick = null;
    // Re-examined on the first live tick rather than sitting out a back-off
    // that was entered before the player left.
    factory.replanTick = end;
    crafted += count;
  }

  return crafted;
}

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

  // FACTORIES — exact, and independent of the worker model below: nothing
  // delivers to a factory during a gap, so its production depends on no other
  // system's outcome (ADR-035; the honest limit is stated on the helper).
  const crafts = catchUpFactories(world, start, end);

  // WORKER PRODUCTION — statistical, floor everything.
  const workerCount = world.workers.size;
  // A farm with no crew, or nothing planted, still has factories: they were
  // advanced above and their crafts must be reported rather than dropped by an
  // early return written before factories existed.
  if (workerCount === 0 || world.crops.size === 0) {
    return { ...EMPTY_REPORT(elapsedTicks), crafts };
  }

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
    if (firstAt >= end) continue; // still growing, or no time to work it
    const cycle = growthTicks + CYCLE_HANDLING_TICKS;

    // A cycle counts only if it completes STRICTLY INSIDE the gap. Crediting
    // one that lands exactly on `end` is the one place this model left itself
    // no margin, and it is where the 09c over-credit lived.
    //
    // Tiles are scheduled here INDEPENDENTLY, each at its own full cadence, as
    // though a worker were dedicated to it — the only shared limit is the
    // energy budget, and at eight hours that never binds. One worker serving
    // two tiles cannot actually do that: measured, a one-worker two-tile farm
    // achieves 13 harvests where this credited 14, and the same farm with two
    // workers achieves 14. Requiring the last cycle to finish before the
    // window closes restores the margin that sharing consumes, costs at most
    // one harvest per tile, and keeps every approximation pointing down
    // (`GAME_DESIGN.md` §9.2).
    //
    // Modelling worker sharing properly — dividing cadence by tiles-per-worker
    // — was rejected as far too conservative: it would credit a fraction of
    // what a real return earns, and offline progress that reads as broken is
    // worse than one it slightly under-counts.
    const byGrowth = 1 + Math.floor(Math.max(0, end - firstAt - 1) / cycle);
    const bySeeds = 1 + seedsLeft(seedItem); // first harvest needs no seed
    const byBudget = Math.floor(budget / CYCLE_HANDLING_TICKS);
    // A schedule that forbids the work forbids the credit (ADR-024 §4). Asked
    // of the whole crew, which is the conservative direction — the model never
    // decided which worker did a cycle.
    if (!anyWorkerMayWork(world, crop.tile, WorkerTaskKind.Harvest, start, end)) continue;

    const replantAllowed =
      hasSeedBin &&
      world.lastPlanted.get(crop.tile) === crop.cropId &&
      plantableThroughout(world, definition.value, start, end) &&
      anyWorkerMayWork(world, crop.tile, WorkerTaskKind.Plant, start, end);
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
      const lastHarvestAt = firstAt + (done - 1) * cycle;
      const replanted = Math.min(done - 1, seedsLeft(seedItem));
      // A final replant leaves the tile growing when a seed remains AND there
      // is time to get it into the ground before the window closes.
      //
      // THE TIME CHECK IS THE FIX FOR THE 09c OVER-CREDIT. Without it this
      // credited a planting the real simulation had no time to perform, and
      // then back-dated it to `end` with a `Math.min` — which is the shape of
      // the bug: a clamp that quietly accepts an impossible timestamp instead
      // of refusing the action that produced it. It over-credited
      // `cropStats.planted` by exactly one whenever the last harvest landed
      // within `CYCLE_HANDLING_TICKS` of the end of the gap, which is why it
      // took an unseeded property test months to find.
      const finalReplant =
        replantAllowed &&
        seedsLeft(seedItem) - replanted > 0 &&
        blocked === null &&
        lastHarvestAt + CYCLE_HANDLING_TICKS <= end;
      const consumed = replanted + (finalReplant ? 1 : 0);
      if (consumed > 0) {
        seedsConsumed.set(seedItem, (seedsConsumed.get(seedItem) ?? 0) + consumed);
        replants += consumed;
      }
      if (finalReplant) {
        world.crops.set(crop.tile, {
          cropId: crop.cropId,
          tile: crop.tile,
          plantedTick: lastHarvestAt + CYCLE_HANDLING_TICKS,
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
    // The season at the END of the gap, which is where the sale lands. Using
    // the season at the start would credit a price the market no longer pays.
    // Demand joins at the LOWEST spell the gap touched (ADR-033 §4) — the
    // real sales happened at unknowable points across the gap's spells, and
    // demand is queryable history (a hash), so the conservative bound is
    // exact rather than assumed: never above any spell the gap saw, and
    // equal to the truth whenever the gap sat inside one spell.
    coinsEarned +=
      units *
      salePrice(
        definition.value.basePrice,
        floorMultiplier,
        seasonalMultiplier(world, item),
        worstDemandOver(world, item, start, end),
      );
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
    crafts,
    itemsStored,
    itemsSold,
    coinsEarned,
    blocked,
  };
}
