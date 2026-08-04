/**
 * Entity inspector — the worker provider. Phase-07.8d.
 *
 * The six facts §3 names, and the split that makes them honest: the worker is
 * PICKED by what is drawn and DESCRIBED by what the simulation holds. Both
 * halves are tested here, because picking the wrong worker and describing the
 * right one wrongly look identical from the panel.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asContentId, asWorkerId, type TileIndex } from '../../shared/ids';
import type { WorkerView } from '../../sim/snapshot/workers-slice';
import { Direction } from '../../sim/snapshot/workers-slice';
import { createWorker, WorkerState, type Worker } from '../../sim/world/worker';
import { createWorld, type World } from '../../sim/world/world';

import {
  createWorkerInspectProvider,
  describeWorker,
  readWorkerFacts,
  type WorkerFacts,
} from './worker-inspector';

const HOME = toIndexUnchecked(32, 32);

function worldWith(worker: Worker): World {
  const world = createWorld(1);
  world.workers.set(worker.id, worker);
  return world;
}

function facts(world: World, id = 3): WorkerFacts {
  const read = readWorkerFacts(world, asWorkerId(id));
  if (read === null) throw new Error(`expected facts for worker ${String(id)}`);
  return read;
}

function valueOf(read: WorkerFacts, label: string): string | undefined {
  return describeWorker(read).fields.find((f) => f.label === label)?.value;
}

/** A drawn worker. Only the fields picking reads have to be real. */
function view(id: number, tile: number, toTile = tile): WorkerView {
  return {
    id,
    tile,
    toTile,
    moveFraction: 0,
    facing: Direction.South,
    state: WorkerState.Idle,
    task: null,
    energy: 100,
  };
}

describe('readWorkerFacts', () => {
  it('reports nothing for a worker that is not there', () => {
    expect(readWorkerFacts(createWorld(1), asWorkerId(99))).toBeNull();
  });

  it('reports the identity, position, state and energy', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    worker.energy = 87;

    const read = facts(worldWith(worker));

    expect(read.id).toBe(3);
    expect(read.tile).toBe(HOME);
    expect(read.state).toBe(WorkerState.Idle);
    expect(read.energy).toBe(87);
  });

  it('reports the claimed task, and null when there is none', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    expect(facts(worldWith(worker)).task).toBeNull();

    worker.task = { kind: 'harvest', tile: toIndexUnchecked(30, 30) };
    expect(facts(worldWith(worker)).task).toEqual({
      kind: 'harvest',
      tile: toIndexUnchecked(30, 30),
    });
  });

  it('reports what is being carried, which no snapshot projects', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    worker.carrying.stacks = [
      { item: asContentId('core:wheat'), quantity: 7 },
      { item: asContentId('core:carrot'), quantity: 2 },
    ];

    const read = facts(worldWith(worker));

    expect(read.carrying).toEqual([
      { item: 'core:wheat', quantity: 7 },
      { item: 'core:carrot', quantity: 2 },
    ]);
    expect(read.carriedTotal).toBe(9);
    expect(read.carryCapacity).toBe(20);
  });

  it('reports the destination as the end of the route it is walking', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    const goal = toIndexUnchecked(30, 30);
    worker.path = [HOME, toIndexUnchecked(31, 32), goal];
    worker.pathCursor = 1;

    const read = facts(worldWith(worker));

    expect(read.destination).toBe(goal);
    expect(read.pathLength).toBe(3);
    expect(read.pathWalked).toBe(1);
  });

  it('falls back to the task tile when a route has not been planned yet', () => {
    // The gap between claiming work and pathing to it is exactly when a worker
    // looks stuck, so "no path" must not read as "going nowhere".
    const worker = createWorker(asWorkerId(3), HOME);
    worker.task = { kind: 'till', tile: toIndexUnchecked(28, 28) };

    const read = facts(worldWith(worker));

    expect(read.destination).toBe(toIndexUnchecked(28, 28));
    expect(read.pathLength).toBe(0);
  });

  it('has no destination when it is neither working nor walking', () => {
    expect(facts(worldWith(createWorker(asWorkerId(3), HOME))).destination).toBeNull();
  });
});

