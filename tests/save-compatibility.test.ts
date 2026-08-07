/**
 * The save-compatibility gate. v0.1 (`fix/0.1/7.2.md`).
 *
 * This is a VERIFICATION suite, not a feature suite. It adds no behaviour; it
 * pins the behaviour v0.1 is about to promise to every save file a player will
 * ever own, and it exercises the WHOLE pipeline — serialize → bytes → parse →
 * migrate → structurally validate → semantically repair → hydrate — rather
 * than any one stage, because compatibility is a property of the pipeline.
 *
 * The phase tests (07a–07e) prove each stage against arbitrary worlds. This
 * one asks the different question `fix/0.1/7.2.md` asks: given a save on a real
 * disk, what does this build guarantee about it — today, and after a version
 * bump? Every answer here is quoted in `docs/save-compatibility-report.md`,
 * and the report is only true for as long as this file passes.
 */

import { describe, expect, it } from 'vitest';

import { loadWorld } from '../src/persistence/load';
import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations/index';
import {
  CURRENT_SCHEMA_VERSION,
  EMPTY_QUARANTINE,
  SAVE_MAGIC,
  type SaveDocument,
  type SaveMeta,
} from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { asTileIndex } from '../src/shared/ids';
import {
  CORE_MARKET_STALL,
  CORE_REST_HUT,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
} from '../src/sim/content/buildings';
import { CORE_CARROT, CORE_PUMPKIN, CORE_TURNIP, CORE_WHEAT } from '../src/sim/content/crops';
import { CORE_TURNIP_SEED, CORE_WHEAT_SEED, DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems } from '../src/sim/world/container';
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

const CROPS = [CORE_TURNIP, CORE_WHEAT, CORE_CARROT, CORE_PUMPKIN] as const;
const BUILDINGS = [CORE_STORAGE_SHED, CORE_REST_HUT, CORE_SEED_BIN, CORE_MARKET_STALL] as const;

// ---------------------------------------------------------------------------
// The pipeline, as one call each way
// ---------------------------------------------------------------------------

/** World → the exact bytes that reach the disk. */
const save = (world: World, meta: SaveMeta = META): string =>
  serializeSave(toSaveDocument(world, meta, EMPTY_QUARANTINE));

interface Loaded {
  readonly world: World;
  readonly repairs: readonly { readonly rule: string; readonly detail: string }[];
}

/** Bytes → a live world, through every stage. Throws with the typed reason. */
function load(text: string): Loaded {
  const result = loadWorld(JSON.parse(text), null);
  if (!result.ok) throw new Error(`load failed: ${result.error.code} — ${result.error.message}`);
  return { world: result.value.world, repairs: result.value.repairs };
}

// ---------------------------------------------------------------------------
// The scenario matrix (`fix/0.1/7.2.md` §Compatibility Tests)
// ---------------------------------------------------------------------------

/** A plot of `size × size` tiles anchored at the grid origin, all owned. */
function ownPlot(world: World, size: number): number[] {
  const tiles: number[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tile = y * 64 + x;
      setOwned(world.tiles, asTileIndex(tile), true);
      tiles.push(tile);
    }
  }
  return tiles;
}

/** A brand-new farm — the smallest save v0.1 can write. */
function emptyWorld(): World {
  return createWorld(20_260_727);
}

/** The least a save can carry and still be a game in progress. */
function minimumWorld(): World {
  const world = createWorld(11);
  const tile = asTileIndex(0);
  setOwned(world.tiles, tile, true);
  const worker = createWorker(world.ids.allocateWorker(), tile);
  world.workers.set(worker.id, worker);
  return world;
}

/**
 * A plot far beyond anything v0.1 pacing reaches, densely planted.
 *
 * Deliberately larger than the reference fixture: the size guard and the
 * timing budgets are only meaningful against the worst case a player could
 * ever construct, not the typical one.
 */
