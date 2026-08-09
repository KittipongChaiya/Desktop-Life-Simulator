/**
 * The round trip. Phase-07a — acceptance criteria 1, 2, 13.
 *
 * Three properties over ARBITRARY worlds, and they are the phase:
 *
 * 1. ROUND TRIP — `hydrate(toSave(w))` carries exactly the state `w` carried.
 * 2. BYTE-STABILITY — the same world serializes to identical bytes, twice,
 *    and through a full round trip.
 * 3. CONTINUE-IDENTICALLY — the hydrated world and the never-saved world,
 *    stepped the same number of ticks, remain byte-identical (workers move,
 *    harvest, deposit; the economy sweeps stalls; the RNG streams on
 *    mid-sequence). This is ADR-007's determinism property extended across
 *    the disk boundary (ADR-015 §6) — the reason `energyTimer`, `replanTick`,
 *    stack order, and the allocator counters are all persisted.
 *
 * Worlds are CONSTRUCTED with invariants intact (buildings block their tiles,
 * every id came from the allocator, multipliers are exact 3-decimal values in
 * band) — the states a real session can reach, arbitrarily far along.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { hydrateWorld } from '../src/persistence/deserialize';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import {
  CURRENT_SCHEMA_VERSION,
  SAVE_MAGIC,
  type SaveDocument,
  type SaveMeta,
} from '../src/persistence/schema';
import { asTileIndex } from '../src/shared/ids';
import {
  CORE_MARKET_STALL,
  CORE_REST_HUT,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
} from '../src/sim/content/buildings';
import { CORE_CARROT, CORE_PUMPKIN, CORE_TURNIP, CORE_WHEAT } from '../src/sim/content/crops';
import { CORE_CARROT_SEED, CORE_TURNIP_SEED, CORE_WHEAT_SEED } from '../src/sim/content/items';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems } from '../src/sim/world/container';
import { setBlocked, setOwned } from '../src/sim/world/tile-grid';
import { WorkerState, WorkerTaskKind, createWorker } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

const CROPS = [CORE_TURNIP, CORE_WHEAT, CORE_CARROT, CORE_PUMPKIN] as const;
const ITEMS = [CORE_WHEAT, CORE_TURNIP, CORE_WHEAT_SEED, CORE_TURNIP_SEED, CORE_CARROT_SEED];
const BUILDINGS = [CORE_STORAGE_SHED, CORE_REST_HUT, CORE_SEED_BIN, CORE_MARKET_STALL] as const;

/** Everything a random world is built from — one draw, fully deterministic. */
interface WorldPlan {
  readonly seed: number;
  readonly tick: number;
  readonly coins: number;
  readonly expansions: number;
  /** A pool of distinct tiles, partitioned below by slicing. */
  readonly tiles: readonly number[];
  readonly cropCount: number;
  readonly buildingCount: number;
  readonly workers: readonly {
    readonly state: number;
    readonly energy: number;
    readonly energyTimer: number;
    readonly taskKind: number; // -1 = no task
    readonly carryQty: number;
  }[];
  readonly inventoryQtys: readonly number[];
  readonly multipliers: readonly { readonly item: number; readonly thousandths: number }[];
  readonly stats: readonly [number, number, number];
}

const planArb: fc.Arbitrary<WorldPlan> = fc.record({
  seed: fc.integer({ min: 1, max: 0x7fffffff }),
  tick: fc.integer({ min: 0, max: 1_000_000 }),
  coins: fc.integer({ min: 0, max: 100_000 }),
  expansions: fc.integer({ min: 0, max: 5 }),
  tiles: fc.uniqueArray(fc.integer({ min: 0, max: 4095 }), { minLength: 30, maxLength: 30 }),
  cropCount: fc.integer({ min: 0, max: 10 }),
  buildingCount: fc.integer({ min: 0, max: 6 }),
  workers: fc.array(
    fc.record({
      state: fc.integer({ min: 0, max: 4 }),
      energy: fc.integer({ min: 0, max: 100 }),
      energyTimer: fc.integer({ min: 0, max: 19 }),
      taskKind: fc.integer({ min: -1, max: 2 }),
      carryQty: fc.integer({ min: 0, max: 20 }),
    }),
    { maxLength: 4 },
  ),
  inventoryQtys: fc.array(fc.integer({ min: 1, max: 200 }), { maxLength: 5 }),
  multipliers: fc.array(
    fc.record({
      item: fc.integer({ min: 0, max: ITEMS.length - 1 }),
      thousandths: fc.integer({ min: 500, max: 999 }),
    }),
    { maxLength: 3 },
  ),
  stats: fc.tuple(
    fc.integer({ min: 0, max: 50_000 }),
    fc.integer({ min: 0, max: 50_000 }),
    fc.integer({ min: 0, max: 1_000_000 }),
  ),
});

