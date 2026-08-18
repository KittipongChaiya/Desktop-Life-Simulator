/**
 * Gathering in the wilds. Phase-27 — ADR-037.
 *
 * The cases that matter are the ones the derived model makes possible and the
 * ones a crew actually hits: two workers never take the same node, a worked
 * node comes back exactly one regrow period later, a full hold leaves the yield
 * in the ground, and the one stored map does not grow with playtime.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { WILDS_MIN_X, WORLD_WIDTH } from '../src/shared/constants';
import { toIndexUnchecked } from '../src/shared/geometry';
import type { TileIndex } from '../src/shared/ids';
import { readyNodeAt, selectGather } from '../src/sim/ai/gather';
import {
  gatherNode,
  pruneHarvested,
  validateGatherNode,
} from '../src/sim/commands/gather-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { nodeAt } from '../src/sim/content/resource-nodes';
import { DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems, containerTotal } from '../src/sim/world/container';
import { WorkerTaskKind, WORKER_CARRY_CAPACITY } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

/** The first wild tile carrying a node, for this world's seed. */
function firstNodeTile(world: World): TileIndex {
  for (let y = 0; y < world.tiles.height; y += 1) {
    for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
      const tile = toIndexUnchecked(x, y);
      if (nodeAt(world.resourceNodeRegistry, world.seed, tile) !== null) return tile;
    }
  }
  throw new Error('the wilds hold no nodes at all — density is misconfigured');
}

/**
 * A world whose workers are FORAGERS.
 *
 * Gathering is opt-in (ADR-037 §4 as amended): a worker with no schedule never
 * walks to the wilds, because a trip costs minutes and default-on emptied the
 * farm. The role is the opt-in, so every test here assigns it — which is also
 * the shape a player uses.
 */
function wildsWorld(workers = 1): World {
  const world = createWorld(4242);
  world.wallet.coins = 1_000_000;
  for (let i = 0; i < workers; i += 1) {
    expect(hireWorker(world, toIndexUnchecked(32, 32 + i)).ok).toBe(true);
  }
  for (const worker of world.workers.values()) {
    worker.schedule = { taskKinds: [WorkerTaskKind.Gather] };
  }
  return world;
}

describe('the wilds have something in them', () => {
  it('places nodes in the wild band', () => {
    const world = wildsWorld();
    let found = 0;
    for (let y = 0; y < world.tiles.height; y += 1) {
      for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
        if (nodeAt(world.resourceNodeRegistry, world.seed, toIndexUnchecked(x, y)) !== null) {
          found += 1;
        }
      }
    }
    // Core declares densities summing to 0.21 over a 32x64 band.
    expect(found).toBeGreaterThan(200);
    // And leaves most of it walkable — a band packed with nodes is a maze.
    expect(found).toBeLessThan(1_000);
  });

  it('registers three kinds through the public content API', () => {
    expect(wildsWorld().resourceNodeRegistry.size).toBe(3);
  });
});