function largeWorld(): World {
  const world = createWorld(4_242);
  const tiles = ownPlot(world, 40); // 1,600 tiles — the whole v0.1 expansion path and beyond
  world.tick = 500_000;

  for (const [i, tile] of tiles.entries()) {
    world.tiles.tilledAt[tile] = Math.max(0, world.tick - (i % 400));
    if (i % 2 === 0) {
      const cropId = CROPS[i % CROPS.length] ?? CORE_WHEAT;
      world.crops.set(asTileIndex(tile), {
        cropId,
        tile: asTileIndex(tile),
        plantedTick: Math.max(0, world.tick - (i % 300)),
      });
    }
    if (i % 7 === 0)
      world.lastPlanted.set(asTileIndex(tile), CROPS[i % CROPS.length] ?? CORE_WHEAT);
  }

  world.economy.expansionsPurchased = 5;
  world.cropStats.planted = 400_000;
  world.cropStats.harvested = 399_000;
  world.cropStats.lastActivityTick = world.tick - 3;
  return world;
}

/** Far more workers than v0.1's economy would ever fund. */
function manyWorkersWorld(): World {
  const world = createWorld(777);
  const tiles = ownPlot(world, 8);
  for (let i = 0; i < 30; i += 1) {
    const position = asTileIndex(tiles[i % tiles.length] ?? 0);
    const worker = createWorker(world.ids.allocateWorker(), position);
    worker.energy = i % 101;
    worker.energyTimer = i % 20;
    worker.replanTick = i;
    addItems(worker.carrying, CORE_WHEAT, (i % 9) + 1, DEFAULT_STACK_SIZE);
    world.workers.set(worker.id, worker);
  }
  return world;
}

/** The player's inventory filled to its last slot. */
function largeInventoryWorld(): World {
  const world = createWorld(31);
  ownPlot(world, 4);
  const items = [CORE_WHEAT, CORE_TURNIP, CORE_CARROT, CORE_WHEAT_SEED, CORE_TURNIP_SEED];
  // Every slot occupied, filled through the ordinary container path so the
  // stack invariants hold exactly as a real session would leave them.
  for (let slot = 0; slot < world.inventory.capacity; slot += 1) {
    addItems(
      world.inventory,
      items[slot % items.length] ?? CORE_WHEAT,
      DEFAULT_STACK_SIZE,
      DEFAULT_STACK_SIZE,
    );
  }
  return world;
}

