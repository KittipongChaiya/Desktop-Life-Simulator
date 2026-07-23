/**
 * Worker task selection. Phase-04, GAME_DESIGN.md §4.4.
 *
 * Pure: fixed priority (harvest → plant → till), nearest-first within a band,
 * ties broken by lowest tile index — never RNG (determinism, ADR-007).
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asTileIndex, type TileIndex } from '../../shared/ids';
import { CommandSource } from '../commands/types';
import { CORE_SEED_BIN } from '../content/buildings';
import { CORE_TURNIP, CORE_WHEAT } from '../content/crops';
import { CORE_TURNIP_SEED, CORE_WHEAT_SEED, DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation } from '../tick';
import { addItems } from '../world/container';
import { addCoins } from '../world/wallet';
import { WorkerTaskKind } from '../world/worker';
import { createWorld, type World } from '../world/world';

import { commandForTask, selectTask, WORKER_DEFAULT_CROP } from './worker-tasks';

const CENTER = toIndexUnchecked(32, 32); // 2080 — inside the 8×8 owned plot
const NO_CLAIMS: ReadonlySet<TileIndex> = new Set();

function till(world: World, tile: TileIndex): void {
  world.tiles.tilledAt[tile] = 1;
}

/** Stocks the farm so the plant band is live (planting consumes seeds, 06b). */
function grantSeeds(world: World, quantity = 20): void {
  addItems(world.inventory, CORE_TURNIP_SEED, quantity, DEFAULT_STACK_SIZE);
}

function plantMature(world: World, tile: TileIndex): void {
  world.crops.set(tile, { cropId: CORE_TURNIP, tile, plantedTick: 0 });
  world.tick = 100_000; // far past turnip growth — mature
}

describe('selectTask priority', () => {
  it('tills owned grass when nothing else is available', () => {
    const world = createWorld(1);
    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Till,
      tile: CENTER,
    });
  });

  it('prefers planting a tilled tile over tilling', () => {
    const world = createWorld(1);
    grantSeeds(world);
    till(world, CENTER);
    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Plant,
      tile: CENTER,
      cropId: WORKER_DEFAULT_CROP,
    });
  });

  it('skips the plant band when the farm holds no seeds — never blocks (06b)', () => {
    const world = createWorld(1);
    till(world, CENTER);
    // With no seeds, the tilled tile is not a plant candidate; the worker
    // moves on to tilling other ground rather than jamming (§4.2).
    expect(selectTask(world, CENTER, NO_CLAIMS)?.kind).toBe(WorkerTaskKind.Till);
  });

  it('the plant band reopens the moment seeds arrive', () => {
    const world = createWorld(1);
    till(world, CENTER);
    expect(selectTask(world, CENTER, NO_CLAIMS)?.kind).toBe(WorkerTaskKind.Till);
    grantSeeds(world, 1);
    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Plant,
      tile: CENTER,
      cropId: WORKER_DEFAULT_CROP,
    });
  });

  it('prefers harvesting a mature crop over everything else', () => {
    const world = createWorld(1);
    till(world, toIndexUnchecked(30, 30)); // a plant candidate exists too
    plantMature(world, CENTER);
    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Harvest,
      tile: CENTER,
    });
  });

  it('returns null when no work is available', () => {
    const world = createWorld(1);
    // Claim every owned tile so nothing is tillable.
    const claimed = new Set<TileIndex>();
    for (let y = 28; y <= 35; y += 1) {
      for (let x = 28; x <= 35; x += 1) claimed.add(toIndexUnchecked(x, y));
    }
    expect(selectTask(world, CENTER, claimed)).toBeNull();
  });
});