describe('working a node', () => {
  it('puts the yield in the gatherer’s own hold', () => {
    const world = wildsWorld();
    const worker = [...world.workers.values()][0]!;
    const tile = firstNodeTile(world);

    expect(gatherNode(world, worker.id, tile).ok).toBe(true);
    expect(containerTotal(worker.carrying)).toBeGreaterThan(0);
  });

  it('stamps the tile so regrowth can be derived from it', () => {
    const world = wildsWorld();
    world.tick = 5_000;
    const worker = [...world.workers.values()][0]!;
    const tile = firstNodeTile(world);

    gatherNode(world, worker.id, tile);

    expect(world.harvestedAt.get(tile)).toBe(5_000);
  });

  it('refuses a node that has not regrown', () => {
    const world = wildsWorld();
    const worker = [...world.workers.values()][0]!;
    const tile = firstNodeTile(world);
    gatherNode(world, worker.id, tile);

    expect(validateGatherNode(world, worker.id, tile).ok).toBe(false);
  });

  it('lets it be worked again exactly one regrow period later', () => {
    const world = wildsWorld();
    const worker = [...world.workers.values()][0]!;
    const tile = firstNodeTile(world);
    const node = nodeAt(world.resourceNodeRegistry, world.seed, tile)!;
    gatherNode(world, worker.id, tile);
    worker.carrying.stacks = [];

    world.tick += node.regrowTicks;

    expect(validateGatherNode(world, worker.id, tile).ok).toBe(true);
  });

  it('refuses a tile with nothing on it', () => {
    const world = wildsWorld();
    const worker = [...world.workers.values()][0]!;
    // The farm side never holds a node.
    expect(validateGatherNode(world, worker.id, toIndexUnchecked(10, 10)).ok).toBe(false);
  });

  it('leaves the yield in the ground when the hold is full', () => {
    // Never silently discard (ADR-011 §7). The node stays unworked, so nothing
    // is lost and the worker retries once it has deposited.
    const world = wildsWorld();
    const worker = [...world.workers.values()][0]!;
    const tile = firstNodeTile(world);
    addItems(worker.carrying, 'core:wheat' as never, WORKER_CARRY_CAPACITY, DEFAULT_STACK_SIZE);

    expect(gatherNode(world, worker.id, tile).ok).toBe(false);
    expect(world.harvestedAt.has(tile)).toBe(false);
  });
});

describe('two workers never take the same node', () => {
  it('a second worker looks elsewhere', () => {
    const world = wildsWorld(2);
    const [first, second] = [...world.workers.values()];
    const tile = firstNodeTile(world);
    first!.task = { kind: WorkerTaskKind.Gather, tile };

    const task = selectGather(world, second!);

    expect(task).not.toBeNull();
    expect(task?.tile).not.toBe(tile);
  });

  it('offers the nearest ready node', () => {
    const world = wildsWorld();
    const worker = [...world.workers.values()][0]!;

    const task = selectGather(world, worker);

    expect(task?.kind).toBe(WorkerTaskKind.Gather);
    expect(readyNodeAt(world, task!.tile)).not.toBeNull();
  });

  it('offers nothing once every node has just been worked', () => {
    const world = wildsWorld();
    const worker = [...world.workers.values()][0]!;
    for (let y = 0; y < world.tiles.height; y += 1) {
      for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
        const tile = toIndexUnchecked(x, y);
        if (nodeAt(world.resourceNodeRegistry, world.seed, tile) !== null) {
          world.harvestedAt.set(tile, world.tick);
        }
      }
    }

    expect(selectGather(world, worker)).toBeNull();
  });
});

describe('the one stored map does not grow with playtime', () => {
  it('prunes an entry once its node has regrown', () => {
    // `SAVE_FORMAT.md` §3.4 names a collection that scales with playtime as
    // the hazard. An expired stamp carries no information: absent and
    // long-past mean the same thing to `isNodeReady`.
    const world = wildsWorld();
    const worker = [...world.workers.values()][0]!;
    const tile = firstNodeTile(world);
    const node = nodeAt(world.resourceNodeRegistry, world.seed, tile)!;
    gatherNode(world, worker.id, tile);
    expect(world.harvestedAt.size).toBe(1);

    world.tick += node.regrowTicks;
    pruneHarvested(world);

    expect(world.harvestedAt.size).toBe(0);
  });

  it('stays bounded across a long unattended run', () => {
    const world = wildsWorld(3);

    stepSimulationBy(world, 120_000);

    // Bounded by how many nodes exist and how long they take to come back —
    // never by how long the game has been running.
    expect(world.harvestedAt.size).toBeLessThan(1_000);
  });
});

describe('gathering reaches the farm economy', () => {
  it('a crew brings wild goods home unattended', () => {
    // Criterion 2's shape: what is out there has to arrive where the farm can
    // use it, through the deposit path that already exists.
    const world = wildsWorld(3);

    stepSimulationBy(world, 60_000);

    const held =
      containerTotal(world.inventory) +
      [...world.workers.values()].reduce((sum, w) => sum + containerTotal(w.carrying), 0);
    expect(held).toBeGreaterThan(0);
  });
});
