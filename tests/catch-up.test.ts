/**
 * Offline progress. Phase-07d — `SAVE_FORMAT.md` §6, `GAME_DESIGN.md` §9,
 * acceptance criteria 14, 15, 16, 17, 18.
 *
 * THE critical property is 14's asymmetry: catch-up must NEVER credit more
 * than running the same ticks for real — returning to slightly more than
 * expected is a pleasant surprise; returning to less than the game implied
 * is a trust problem. It is asserted here as a fast-check property over
 * arbitrary farms at n ∈ {100, 1,000, 50,000}, comparing the closed-form
 * result against the real simulation on a byte-identical clone.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { catchUpWorld, computeElapsedTicks } from '../src/persistence/catch-up';
import { hydrateWorld } from '../src/persistence/deserialize';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import type { SaveMeta } from '../src/persistence/schema';
import { OFFLINE_CAP_TICKS, TICK_MS } from '../src/shared/constants';
import { asTileIndex } from '../src/shared/ids';
import {
  CORE_MARKET_STALL,
  CORE_REST_HUT,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
} from '../src/sim/content/buildings';
import { CORE_CARROT, CORE_TURNIP, CORE_WHEAT } from '../src/sim/content/crops';
import { CORE_TURNIP_SEED, CORE_WHEAT_SEED } from '../src/sim/content/items';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems, containerTotal } from '../src/sim/world/container';
import { multiplierOf } from '../src/sim/world/economy';
import { setBlocked, setOwned } from '../src/sim/world/tile-grid';
import { createWorker } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

/** A byte-identical twin, via the proven round trip. */
function cloneWorld(world: World): World {
  return hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);
}

interface FarmPlan {
  readonly seed: number;
  readonly startTick: number;
  readonly workerCount: number;
  readonly hasShed: boolean;
  readonly hasStall: boolean;
  readonly hasRestHut: boolean;
  readonly hasSeedBin: boolean;
  readonly crops: readonly { readonly kind: number; readonly ageFraction: number }[];
  readonly wheatSeeds: number;
  readonly turnipSeeds: number;
  readonly depressedWheat: boolean;
}

/**
 * The seed both never-over properties run from. Phase-09c, closing debt #14.
 *
 * `TESTING.md` §6.2: always pass an explicit seed. These two were the only
 * properties in this file without one, and the cost was real — the gate passed
 * by SAMPLING for months while two over-credit defects sat under it, and it was
 * green or red between runs on the same commit.
 *
 * The tradeoff is stated rather than hidden: a pinned seed explores one fixed
 * set of farms, so it no longer discovers new counterexamples on its own. That
 * is the right trade for a RELEASE GATE, whose job is to answer the same
 * question the same way every time. Broad exploration belongs in a deliberate
 * run — change this constant, run it, and pin anything it finds as its own
 * regression above, which is exactly how the two current regressions arrived.
 */
const PROPERTY_SEED = 20_260_808;

const CROP_KINDS = [CORE_TURNIP, CORE_WHEAT, CORE_CARROT] as const;

const farmArb: fc.Arbitrary<FarmPlan> = fc.record({
  seed: fc.integer({ min: 1, max: 0x7fffffff }),
  startTick: fc.integer({ min: 0, max: 500_000 }),
  workerCount: fc.integer({ min: 0, max: 3 }),
  hasShed: fc.boolean(),
  hasStall: fc.boolean(),
  hasRestHut: fc.boolean(),
  hasSeedBin: fc.boolean(),
  crops: fc.array(
    fc.record({
      kind: fc.integer({ min: 0, max: CROP_KINDS.length - 1 }),
      // 0 = just planted, 1+ = already mature at save time.
      ageFraction: fc.double({ min: 0, max: 1.5, noNaN: true }),
    }),
    { maxLength: 8 },
  ),
  wheatSeeds: fc.integer({ min: 0, max: 40 }),
  turnipSeeds: fc.integer({ min: 0, max: 40 }),
  depressedWheat: fc.boolean(),
});