describe('selectTask nearest-first and tie-breaking', () => {
  it('skips a claimed tile and takes the next nearest', () => {
    const world = createWorld(1);
    // Center is claimed; the four neighbours tie at distance 1 → lowest index wins.
    const claimed = new Set<TileIndex>([CENTER]);
    const north = toIndexUnchecked(32, 31); // 2016, the lowest-index neighbour
    expect(selectTask(world, CENTER, claimed)).toEqual({
      kind: WorkerTaskKind.Till,
      tile: north,
    });
  });

  it('breaks distance ties by lowest tile index, deterministically', () => {
    const world = createWorld(1);
    const a = selectTask(world, CENTER, new Set([CENTER]));
    const b = selectTask(world, CENTER, new Set([CENTER]));
    expect(a).toEqual(b);
  });
});

describe('seed bin auto-replant (06c, §5)', () => {
  /** A world with a seed bin placed and CENTER tilled. */
  function binWorld(): World {
    const world = createWorld(1);
    addCoins(world.wallet, 500);
    world.commands.dispatch(
      { type: 'placeBuilding', tile: toIndexUnchecked(29, 29), buildingId: CORE_SEED_BIN },
      { source: CommandSource.Player },
    );
    stepSimulation(world);
    till(world, CENTER);
    return world;
  }

  it('replants the last crop planted on the tile', () => {
    const world = binWorld();
    world.lastPlanted.set(CENTER, CORE_WHEAT);
    addItems(world.inventory, CORE_WHEAT_SEED, 5, DEFAULT_STACK_SIZE);

    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Plant,
      tile: CENTER,
      cropId: CORE_WHEAT,
    });
  });

  it('falls back to the default crop when the tile has no record', () => {
    const world = binWorld();
    grantSeeds(world);

    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Plant,
      tile: CENTER,
      cropId: WORKER_DEFAULT_CROP,
    });
  });

  it('falls back to the default crop when no seed matches the record', () => {
    const world = binWorld();
    world.lastPlanted.set(CENTER, CORE_WHEAT); // recorded, but no wheat seeds
    grantSeeds(world); // turnip seeds only

    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Plant,
      tile: CENTER,
      cropId: WORKER_DEFAULT_CROP,
    });
  });

  it('with no seeds at all the tile is skipped — never blocks', () => {
    const world = binWorld();
    world.lastPlanted.set(CENTER, CORE_WHEAT);

    expect(selectTask(world, CENTER, NO_CLAIMS)?.kind).toBe(WorkerTaskKind.Till);
  });

  it('without a seed bin the record is ignored — workers sow the default', () => {
    const world = createWorld(1);
    till(world, CENTER);
    world.lastPlanted.set(CENTER, CORE_WHEAT);
    addItems(world.inventory, CORE_WHEAT_SEED, 5, DEFAULT_STACK_SIZE);
    grantSeeds(world);

    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Plant,
      tile: CENTER,
      cropId: WORKER_DEFAULT_CROP,
    });
  });
});

describe('commandForTask', () => {
  it('maps a till task to a tillTile command', () => {
    expect(commandForTask({ kind: WorkerTaskKind.Till, tile: asTileIndex(5) })).toEqual({
      type: 'tillTile',
      tile: 5,
    });
  });

  it('maps a plant task to a plantCrop command carrying the selected crop', () => {
    expect(
      commandForTask({ kind: WorkerTaskKind.Plant, tile: asTileIndex(5), cropId: CORE_WHEAT }),
    ).toEqual({
      type: 'plantCrop',
      tile: 5,
      cropId: CORE_WHEAT,
    });
  });

  it('a plant task without a crop falls back to the default', () => {
    expect(commandForTask({ kind: WorkerTaskKind.Plant, tile: asTileIndex(5) })).toEqual({
      type: 'plantCrop',
      tile: 5,
      cropId: WORKER_DEFAULT_CROP,
    });
    expect(WORKER_DEFAULT_CROP).toBe(CORE_TURNIP);
  });

  it('maps a harvest task to a harvestCrop command', () => {
    expect(commandForTask({ kind: WorkerTaskKind.Harvest, tile: asTileIndex(5) })).toEqual({
      type: 'harvestCrop',
      tile: 5,
    });
  });
});