/** Builds a live world from a plan, through the invariant-preserving paths. */
function buildWorld(plan: WorldPlan): World {
  const world = createWorld(plan.seed);
  world.tick = plan.tick;

  // Stir the RNG so its state is mid-stream, not the seed expansion.
  for (let i = 0; i < plan.tick % 97; i += 1) world.rng.next();

  const pool = plan.tiles.map(asTileIndex);
  const cropTiles = pool.slice(0, plan.cropCount);
  const buildingTiles = pool.slice(10, 10 + plan.buildingCount);
  const workerTiles = pool.slice(16, 16 + plan.workers.length);
  const tilledTiles = pool.slice(20, 26);
  const rememberedTiles = pool.slice(26, 30);

  for (const tile of pool) setOwned(world.tiles, tile, true);

  for (const [i, tile] of tilledTiles.entries()) {
    world.tiles.tilledAt[tile] = Math.max(0, plan.tick - i * 7);
    // Phase-12b: `moisture` was removed and `wateredAt` replaces it. Populated
    // here for the same reason moisture was — a grid field that is always zero
    // round-trips correctly even when the codec is wrong.
    world.tiles.wateredAt[tile] = Math.max(0, plan.tick - i * 11);
  }

  for (const [i, tile] of cropTiles.entries()) {
    const cropId = CROPS[i % CROPS.length] ?? CORE_WHEAT;
    world.crops.set(tile, { cropId, tile, plantedTick: Math.max(0, plan.tick - i * 111) });
  }

  for (const [i, tile] of buildingTiles.entries()) {
    const buildingId = BUILDINGS[i % BUILDINGS.length] ?? CORE_STORAGE_SHED;
    const id = world.ids.allocateBuilding();
    world.buildings.set(id, { id, tile, buildingId });
    setBlocked(world.tiles, tile, true);
    const definition = world.buildingRegistry.get(buildingId);
    const slots = definition.ok ? (definition.value.storageSlots ?? 0) : 0;
    if (slots > 0) {
      const container = { stacks: [], capacity: slots } as {
        stacks: { item: (typeof ITEMS)[number]; quantity: number }[];
        capacity: number;
      };
      world.buildingStorage.set(id, container);
      addItems(container, ITEMS[i % ITEMS.length] ?? CORE_WHEAT, (i + 1) * 9, 99);
    }
  }

  for (const [i, spec] of plan.workers.entries()) {
    const position = workerTiles[i] ?? asTileIndex(0);
    const worker = createWorker(world.ids.allocateWorker(), position);
    const states = [
      WorkerState.Idle,
      WorkerState.Moving,
      WorkerState.Working,
      WorkerState.SeekingRest,
      WorkerState.Rest,
    ] as const;
    worker.state = states[spec.state] ?? WorkerState.Idle;
    worker.energy = spec.energy;
    worker.energyTimer = spec.energyTimer;
    worker.replanTick = plan.tick + (i % 20);
    if (spec.taskKind >= 0) {
      const kinds = [WorkerTaskKind.Harvest, WorkerTaskKind.Plant, WorkerTaskKind.Till] as const;
      const kind = kinds[spec.taskKind] ?? WorkerTaskKind.Till;
      const target = cropTiles[0] ?? tilledTiles[0] ?? position;
      worker.task =
        kind === WorkerTaskKind.Plant
          ? { kind, tile: target, cropId: CROPS[i % CROPS.length] ?? CORE_WHEAT }
          : { kind, tile: target };
      worker.path = [position, target];
      worker.pathCursor = 1;
      worker.actionProgress = i % 5;
    }
    if (spec.carryQty > 0) addItems(worker.carrying, CORE_WHEAT, spec.carryQty, 99);
    world.workers.set(worker.id, worker);
  }

  for (const [i, qty] of plan.inventoryQtys.entries()) {
    addItems(world.inventory, ITEMS[i] ?? CORE_WHEAT, qty, 99);
  }

  world.wallet.coins = plan.coins;
  world.economy.expansionsPurchased = plan.expansions;
  for (const entry of plan.multipliers) {
    world.economy.multipliers.set(ITEMS[entry.item] ?? CORE_WHEAT, entry.thousandths / 1000);
  }

  const [planted, harvested, lastActivityTick] = plan.stats;
  world.cropStats.planted = planted;
  world.cropStats.harvested = harvested;
  world.cropStats.lastActivityTick = lastActivityTick;

  for (const [i, tile] of rememberedTiles.entries()) {
    world.lastPlanted.set(tile, CROPS[i % CROPS.length] ?? CORE_WHEAT);
  }

  return world;
}

