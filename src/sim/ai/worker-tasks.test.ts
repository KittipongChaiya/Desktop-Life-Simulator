/**
 * Worker task selection. Phase-04, GAME_DESIGN.md §4.4.
 *
 * Pure: fixed priority (harvest → plant → till), nearest-first within a band,
 * ties broken by lowest tile index — never RNG (determinism, ADR-007).
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asTileIndex, type TileIndex } from '../../shared/ids';
import { CORE_TURNIP } from '../content/crops';
import { WorkerTaskKind } from '../world/worker';
import { createWorld, type World } from '../world/world';

import { commandForTask, selectTask, WORKER_DEFAULT_CROP } from './worker-tasks';

const CENTER = toIndexUnchecked(32, 32); // 2080 — inside the 8×8 owned plot
const NO_CLAIMS: ReadonlySet<TileIndex> = new Set();

function till(world: World, tile: TileIndex): void {
  world.tiles.tilledAt[tile] = 1;
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
    till(world, CENTER);
    expect(selectTask(world, CENTER, NO_CLAIMS)).toEqual({
      kind: WorkerTaskKind.Plant,
      tile: CENTER,
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

describe('commandForTask', () => {
  it('maps a till task to a tillTile command', () => {
    expect(commandForTask({ kind: WorkerTaskKind.Till, tile: asTileIndex(5) })).toEqual({
      type: 'tillTile',
      tile: 5,
    });
  });

  it('maps a plant task to a plantCrop command using the default crop', () => {
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