describe('describeWorker', () => {
  const idle = (): WorkerFacts => facts(worldWith(createWorker(asWorkerId(3), HOME)));

  it('titles the section with the worker it describes', () => {
    expect(describeWorker(idle()).title).toBe('Worker #3');
  });

  it('renders every fact the brief asks for', () => {
    expect(describeWorker(idle()).fields.map((f) => f.label)).toEqual([
      'Tile',
      'State',
      'Task',
      'Energy',
      'Carrying',
      'Destination',
      'Path',
    ]);
  });

  it('says "none" for what it read and found absent', () => {
    const read = idle();

    expect(valueOf(read, 'Task')).toBe('none');
    expect(valueOf(read, 'Destination')).toBe('none');
    expect(valueOf(read, 'Path')).toBe('none');
  });

  it('states energy against its maximum, so the number has a scale', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    worker.energy = 42;

    expect(valueOf(facts(worldWith(worker)), 'Energy')).toBe('42 / 100');
  });

  it('states the carried load against the hold it fills', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    worker.carrying.stacks = [{ item: asContentId('core:wheat'), quantity: 7 }];

    expect(valueOf(facts(worldWith(worker)), 'Carrying')).toBe('core:wheat ×7 · 7/20');
  });

  it('reports an empty hold as empty rather than unavailable', () => {
    expect(valueOf(idle(), 'Carrying')).toBe('none · 0/20');
  });

  it('names a tile by coordinates as well as index, because a raw index is unreadable', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    worker.task = { kind: 'plant', tile: toIndexUnchecked(28, 29) };

    expect(valueOf(facts(worldWith(worker)), 'Destination')).toBe(
      `28,29 (#${String(toIndexUnchecked(28, 29))})`,
    );
    expect(valueOf(facts(worldWith(worker)), 'Task')).toBe(
      `plant → 28,29 (#${String(toIndexUnchecked(28, 29))})`,
    );
  });

  it('states how far along a route the worker has walked', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    worker.path = [HOME, toIndexUnchecked(31, 32), toIndexUnchecked(30, 32)];
    worker.pathCursor = 2;

    expect(valueOf(facts(worldWith(worker)), 'Path')).toBe('3 tiles · 2 walked');
  });
});

describe('createWorkerInspectProvider', () => {
  function provider(world: World, views: readonly WorkerView[], tile: TileIndex | null) {
    return createWorkerInspectProvider({
      source: () => world,
      views: () => views,
      tileAt: () =>
        tile === null
          ? null
          : { x: tile % world.tiles.width, y: Math.floor(tile / world.tiles.width) },
    });
  }

  it('describes the worker under the pointer', () => {
    const worker = createWorker(asWorkerId(3), HOME);
    const world = worldWith(worker);

    const section = provider(world, [view(3, HOME)], HOME).inspect({ kind: 'pointer', x: 0, y: 0 });
    expect(section?.title).toBe('Worker #3');
  });

  it('picks the worker stepping ONTO the tile, matching what is drawn', () => {
    // A moving worker is drawn between two tiles. The renderer's own picking
    // accepts either, so pointing just ahead of a walker selects it — and the
    // inspector reuses that rule rather than restating it.
    const worker = createWorker(asWorkerId(3), HOME);
    const world = worldWith(worker);
    const ahead = toIndexUnchecked(31, 32);

    const section = provider(world, [view(3, HOME, ahead)], ahead).inspect({
      kind: 'pointer',
      x: 0,
      y: 0,
    });
    expect(section?.title).toBe('Worker #3');
  });

  it('says nothing when no worker is on the tile', () => {
    const world = worldWith(createWorker(asWorkerId(3), HOME));
    const elsewhere = toIndexUnchecked(10, 10);

    expect(
      provider(world, [view(3, HOME)], elsewhere).inspect({ kind: 'pointer', x: 0, y: 0 }),
    ).toBeNull();
  });

  it('says nothing when the pointer is off the world', () => {
    const world = worldWith(createWorker(asWorkerId(3), HOME));

    expect(
      provider(world, [view(3, HOME)], null).inspect({ kind: 'pointer', x: 0, y: 0 }),
    ).toBeNull();
  });

  it('describes from the store, not from the drawn view', () => {
    // The view carries no `carrying` at all — if this reported an empty hold,
    // the provider would be describing the sprite rather than the worker.
    const worker = createWorker(asWorkerId(3), HOME);
    worker.carrying.stacks = [{ item: asContentId('core:wheat'), quantity: 7 }];
    const world = worldWith(worker);

    const section = provider(world, [view(3, HOME)], HOME).inspect({ kind: 'pointer', x: 0, y: 0 });
    expect(section?.fields.find((f) => f.label === 'Carrying')?.value).toContain('core:wheat ×7');
  });

  it('says nothing for a worker the view knows and the store does not', () => {
    // A stale slice outlives a removed worker by one publish. Describing it
    // from an empty store would invent a worker with no energy and no tile.
    const world = createWorld(1);

    expect(
      provider(world, [view(3, HOME)], HOME).inspect({ kind: 'pointer', x: 0, y: 0 }),
    ).toBeNull();
  });
});
