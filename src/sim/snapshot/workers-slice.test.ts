/**
 * Worker snapshot projection. Phase-04c (view layer), ADR-005 §2.
 *
 * The sim→view boundary for workers. These tests pin the guarantees the render
 * layer will rely on: the projection is pure and deterministic, it is plain
 * presentation data (no reference into the simulation escapes), and mutating a
 * snapshot cannot touch the world.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asWorkerId } from '../../shared/ids';
import { CommandSource } from '../commands/types';
import { stepSimulation, stepSimulationBy } from '../tick';
import { addCoins } from '../world/wallet';
import { createWorker, WorkerState, WorkerTaskKind, type Worker } from '../world/worker';
import { createWorld, type World } from '../world/world';

import { Direction, projectWorkers, workersEqual } from './workers-slice';

function addWorker(world: World, id: number, tile = toIndexUnchecked(32, 32)): Worker {
  const worker = createWorker(asWorkerId(id), tile);
  world.workers.set(worker.id, worker);
  return worker;
}

describe('projectWorkers', () => {
  it('projects an idle worker with a stable, camera-facing default', () => {
    const world = createWorld(1);
    addWorker(world, 1, toIndexUnchecked(32, 32));

    const [view] = projectWorkers(world);
    expect(view).toEqual({
      id: 1,
      tile: toIndexUnchecked(32, 32),
      toTile: toIndexUnchecked(32, 32),
      moveFraction: 0,
      facing: Direction.South,
      state: WorkerState.Idle,
      task: null,
      energy: 100,
      // Empty-handed. Projected from phase-28 so the map panel's Send button
      // can disable where the send command would reject anyway — a worker
      // leaves on an expedition carrying nothing (ADR-038 §5).
      carrying: 0,
      // An unconstrained worker matches `core:farmhand`, which declares no
      // constraints — the identity role, so this is a real match rather than
      // a fallback (phase-14d).
      role: 'core:farmhand',
    });
  });

  it('projects a moving worker with its next tile, fraction, and facing', () => {
    const world = createWorld(1);
    const from = toIndexUnchecked(32, 32);
    const to = toIndexUnchecked(32, 31); // one tile north
    const worker = addWorker(world, 1, from);
    worker.state = WorkerState.Moving;
    worker.path = [from, to];
    worker.pathCursor = 0;
    worker.actionProgress = 5; // halfway across a 10-tick grass tile

    const [view] = projectWorkers(world);
    expect(view?.toTile).toBe(to);
    expect(view?.facing).toBe(Direction.North);
    expect(view?.moveFraction).toBeCloseTo(0.5, 5);
  });

  it('orders workers by id, deterministically', () => {
    const world = createWorld(1);
    addWorker(world, 3);
    addWorker(world, 1);
    addWorker(world, 2);
    expect(projectWorkers(world).map((w) => w.id)).toEqual([1, 2, 3]);
  });

  it('is a pure function — identical calls return equal data', () => {
    const world = createWorld(1);
    addWorker(world, 1);
    expect(projectWorkers(world)).toEqual(projectWorkers(world));
  });

  it('identical simulation state produces identical snapshots', () => {
    const build = (): World => {
      const world = createWorld(4242);
      addCoins(world.wallet, 150); // hiring charges since 06c
      world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
      stepSimulationBy(world, 137);
      return world;
    };
    expect(projectWorkers(build())).toEqual(projectWorkers(build()));
  });
});

describe('the snapshot carries no reference into the simulation', () => {
  it('copies the task rather than aliasing the worker record', () => {
    const world = createWorld(1);
    const worker = addWorker(world, 1);
    worker.task = { kind: WorkerTaskKind.Till, tile: toIndexUnchecked(30, 30) };

    const [view] = projectWorkers(world);
    expect(view?.task).toEqual({ kind: WorkerTaskKind.Till, tile: toIndexUnchecked(30, 30) });
    expect(view?.task).not.toBe(worker.task); // fresh object, not the sim's
  });

  it('is plain data — a JSON round-trip is identical', () => {
    const world = createWorld(1);
    addWorker(world, 1);
    const slice = projectWorkers(world);
    expect(JSON.parse(JSON.stringify(slice))).toEqual(slice);
  });

  it('mutating the snapshot does not reach back into the world', () => {
    const world = createWorld(1);
    const worker = addWorker(world, 1);
    const view = projectWorkers(world)[0] as { energy: number };
    view.energy = -999;
    expect(worker.energy).toBe(100); // untouched
  });
});

describe('workersEqual', () => {
  it('is true for equal projections and false when any field differs', () => {
    const world = createWorld(1);
    const worker = addWorker(world, 1);
    const before = projectWorkers(world);
    expect(workersEqual(before, projectWorkers(world))).toBe(true);

    worker.energy = 50;
    expect(workersEqual(before, projectWorkers(world))).toBe(false);
  });

  it('detects a changed count', () => {
    const world = createWorld(1);
    addWorker(world, 1);
    const one = projectWorkers(world);
    addWorker(world, 2);
    expect(workersEqual(one, projectWorkers(world))).toBe(false);
  });
});

describe('snapshotSystem publishes the workers slice', () => {
  it('bumps the version as a worker acts, and reflects it in the slice', () => {
    const world = createWorld(1);
    addCoins(world.wallet, 150); // hiring charges since 06c
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    stepSimulation(world); // hire applies; worker begins acting

    expect(world.snapshots.workers.value).toHaveLength(1);
    const versionAfterHire = world.snapshots.workers.version;
    expect(versionAfterHire).toBeGreaterThan(0);

    // Over a working span the view changes (the worker moves between tiles, and
    // its energy ticks down), so the slice republishes. A stationary, unchanged
    // worker would correctly NOT bump — that is the render-on-demand win.
    stepSimulationBy(world, 100);
    expect(world.snapshots.workers.version).toBeGreaterThan(versionAfterHire);
  });
});
