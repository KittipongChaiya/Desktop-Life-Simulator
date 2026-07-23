/**
 * Golden fixtures. Phase-07b — `SAVE_FORMAT.md` §4.4, acceptance 8, 9.
 *
 * Every schema version keeps a real save committed at
 * `tests/fixtures/saves/`, APPEND-ONLY from the moment it lands (`TESTING.md`
 * §7.2, `PROJECT_STRUCTURE.md` §3): these files represent saves on real
 * disks. When a future migration breaks one, THIS suite fails — which is the
 * entire mechanism preventing v0.1 saves from silently dying around v0.4.
 * If a fixture stops migrating, the MIGRATION is wrong — never the fixture.
 *
 * The writer below runs exactly once per fixture, the run that creates it;
 * from the commit onward the suite only reads. Regenerating an existing
 * fixture is deliberately impossible here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hydrateWorld } from '../src/persistence/deserialize';
import { runMigrations, validateChain, type UnknownSave } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations/index';
import {
  CURRENT_SCHEMA_VERSION,
  SAVE_MAGIC,
  type SaveDocument,
  type SaveMeta,
} from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';
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
import { addItems } from '../src/sim/world/container';
import { setBlocked, setOwned } from '../src/sim/world/tile-grid';
import { createWorker } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

const FIXTURES_DIR = join(__dirname, 'fixtures', 'saves');

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_228_800_000,
  savedAtUnixMs: 1_753_315_200_000,
  playtimeTicks: 0,
  saveCount: 1,
};

/** A brand-new world — the smallest save v0.1 can write. */
function emptyWorld(): World {
  return createWorld(20_260_723);
}

/**
 * A mature farm: expanded plot, all four buildings, three workers mid-shift,
 * stocked containers, a depressed market — then 500 REAL ticks, so the
 * fixture is a state the simulation actually reached, not a synthetic pose.
 */
function matureFarm(): World {
  const world = createWorld(8_141_871);

  const tile = (x: number, y: number): number => y * world.tiles.width + x;

  // A 16×16 centered plot, as two expansions would leave it.
  for (let y = 24; y < 40; y += 1) {
    for (let x = 24; x < 40; x += 1) setOwned(world.tiles, asTileIndex(tile(x, y)), true);
  }
  world.economy.expansionsPurchased = 2;

  const buildings = [
    { at: tile(26, 26), kind: CORE_STORAGE_SHED },
    { at: tile(37, 26), kind: CORE_REST_HUT },
    { at: tile(26, 37), kind: CORE_SEED_BIN },
    { at: tile(37, 37), kind: CORE_MARKET_STALL },
  ];
  for (const spec of buildings) {
    const id = world.ids.allocateBuilding();
    const at = asTileIndex(spec.at);
    world.buildings.set(id, { id, tile: at, buildingId: spec.kind });
    setBlocked(world.tiles, at, true);
    const definition = world.buildingRegistry.get(spec.kind);
    const slots = definition.ok ? (definition.value.storageSlots ?? 0) : 0;
    if (slots > 0) {
      const storage = { stacks: [], capacity: slots };
      if (spec.kind === CORE_STORAGE_SHED) addItems(storage, CORE_WHEAT, 60, 99);
      world.buildingStorage.set(id, storage);
    }
  }

  const crops = [CORE_TURNIP, CORE_WHEAT, CORE_CARROT];
  for (let i = 0; i < 12; i += 1) {
    const at = asTileIndex(tile(28 + (i % 6), 30 + Math.floor(i / 6)));
    world.tiles.tilledAt[at] = 1;
    const cropId = crops[i % crops.length] ?? CORE_WHEAT;
    world.crops.set(at, { cropId, tile: at, plantedTick: i * 40 });
    world.lastPlanted.set(at, cropId);
  }

  for (let i = 0; i < 3; i += 1) {
    const worker = createWorker(world.ids.allocateWorker(), asTileIndex(tile(30 + i, 34)));
    if (i === 0) addItems(worker.carrying, CORE_WHEAT, 8, 99);
    world.workers.set(worker.id, worker);
  }

  addItems(world.inventory, CORE_WHEAT, 43, 99);
  addItems(world.inventory, CORE_WHEAT_SEED, 25, 99);
  addItems(world.inventory, CORE_TURNIP_SEED, 12, 99);
  world.wallet.coins = 1_240;
  world.economy.multipliers.set(CORE_WHEAT, 0.84);
  world.cropStats.planted = 310;
  world.cropStats.harvested = 296;
  world.cropStats.lastActivityTick = 480;

  stepSimulationBy(world, 500);
  return world;
}

const FIXTURES: readonly { readonly name: string; readonly build: () => World }[] = [
  { name: 'v1-empty.json', build: emptyWorld },
  { name: 'v1-mature-farm.json', build: matureFarm },
];

/** Reads a fixture — creating it on the bootstrap run ONLY if absent. */
function fixtureText(name: string, build: () => World): string {
  const path = join(FIXTURES_DIR, name);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeSave(toSaveDocument(build(), META)), 'utf8');
  }
  return readFileSync(path, 'utf8');
}

describe('the migration chain itself', () => {
  it('validates at the current version — a malformed chain fails the build, not the player', () => {
    expect(() => {
      validateChain(MIGRATIONS, CURRENT_SCHEMA_VERSION);
    }).not.toThrow();
  });
});

describe.each(FIXTURES)('golden fixture $name', ({ name, build }) => {
  it('migrates to current, validates with zero repairs, and hydrates (acceptance 8, 9)', () => {
    const parsed = JSON.parse(fixtureText(name, build)) as UnknownSave;

    const migrated = runMigrations(parsed, MIGRATIONS, CURRENT_SCHEMA_VERSION);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;

    const structural = parseSaveDocument(migrated.value.document);
    expect(structural.ok).toBe(true);
    if (!structural.ok) return;

    expect(structural.value.magic).toBe(SAVE_MAGIC);
    const { document, repairs } = repairSaveDocument(structural.value, coreContent());
    expect(repairs).toEqual([]); // a golden save is coherent — repairs mean drift

    const world = hydrateWorld(document);
    expect(world.tick).toBe(document.world.tick);
  });

  it('continues deterministically after loading', () => {
    const document = JSON.parse(fixtureText(name, build)) as SaveDocument;
    const first = hydrateWorld(document);
    const second = hydrateWorld(document);
    stepSimulationBy(first, 200);
    stepSimulationBy(second, 200);
    expect(serializeSave(toSaveDocument(second, META))).toBe(
      serializeSave(toSaveDocument(first, META)),
    );
    expect(first.tick).toBe(document.world.tick + 200);
  });
});