/** Builds a coherent live farm from a plan — the states a session can reach. */
function buildFarm(plan: FarmPlan): World {
  const world = createWorld(plan.seed);
  world.tick = plan.startTick;

  const tile = (x: number, y: number): number => y * world.tiles.width + x;
  for (let y = 28; y < 36; y += 1) {
    for (let x = 28; x < 36; x += 1) setOwned(world.tiles, asTileIndex(tile(x, y)), true);
  }

  const buildings = [
    ...(plan.hasShed ? [{ at: tile(28, 28), kind: CORE_STORAGE_SHED }] : []),
    ...(plan.hasStall ? [{ at: tile(35, 28), kind: CORE_MARKET_STALL }] : []),
    ...(plan.hasRestHut ? [{ at: tile(28, 35), kind: CORE_REST_HUT }] : []),
    ...(plan.hasSeedBin ? [{ at: tile(35, 35), kind: CORE_SEED_BIN }] : []),
  ];
  for (const spec of buildings) {
    const id = world.ids.allocateBuilding();
    const at = asTileIndex(spec.at);
    world.buildings.set(id, { id, tile: at, buildingId: spec.kind });
    setBlocked(world.tiles, at, true);
    const definition = world.buildingRegistry.get(spec.kind);
    const slots = definition.ok ? (definition.value.storageSlots ?? 0) : 0;
    if (slots > 0) world.buildingStorage.set(id, { stacks: [], capacity: slots });
  }

  for (const [i, spec] of plan.crops.entries()) {
    const at = asTileIndex(tile(29 + (i % 5), 30 + Math.floor(i / 5)));
    const cropId = CROP_KINDS[spec.kind] ?? CORE_WHEAT;
    const definition = world.cropRegistry.get(cropId);
    if (!definition.ok) continue;
    const age = Math.floor(definition.value.growthTicks * spec.ageFraction);
    world.tiles.tilledAt[at] = 1;
    world.crops.set(at, { cropId, tile: at, plantedTick: Math.max(0, world.tick - age) });
    // Every real plant writes the seed bin's memory (06c) — a standing crop
    // without one is a state the shipped game cannot reach.
    world.lastPlanted.set(at, cropId);
  }

  for (let i = 0; i < plan.workerCount; i += 1) {
    const worker = createWorker(world.ids.allocateWorker(), asTileIndex(tile(32, 32 + i)));
    world.workers.set(worker.id, worker);
  }

  if (plan.wheatSeeds > 0) addItems(world.inventory, CORE_WHEAT_SEED, plan.wheatSeeds, 99);
  if (plan.turnipSeeds > 0) addItems(world.inventory, CORE_TURNIP_SEED, plan.turnipSeeds, 99);
  if (plan.depressedWheat) world.economy.multipliers.set(CORE_WHEAT, 0.7);

  return world;
}

describe('computeElapsedTicks', () => {
  it('converts wall time to ticks, floored', () => {
    expect(computeElapsedTicks(1_000, 1_000 + 10 * TICK_MS)).toBe(10);
    expect(computeElapsedTicks(1_000, 1_000 + 10 * TICK_MS + 49)).toBe(10);
  });

  it('clamps negative elapsed time to zero — never rewinds (crit 18)', () => {
    expect(computeElapsedTicks(2_000_000, 1_000_000)).toBe(0);
    expect(computeElapsedTicks(1_000, 1_000)).toBe(0);
  });

  it('caps at 8 hours (crit — the §9.3 cap)', () => {
    const tenHoursMs = 10 * 60 * 60 * 1000;
    expect(computeElapsedTicks(0, tenHoursMs)).toBe(OFFLINE_CAP_TICKS);
  });
});