describe('the save document', () => {
  it('opens with schemaVersion, then the magic — the ADR-015 §1 header', () => {
    const text = serializeSave(toSaveDocument(createWorld(1), META));
    expect(
      text.startsWith(`{"schemaVersion":${CURRENT_SCHEMA_VERSION},"magic":"${SAVE_MAGIC}"`),
    ).toBe(true);
  });

  it('carries an empty quarantine from version 1, and writes a held one back verbatim', () => {
    // The §5.3 home exists from the first shipped save, so introducing the
    // first quarantined mod entity (v0.2) needs no migration — the same
    // reasoning as `plugins: {}` (ADR-002 §5).
    const world = createWorld(1);
    expect(toSaveDocument(world, META).quarantine).toEqual({
      crops: [],
      buildings: [],
      stacks: [],
      lastPlanted: [],
    });

    // A session that loaded quarantined data carries it forward on every
    // save until the content returns — uninstalling a mod must not destroy
    // the farm built with it.
    const held = {
      crops: [{ tile: 9, cropId: 'mod:moon_melon', plantedTick: 5 }],
      buildings: [
        {
          building: { id: 7, tile: 11, buildingId: 'mod:silo' },
          stacks: [{ item: 'mod:moon_melon', qty: 12 }],
        },
      ],
      stacks: [{ owner: 'inventory', stack: { item: 'mod:essence', qty: 3 } }],
      lastPlanted: [{ tile: 9, cropId: 'mod:moon_melon' }],
    };
    const document = toSaveDocument(world, META, held);
    expect(document.quarantine).toEqual(held);
    const reparsed = JSON.parse(serializeSave(document)) as SaveDocument;
    expect(reparsed.quarantine).toEqual(held);
  });

  it('never persists derived or forbidden state', () => {
    const document = toSaveDocument(
      buildWorld(fc.sample(planArb, { numRuns: 1, seed: 7 })[0]!),
      META,
    );
    const text = serializeSave(document);
    expect(text).not.toContain('blocked'); // derived from buildings (§2.2)
    expect(text).not.toContain('stage'); // derived from plantedTick (ADR-009)
    expect(text).not.toContain('opacity'); // settings.json is not the save (ADR-014 §4)
    expect(document.plugins).toEqual({}); // reserved since version 1 (ADR-002 §5)
  });
});

describe('round trip (criterion 1)', () => {
  it('hydrate(toSave(w)) carries exactly the state w carried, for arbitrary worlds', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const live = buildWorld(plan);
        const document = toSaveDocument(live, META);
        const hydrated = hydrateWorld(document);
        expect(toSaveDocument(hydrated, META)).toEqual(document);
      }),
      { numRuns: 40 },
    );
  });

  it('rebuilds the derived blocked bits from the building store', () => {
    const plan = fc.sample(
      planArb.filter((p) => p.buildingCount > 0),
      { numRuns: 1, seed: 11 },
    )[0]!;
    const live = buildWorld(plan);
    const hydrated = hydrateWorld(toSaveDocument(live, META));
    expect([...hydrated.tiles.blocked]).toEqual([...live.tiles.blocked]);
  });
});

describe('byte-stability (criterion 2)', () => {
  it('the same world serializes to identical bytes, twice and through a round trip', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const live = buildWorld(plan);
        const first = serializeSave(toSaveDocument(live, META));
        const second = serializeSave(toSaveDocument(live, META));
        expect(second).toBe(first);
        const parsed = JSON.parse(first) as SaveDocument;
        const throughDisk = serializeSave(toSaveDocument(hydrateWorld(parsed), META));
        expect(throughDisk).toBe(first);
      }),
      { numRuns: 25 },
    );
  });
});

describe('continue-identically (criterion 13)', () => {
  it('the hydrated world and the never-saved world evolve byte-identically', () => {
    fc.assert(
      fc.property(planArb, fc.integer({ min: 1, max: 300 }), (plan, ticks) => {
        const live = buildWorld(plan);
        const hydrated = hydrateWorld(toSaveDocument(live, META));

        stepSimulationBy(live, ticks);
        stepSimulationBy(hydrated, ticks);

        expect(hydrated.rng.getState()).toEqual(live.rng.getState());
        expect(serializeSave(toSaveDocument(hydrated, META))).toBe(
          serializeSave(toSaveDocument(live, META)),
        );
      }),
      { numRuns: 25 },
    );
  });

  it('the allocator resumes without reissuing — even after an ID was freed', () => {
    // The concrete case behind persisting the counters (ADR-015 §6): sell the
    // newest building, save, load — the next allocation must NOT reuse its ID.
    const world = createWorld(42);
    const first = world.ids.allocateBuilding();
    const second = world.ids.allocateBuilding();
    const tile = asTileIndex(100);
    world.buildings.set(first, { id: first, tile, buildingId: CORE_REST_HUT });
    setBlocked(world.tiles, tile, true);
    void second; // allocated, then "sold" — never persisted

    const hydrated = hydrateWorld(toSaveDocument(world, META));
    expect(hydrated.ids.allocateBuilding()).toBe(world.ids.allocateBuilding());
  });
});