/** Every storing building at capacity, and the wallet near the integer ceiling. */
function fullStorageWorld(): World {
  const world = createWorld(99);
  const tiles = ownPlot(world, 6);

  for (const [i, buildingId] of BUILDINGS.entries()) {
    const tile = asTileIndex(tiles[20 + i] ?? 0);
    const id = world.ids.allocateBuilding();
    world.buildings.set(id, { id, tile, buildingId });
    setBlocked(world.tiles, tile, true);
    const definition = world.buildingRegistry.get(buildingId);
    const slots = definition.ok ? (definition.value.storageSlots ?? 0) : 0;
    if (slots === 0) continue;
    const container = { stacks: [], capacity: slots };
    world.buildingStorage.set(id, container);
    for (let slot = 0; slot < slots; slot += 1) {
      addItems(container, CORE_WHEAT, DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
    }
  }

  // "Maximum resources": a coin balance no v0.1 session reaches, still an
  // exact integer, so the JSON round trip cannot lose precision.
  world.wallet.coins = 2_000_000_000;
  return world;
}

/** A farm that has actually been simulated, not posed. */
function simulatedWorld(ticks: number): World {
  const world = createWorld(20_260_101);
  const tiles = ownPlot(world, 12);

  for (const [i, buildingId] of BUILDINGS.entries()) {
    const tile = asTileIndex(tiles[100 + i] ?? 0);
    const id = world.ids.allocateBuilding();
    world.buildings.set(id, { id, tile, buildingId });
    setBlocked(world.tiles, tile, true);
    const definition = world.buildingRegistry.get(buildingId);
    const slots = definition.ok ? (definition.value.storageSlots ?? 0) : 0;
    if (slots > 0) world.buildingStorage.set(id, { stacks: [], capacity: slots });
  }

  for (let i = 0; i < 3; i += 1) {
    const worker = createWorker(world.ids.allocateWorker(), asTileIndex(tiles[i] ?? 0));
    world.workers.set(worker.id, worker);
  }

  for (const tile of tiles) world.tiles.tilledAt[tile] = 1;
  addItems(world.inventory, CORE_TURNIP_SEED, 20 * DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
  world.wallet.coins = 5_000;

  // Draw the generator off its seed expansion. Without this every scenario
  // would carry a fresh RNG, and a save that lost the stream entirely would
  // still compare equal — the exact blind spot a mutation control caught here.
  for (let draw = 0; draw < 37; draw += 1) world.rng.next();

  stepSimulationBy(world, ticks);
  return world;
}

const SCENARIOS: readonly { readonly name: string; readonly build: () => World }[] = [
  { name: 'an empty world (a brand-new farm)', build: emptyWorld },
  { name: 'a minimum world (one tile, one worker)', build: minimumWorld },
  { name: 'a large world (1,600 tiles, 800 crops)', build: largeWorld },
  { name: 'many workers (30)', build: manyWorkersWorld },
  { name: 'a full inventory', build: largeInventoryWorld },
  { name: 'full storage and maximum resources', build: fullStorageWorld },
  { name: 'a long economy simulation (20,000 ticks)', build: () => simulatedWorld(20_000) },
];

// ---------------------------------------------------------------------------

describe('the save header — every save is identifiable (7.2 §Save Format Version)', () => {
  it('carries version, identity, game version, timestamps, and the world seed', () => {
    const document = JSON.parse(save(simulatedWorld(200))) as SaveDocument;

    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(document.magic).toBe(SAVE_MAGIC);
    expect(document.meta.gameVersion).toBe('0.1.0');
    expect(document.meta.savedAtUnixMs).toBe(META.savedAtUnixMs);
    expect(document.meta.createdAtUnixMs).toBe(META.createdAtUnixMs);
    expect(Number.isInteger(document.world.seed)).toBe(true);
  });

  it('puts the version and identity in the first bytes, so a truncated file is still identifiable', () => {
    // The point of the ordering (ADR-015 §1): a future build must be able to
    // decide "unsupported save" from a file it cannot otherwise parse.
    const head = save(emptyWorld()).slice(0, 80);

    expect(head.indexOf('"schemaVersion"')).toBe(1);
    expect(head).toContain(SAVE_MAGIC);
  });
});

describe('save → load → save is logically identical (7.2 §Round Trip)', () => {
  it.each(SCENARIOS)('holds for $name', ({ build }) => {
    const first = save(build());
    const second = save(load(first).world);

    // Not "equivalent" — IDENTICAL. The writer rebuilds the document from
    // live world state, so any drift here is state the pipeline lost or
    // invented, which is the whole failure mode this gate exists to catch.
    expect(second).toBe(first);
  });

  it('differs ONLY in meta when the metadata legitimately moves on', () => {
    const world = simulatedWorld(500);
    const first = JSON.parse(save(world)) as SaveDocument;
    const second = JSON.parse(
      save(load(save(world)).world, {
        ...META,
        savedAtUnixMs: META.savedAtUnixMs + 60_000,
        saveCount: META.saveCount + 1,
      }),
    ) as SaveDocument;

    expect(second.meta.savedAtUnixMs).not.toBe(first.meta.savedAtUnixMs);
    expect(second.meta.saveCount).not.toBe(first.meta.saveCount);
    // Everything that is not a timestamp or a counter is untouched.
    expect(second.world).toEqual(first.world);
    expect(second.quarantine).toEqual(first.quarantine);
    expect(second.plugins).toEqual(first.plugins);
    expect(second.meta.createdAtUnixMs).toBe(first.meta.createdAtUnixMs);
  });

  it('survives 100 consecutive save/load cycles without drifting a byte', () => {
    // The cycle a real player performs over months, compressed. Drift that is
    // invisible in one round trip — a re-sorted map, a float re-rendered, a
    // counter incremented on read — compounds here and becomes obvious.
    const original = save(simulatedWorld(1_000));
    let text = original;

    for (let cycle = 0; cycle < 100; cycle += 1) {
      text = save(load(text).world);
      if (text !== original) {
        throw new Error(`drifted on cycle ${String(cycle + 1)}`);
      }
    }

    expect(text).toBe(original);
  });
});

describe('every scenario loads clean (7.2 §Compatibility Tests)', () => {
  it.each(SCENARIOS)('$name needs no repairs', ({ build }) => {
    // A repair means the document said something the world could not mean.
    // A world this build itself produced must never need one.
    const loaded = load(save(build()));
    expect(loaded.repairs).toEqual([]);
  });
});

describe('save → load → continue is deterministic (7.2 §Deterministic Validation)', () => {
  /** The subsystems the directive enumerates, read off the save document. */
  const subsystemsOf = (world: World): Record<string, unknown> => {
    const document = JSON.parse(save(world)) as SaveDocument;
    return {
      workers: document.world.workers,
      resources: document.world.inventory,
      containers: document.world.buildingStorage,
      economy: document.world.economy,
      buildings: document.world.buildings,
      inventory: document.world.inventory,
      tick: document.world.tick,
      rng: document.world.rngState,
      world: document.world.grid,
      player: document.world.wallet,
      crops: document.world.crops,
      cropStats: document.world.cropStats,
    };
  };

  it('every enumerated subsystem matches a world that was never saved', () => {
    const live = simulatedWorld(2_000);
    const restored = load(save(live)).world;

    // Both step the SAME distance from the same state. Any divergence is a
    // piece of authoritative state the save did not carry.
    stepSimulationBy(live, 1_000);
    stepSimulationBy(restored, 1_000);

    const expected = subsystemsOf(live);
    const actual = subsystemsOf(restored);
    for (const key of Object.keys(expected)) {
      expect({ [key]: actual[key] }).toEqual({ [key]: expected[key] });
    }
  });

  it('the RNG resumes MID-STREAM — the next draws are the ones that were coming', () => {
    // `hydrateWorld` rebuilds through `createWorld(seed)`, which seeds a fresh
    // generator; only an explicit restore puts the stream back where it was.
    // Asserted on the DRAWS rather than the stored state, because the draws
    // are what determinism actually means (ADR-007).
    const live = simulatedWorld(400);
    const restored = load(save(live)).world;

    const expected = Array.from({ length: 16 }, () => live.rng.next());
    const actual = Array.from({ length: 16 }, () => restored.rng.next());

    expect(actual).toEqual(expected);
    // And the stream was genuinely mid-sequence, not accidentally at its start.
    expect(Array.from({ length: 16 }, () => createWorld(live.seed).rng.next())).not.toEqual(
      expected,
    );
  });

  it('two loads of the same bytes continue identically to each other', () => {
    const text = save(simulatedWorld(1_500));
    const a = load(text).world;
    const b = load(text).world;

    stepSimulationBy(a, 2_000);
    stepSimulationBy(b, 2_000);

    expect(save(b)).toBe(save(a));
  });
});

describe('the compatibility policy (7.2 §Compatibility Rules)', () => {
  const currentDocument = (): Record<string, unknown> =>
    JSON.parse(save(simulatedWorld(100))) as Record<string, unknown>;

  it('CURRENT saves load, unchanged', () => {
    expect(load(save(emptyWorld())).repairs).toEqual([]);
  });

  it('FUTURE saves are refused outright — never partially loaded, never downgraded', () => {
    const future = { ...currentDocument(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    // A valid OLDER backup is offered deliberately: quietly loading it would
    // discard the newer session's world, which is data loss by another name.
    const result = loadWorld(future, JSON.parse(save(emptyWorld())));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('save_from_newer_version');
  });

  it('UNSUPPORTED versions — a number no release ever shipped — fail as corrupt, not as a crash', () => {
    const orphan = { ...currentDocument(), schemaVersion: 0 };
    const result = loadWorld(orphan, null);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBeTruthy();
  });

  it('MISSING required fields are a typed validation error, never a throw', () => {
    const document = currentDocument();
    delete (document as { world?: unknown }).world;

    expect(() => loadWorld(document, null)).not.toThrow();
    expect(loadWorld(document, null).ok).toBe(false);
  });

  it('UNKNOWN and ADDITIONAL fields are accepted on read — a stricter reader would reject its own future', () => {
    const document = currentDocument();
    document['somethingFromLater'] = { anything: [1, 2, 3] };
    (document['world'] as Record<string, unknown>)['unknownWorldField'] = 'ignored';
    (document['meta'] as Record<string, unknown>)['unknownMetaField'] = 42;

    const result = loadWorld(document, null);

    expect(result.ok).toBe(true);
  });

  it('...and are DROPPED by the next save, because the writer rebuilds from world state', () => {
    // The honest consequence of hand-written serialization (`SAVE_FORMAT.md`
    // §3.1): the writer emits the fields it knows, so a round trip through
    // this build erases anything it does not. Pinned as a TEST because it is
    // the one compatibility rule that could surprise a v0.2 author.
    const document = currentDocument();
    document['somethingFromLater'] = { anything: [1, 2, 3] };

    const rewritten = JSON.parse(save(load(JSON.stringify(document)).world)) as Record<
      string,
      unknown
    >;

    expect(rewritten['somethingFromLater']).toBeUndefined();
  });

  it('REMOVED fields are the migration chain’s job, and nothing has been removed yet', () => {
    // v1 had no earlier shape, so it could remove nothing. v2 adds fields and
    // removes none — the first removal is ADR-027 §3's `v4 → v5` dropping
    // `grid.moisture`. What this pins is that the chain reaches the current
    // version in unbroken single steps, which is what makes a removal safe
    // when one finally lands.
    expect(MIGRATIONS.map((m) => [m.from, m.to])).toEqual([[1, 2]]);
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});

describe('the migration framework (7.2 §Migration Tests)', () => {
  it('is registered and ordered, with every link a single step to the current version', () => {
    // Phase-09b replaced "empty at v1". The mechanism shipped in 07b before any
    // link existed; this asserts the first one slotted into it without changing
    // the runner, which was the whole point of building it early.
    expect(MIGRATIONS.length).toBeGreaterThan(0);

    let expected = 1;
    for (const link of MIGRATIONS) {
      expect(link.from).toBe(expected);
      expect(link.to).toBe(expected + 1);
      expect(link.describe.length).toBeGreaterThan(0);
      expected += 1;
    }
    expect(expected).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is IDEMPOTENT: migrating an already-current document is a fixed point', () => {
    const document = JSON.parse(save(simulatedWorld(300))) as SaveDocument;

    const once = runMigrations(document as never, MIGRATIONS, CURRENT_SCHEMA_VERSION);
    expect(once.ok).toBe(true);
    if (!once.ok) return;

    const twice = runMigrations(once.value.document, MIGRATIONS, CURRENT_SCHEMA_VERSION);
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;

    expect(JSON.stringify(twice.value.document)).toBe(JSON.stringify(once.value.document));
    expect(once.value.applied).toEqual([]);
  });

  it('rejects an unknown version rather than guessing at it', () => {
    const document = JSON.parse(save(emptyWorld())) as Record<string, unknown>;
    document['schemaVersion'] = 99;

    const result = runMigrations(document as never, MIGRATIONS, CURRENT_SCHEMA_VERSION);

    expect(result.ok).toBe(false);
  });
});

describe('the worst case stays inside the budgets (7.2 §Performance)', () => {
  // `PERFORMANCE.md` §8/§9 publishes its ceilings against the REFERENCE farm
  // (measured in `save-performance.test.ts`). These are the same ceilings held
  // against the largest world v0.1 can represent — 1,600 owned tiles, 800
  // standing crops, half a million ticks — because a budget that only holds
  // for the typical save is not a budget.
  const SIZE_CEILING_BYTES = 2 * 1024 * 1024;
  const SAVE_CEILING_MS = 100;
  const LOAD_CEILING_MS = 1_500;

  const medianMs = (runs: number, body: () => void): number => {
    const samples: number[] = [];
    for (let run = 0; run < runs; run += 1) {
      const started = performance.now();
      body();
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
  };

  it('a large world serializes under the 2 MB size ceiling', () => {
    expect(Buffer.byteLength(save(largeWorld()), 'utf8')).toBeLessThan(SIZE_CEILING_BYTES);
  });

  it('a large world saves under the 100 ms interaction ceiling', () => {
    const world = largeWorld();
    expect(medianMs(5, () => void save(world))).toBeLessThan(SAVE_CEILING_MS);
  });

  it('a large world loads under the 1.5 s to-interactive ceiling', () => {
    const text = save(largeWorld());
    expect(medianMs(3, () => void load(text))).toBeLessThan(LOAD_CEILING_MS);
  });

  it('repeated saves do not degrade — the tenth costs what the first did', () => {
    // Guards the failure mode a whole-file rewrite invites: state that
    // accumulates per save (a growing quarantine, an unpruned log) would show
    // up as a rising cost long before it showed up as a bug.
    const world = simulatedWorld(1_000);
    const first = medianMs(3, () => void save(world));
    for (let i = 0; i < 10; i += 1) void save(world);
    const tenth = medianMs(3, () => void save(world));

    expect(tenth).toBeLessThan(Math.max(first * 3, 5));
  });
});

describe('corruption never crashes the application (7.2 §Corruption Handling)', () => {
  const CORRUPTIONS: readonly { readonly name: string; readonly value: unknown }[] = [
    { name: 'null', value: null },
    { name: 'a string', value: 'not a save' },
    { name: 'a number', value: 7 },
    { name: 'an array', value: [] },
    { name: 'an empty object', value: {} },
    { name: 'a save-shaped object with nothing in it', value: { schemaVersion: 1 } },
    { name: 'the right magic and nothing else', value: { schemaVersion: 1, magic: SAVE_MAGIC } },
  ];

  it.each(CORRUPTIONS)('$name is a typed error, not an exception', ({ value }) => {
    expect(() => loadWorld(value, null)).not.toThrow();
    expect(loadWorld(value, null).ok).toBe(false);
  });

  it('partial data — a document truncated field by field — never throws', () => {
    // Every top-level key removed in turn: whichever one a real truncation
    // happens to lose, the answer must be a message, not a stack trace.
    const document = JSON.parse(save(simulatedWorld(100))) as Record<string, unknown>;

    for (const key of Object.keys(document)) {
      const damaged = { ...document };
      delete damaged[key];
      expect(() => loadWorld(damaged, null)).not.toThrow();
    }
  });

  it('a truncated file never reaches the pipeline as a half-document', () => {
    // JSON.parse is the boundary main crosses (`readSavesForLoad`); a torn
    // file fails there and arrives as `null`, which the pipeline reports.
    const text = save(simulatedWorld(100));
    expect(() => {
      JSON.parse(text.slice(0, Math.floor(text.length / 2)));
    }).toThrow();
    expect(loadWorld(null, null).ok).toBe(false);
  });

  it('a damaged field is repaired and REPORTED, never silently accepted', () => {
    const document = JSON.parse(save(simulatedWorld(100))) as SaveDocument;
    (document.world.wallet as { coins: number }).coins = -500;

    const result = loadWorld(document, null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.repairs.length).toBeGreaterThan(0);
    expect(result.value.world.wallet.coins).toBe(0);
  });
});