describe('catchUpWorld — exact halves', () => {
  it('is a no-op at zero elapsed ticks', () => {
    const world = buildFarm(fc.sample(farmArb, { numRuns: 1, seed: 3 })[0]!);
    const before = serializeSave(toSaveDocument(world, META));
    const report = catchUpWorld(world, 0);
    expect(serializeSave(toSaveDocument(world, META))).toBe(before);
    expect(report.harvests).toBe(0);
  });

  it('growth and price recovery match the real simulation exactly when no workers act', () => {
    // With no workers, the ONLY things that move are the tick (growth is
    // derived — ADR-009) and multiplier recovery. Both must be EXACT,
    // including the period-crossing arithmetic at unaligned start ticks.
    fc.assert(
      fc.property(
        farmArb.map((plan): FarmPlan => ({ ...plan, workerCount: 0, hasStall: false })),
        fc.integer({ min: 1, max: 3_000 }),
        (plan, ticks) => {
          const model = buildFarm(plan);
          const real = cloneWorld(model);

          catchUpWorld(model, ticks);
          stepSimulationBy(real, ticks);

          expect(model.tick).toBe(real.tick);
          expect(multiplierOf(model.economy, CORE_WHEAT)).toBe(
            multiplierOf(real.economy, CORE_WHEAT),
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('catch-up never over-credits versus the real simulation (crit 14)', () => {
  const assertNeverOver = (plan: FarmPlan, ticks: number): void => {
    const model = buildFarm(plan);
    const real = cloneWorld(model);
    const coinsBefore = model.wallet.coins;

    const report = catchUpWorld(model, ticks);
    stepSimulationBy(real, ticks);

    expect(model.cropStats.harvested).toBeLessThanOrEqual(real.cropStats.harvested);
    expect(model.cropStats.planted).toBeLessThanOrEqual(real.cropStats.planted);
    expect(model.wallet.coins - coinsBefore).toBeLessThanOrEqual(real.wallet.coins - coinsBefore);
    expect(report.coinsEarned).toBe(model.wallet.coins - coinsBefore);
  };

  // Regression, phase-09c. fast-check found this farm on seed 1435051507 and
  // it over-credited cropStats.PLANTED by one: the model credited a final
  // replant for which the window had no time, then back-dated it to `end` with
  // a Math.min. Pinned rather than left to sampling, per TESTING.md §6.2.
  it('does not credit a replant the window had no time for (over-credit regression)', () => {
    assertNeverOver(
      {
        seed: 1,
        startTick: 0,
        workerCount: 1,
        hasShed: false,
        hasStall: false,
        hasRestHut: false,
        hasSeedBin: true,
        crops: [
          { kind: 0, ageFraction: 0 },
          { kind: 1, ageFraction: 0 },
        ],
        wheatSeeds: 10,
        turnipSeeds: 2,
        depressedWheat: false,
      },
      50_000,
    );
  });

  // Both counterexamples fast-check found, pinned as regressions rather than
  // left to sampling (`TESTING.md` §6.2). They wore one symptom and were two
  // defects: the first over-credited PLANTED, the second HARVESTED.
  it('does not credit a replant the window had no time for (planted, 09c)', () => {
    assertNeverOver(
      {
        seed: 1,
        startTick: 0,
        workerCount: 1,
        hasShed: false,
        hasStall: false,
        hasRestHut: false,
        hasSeedBin: true,
        crops: [
          { kind: 0, ageFraction: 0 },
          { kind: 1, ageFraction: 0 },
        ],
        wheatSeeds: 10,
        turnipSeeds: 2,
        depressedWheat: false,
      },
      50_000,
    );
  });

  // One worker, two tiles. The model schedules each tile at its own full
  // cadence, as though a worker were dedicated to it; measured, this farm
  // achieves 13 harvests and the same farm with TWO workers achieves 14.
  it('does not credit a cycle that only a second worker could have run (harvested, 09c)', () => {
    assertNeverOver(
      {
        seed: 1,
        startTick: 0,
        workerCount: 1,
        hasShed: false,
        hasStall: false,
        hasRestHut: false,
        hasSeedBin: true,
        crops: [
          { kind: 1, ageFraction: 0 },
          { kind: 0, ageFraction: 0 },
        ],
        wheatSeeds: 9,
        turnipSeeds: 3,
        depressedWheat: false,
      },
      50_000,
    );
  });

  it('holds at n = 100 and n = 1,000 across arbitrary farms', () => {
    fc.assert(fc.property(farmArb, fc.constantFrom(100, 1_000), assertNeverOver), {
      numRuns: 24,
      seed: PROPERTY_SEED,
    });
  });

  // Eight arbitrary farms, each stepped 50,000 real ticks for the comparison,
  // comfortably inside the default budget uninstrumented — but V8 coverage
  // instrumentation costs roughly 3.5×, which is how this passed `npm test`
  // and failed `npm run test:coverage` unnoticed until phase-07e ran the full
  // v0.1 release-gate checklist. The budget is the runner's, not the game's.
  it('holds at n = 50,000 across arbitrary farms', () => {
    fc.assert(fc.property(farmArb, fc.constant(50_000), assertNeverOver), {
      numRuns: 8,
      seed: PROPERTY_SEED,
    });
  }, 600_000);
});

describe('accuracy at saturation (crit 15)', () => {
  it('a mature farm over a long gap lands within the tolerance band, under', () => {
    // The regime the product actually lives in: hours away, standing crops,
    // seeds stocked, storage available. The statistical model must land
    // CLOSE to the real simulation here — and under it, never over.
    const plan: FarmPlan = {
      seed: 424_242,
      startTick: 100_000,
      workerCount: 3,
      hasShed: true,
      hasStall: true,
      hasRestHut: true,
      hasSeedBin: true,
      crops: [
        { kind: 0, ageFraction: 1.2 },
        { kind: 0, ageFraction: 0.8 },
        { kind: 1, ageFraction: 1.0 },
        { kind: 1, ageFraction: 0.5 },
        { kind: 1, ageFraction: 0.1 },
        { kind: 2, ageFraction: 0.9 },
      ],
      wheatSeeds: 40,
      turnipSeeds: 40,
      depressedWheat: false,
    };
    const model = buildFarm(plan);
    const real = cloneWorld(model);

    catchUpWorld(model, 50_000);
    stepSimulationBy(real, 50_000);

    expect(model.cropStats.harvested).toBeLessThanOrEqual(real.cropStats.harvested);
    // The documented worker tolerance (±10%, rounded down): ≥ 90% of real.
    expect(model.cropStats.harvested).toBeGreaterThanOrEqual(
      Math.floor(real.cropStats.harvested * 0.9),
    );
  });
});

describe('bounds and blockers (crit 17)', () => {
  it('with no stall and storage full, production stops and the blocker is reported', () => {
    const plan: FarmPlan = {
      seed: 7,
      startTick: 10_000,
      workerCount: 2,
      hasShed: false, // inventory only — 40 slots
      hasStall: false,
      hasRestHut: false,
      hasSeedBin: false,
      crops: Array.from({ length: 8 }, () => ({ kind: 0, ageFraction: 1.1 })),
      wheatSeeds: 0,
      turnipSeeds: 40,
      depressedWheat: false,
    };
    const model = buildFarm(plan);
    // No room anywhere: every inventory slot full, every carry-hold full —
    // the state a farm reaches when nobody empties it for hours.
    addItems(model.inventory, CORE_WHEAT_SEED, 40 * 99, 99);
    for (const worker of model.workers.values()) addItems(worker.carrying, CORE_WHEAT, 20, 99);

    const report = catchUpWorld(model, 50_000);
    expect(report.blocked).not.toBeNull();
    expect(report.blocked?.reason).toBe('storage-full');
    expect(report.harvests).toBe(0); // nowhere to put a single yield
    expect(containerTotal(model.inventory)).toBeGreaterThan(0); // nothing deleted
  });

  it('with a stall, overflow sells instead of blocking, and coins arrive', () => {
    const plan: FarmPlan = {
      seed: 7,
      startTick: 10_000,
      workerCount: 2,
      hasShed: false,
      hasStall: true,
      hasRestHut: false,
      hasSeedBin: false,
      crops: Array.from({ length: 6 }, () => ({ kind: 0, ageFraction: 1.1 })),
      wheatSeeds: 0,
      turnipSeeds: 40,
      depressedWheat: false,
    };
    const model = buildFarm(plan);
    addItems(model.inventory, CORE_WHEAT_SEED, 40 * 99, 99);
    for (const worker of model.workers.values()) addItems(worker.carrying, CORE_WHEAT, 20, 99);

    const before = model.wallet.coins;
    const report = catchUpWorld(model, 50_000);
    expect(report.blocked).toBeNull();
    expect(report.itemsSold).toBeGreaterThan(0);
    expect(model.wallet.coins).toBeGreaterThan(before);
  });

  it('replants consume seeds and stop when the stock runs out', () => {
    const plan: FarmPlan = {
      seed: 11,
      startTick: 0,
      workerCount: 2,
      hasShed: true,
      hasStall: true,
      hasRestHut: true,
      hasSeedBin: true, // replanting is the bin's feature — the model requires it
      crops: [{ kind: 0, ageFraction: 1.0 }], // one turnip tile
      wheatSeeds: 0,
      turnipSeeds: 2,
      depressedWheat: false,
    };
    const model = buildFarm(plan);
    const report = catchUpWorld(model, OFFLINE_CAP_TICKS); // hours — seeds bind
    expect(report.replants).toBeLessThanOrEqual(2);
    expect(report.harvests).toBeLessThanOrEqual(3); // first + one per seed
  });
});

describe('performance (crit 16)', () => {
  it('completes in under 50 ms at the 8-hour cap', () => {
    const plan = fc.sample(farmArb, { numRuns: 1, seed: 99 })[0]!;
    const world = buildFarm({ ...plan, workerCount: 3, hasShed: true, hasStall: true });
    const started = performance.now();
    catchUpWorld(world, OFFLINE_CAP_TICKS);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
