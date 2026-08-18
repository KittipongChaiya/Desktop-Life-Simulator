/**
 * The wilds slice. Phase-27 — ADR-005 §2, ADR-037 §3.
 *
 * The whole risk in this slice is the one ADR-005 names as a defect: a slice
 * that republishes every tick drives the renderer at 20 Hz forever. Regrowth is
 * a countdown, so the tempting projection — remaining ticks per worked node —
 * would change on every single tick of every regrow period. This one projects
 * the BOOLEAN instead, which changes exactly twice per node per cycle.
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { WILDS_MIN_X, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';
import { nodeAt } from '../content/resource-nodes';
import { createWorld, type World } from '../world/world';

import { projectWilds, wildsEqual } from './wilds-slice';

/** The first wild tile carrying a node, and the node on it. */
function firstNode(world: World): { tile: TileIndex; regrowTicks: number } {
  for (let y = 0; y < world.tiles.height; y += 1) {
    for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
      const tile = toIndexUnchecked(x, y);
      const node = nodeAt(world.resourceNodeRegistry, world.seed, tile);
      if (node !== null) return { tile, regrowTicks: node.regrowTicks };
    }
  }
  throw new Error('the wilds hold no nodes at all');
}

describe('what the wilds publish', () => {
  it('publishes nothing for an untouched wilderness', () => {
    // Node POSITIONS never cross this boundary: they are a hash of the seed,
    // which the renderer has (ADR-037 §3). Only what changed does.
    expect(projectWilds(createWorld(4242))).toEqual([]);
  });

  it('publishes a node that has just been worked', () => {
    const world = createWorld(4242);
    const { tile } = firstNode(world);
    world.harvestedAt.set(tile, world.tick);

    expect(projectWilds(world)).toEqual([tile]);
  });

  it('drops it again once it has regrown', () => {
    const world = createWorld(4242);
    const { tile, regrowTicks } = firstNode(world);
    world.harvestedAt.set(tile, world.tick);

    world.tick += regrowTicks;

    expect(projectWilds(world)).toEqual([]);
  });

  it('is ordered by tile, so equal states compare equal', () => {
    const world = createWorld(4242);
    const tiles: TileIndex[] = [];
    for (let y = 0; y < 6 && tiles.length < 3; y += 1) {
      for (let x = WILDS_MIN_X; x < WORLD_WIDTH && tiles.length < 3; x += 1) {
        const tile = toIndexUnchecked(x, y);
        if (nodeAt(world.resourceNodeRegistry, world.seed, tile) !== null) tiles.push(tile);
      }
    }
    // Inserted out of order on purpose — a Map preserves insertion order, so
    // an unsorted projection would republish on nothing but a re-gather.
    for (const tile of [...tiles].reverse()) world.harvestedAt.set(tile, world.tick);

    expect(projectWilds(world)).toEqual([...tiles].sort((a, b) => a - b));
  });

  it('ignores a stamp on a wild tile that holds no node', () => {
    // `pruneHarvested` clears these, but a save written by a build with more
    // content installed can carry one. Nothing may be drawn for it.
    const world = createWorld(4242);
    let bare: TileIndex | null = null;
    for (let x = WILDS_MIN_X; x < WORLD_WIDTH && bare === null; x += 1) {
      const tile = toIndexUnchecked(x, 0);
      if (nodeAt(world.resourceNodeRegistry, world.seed, tile) === null) bare = tile;
    }
    world.harvestedAt.set(bare!, world.tick);

    expect(projectWilds(world)).toEqual([]);
  });

  it('ignores a stamp on a FARM tile, whatever the hash says', () => {
    // `nodeAt` answers for any tile in the world by design (ADR-037 §5), so a
    // stamp left on the plot by an older build would otherwise draw a worked
    // node in the middle of the farm. Tile (10, 10) hashes to a node — which
    // is precisely why it is the one this asserts on.
    const world = createWorld(4242);
    const onFarm = toIndexUnchecked(10, 10);
    expect(nodeAt(world.resourceNodeRegistry, world.seed, onFarm)).not.toBeNull();
    world.harvestedAt.set(onFarm, world.tick);

    expect(projectWilds(world)).toEqual([]);
  });
});

describe('it does not republish every tick', () => {
  it('holds still for the whole of a regrow period', () => {
    // THE DEFECT ADR-005 §2 NAMES. A projection carrying "ticks remaining"
    // would differ on every tick and drive the renderer at 20 Hz forever.
    const world = createWorld(4242);
    const { tile, regrowTicks } = firstNode(world);
    world.harvestedAt.set(tile, world.tick);

    const first = projectWilds(world);
    let republished = 0;
    let previous = first;
    for (let i = 1; i < regrowTicks; i += 1) {
      world.tick += 1;
      const next = projectWilds(world);
      if (!wildsEqual(previous, next)) republished += 1;
      previous = next;
    }

    expect(republished).toBe(0);
  });

  it('republishes exactly once when the node comes back', () => {
    const world = createWorld(4242);
    const { tile, regrowTicks } = firstNode(world);
    world.harvestedAt.set(tile, world.tick);
    const worked = projectWilds(world);

    world.tick += regrowTicks;

    expect(wildsEqual(worked, projectWilds(world))).toBe(false);
  });
});

describe('the change test', () => {
  it('treats identical content as unchanged', () => {
    expect(wildsEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('notices a different length', () => {
    expect(wildsEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('notices a different tile at the same position', () => {
    expect(wildsEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });
});
