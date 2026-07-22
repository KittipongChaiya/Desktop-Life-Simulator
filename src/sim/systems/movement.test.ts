/**
 * Movement system. Phase-04b, GAME_DESIGN.md §4.3, acceptance criteria 14, 15.
 *
 * Advances `Moving` workers along their path at the §4.3 timings, recomputes the
 * route if the grid changes beneath them, and never jams: an obstacle that seals
 * the goal abandons the task cleanly.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked, type TilePosition } from '../../shared/geometry';
import { asWorkerId, type TileIndex } from '../../shared/ids';
import { unwrap } from '../../shared/result';
import { CORE_PATH, CORE_STONE } from '../content/tile-kinds';
import { findPath } from '../pathing/astar';
import { tickOrder } from '../tick';
import { setKind } from '../world/tile-grid';
import {
  createWorker,
  MAX_ENERGY,
  MOVE_TICKS_BASE,
  WorkerState,
  WorkerTaskKind,
  type Worker,
  type WorkerTask,
} from '../world/worker';
import { createWorld, type World } from '../world/world';

import { movementSystem } from './movement';

function movingWorker(
  world: World,
  id: number,
  path: readonly TileIndex[],
  goal: TileIndex,
): Worker {
  const worker = createWorker(asWorkerId(id), path[0] as TileIndex);
  worker.state = WorkerState.Moving;
  worker.path = path;
  worker.pathCursor = 0;
  const task: WorkerTask = { kind: WorkerTaskKind.Till, tile: goal };
  worker.task = task;
  world.workers.set(worker.id, worker);
  return worker;
}

function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) movementSystem(world);
}

describe('movementSystem placement', () => {
  it('runs after the worker decision and before the snapshot (same phase)', () => {
    const order = tickOrder();
    expect(order.indexOf('worker')).toBeLessThan(order.indexOf('movement'));
    expect(order.indexOf('movement')).toBeLessThan(order.indexOf('snapshot'));
  });
});

describe('movement timing (crit 14)', () => {
  it('crosses one grass tile in exactly the base tick count', () => {
    const world = createWorld(1);
    const a = toIndexUnchecked(30, 30);
    const b = toIndexUnchecked(31, 30);
    const worker = movingWorker(world, 1, [a, b], b);

    run(world, MOVE_TICKS_BASE - 1);
    expect(worker.position).toBe(a); // not there yet

    run(world, 1);
    expect(worker.position).toBe(b);
    expect(worker.state).toBe(WorkerState.Working); // arrived → starts the action
  });

  it('reaches the goal after the sum of per-tile timings', () => {
    const world = createWorld(1);
    const path = unwrap(findPath(world, toIndexUnchecked(28, 30), toIndexUnchecked(30, 30)));
    const worker = movingWorker(world, 1, path, toIndexUnchecked(30, 30));

    run(world, 2 * MOVE_TICKS_BASE); // two grass tiles
    expect(worker.position).toBe(toIndexUnchecked(30, 30));
    expect(worker.state).toBe(WorkerState.Working);
  });
});

describe('path speed (crit 15)', () => {
  it('crosses a core:path tile faster than grass', () => {
    const world = createWorld(1);
    const a = toIndexUnchecked(30, 30);
    const b = toIndexUnchecked(31, 30);
    setKind(world.tiles, b, world.tileKinds.indexOf(CORE_PATH)); // 0.7 cost → 7 ticks
    const worker = movingWorker(world, 1, [a, b], b);

    run(world, 6);
    expect(worker.position).toBe(a); // 7-tick tile, not there at 6

    run(world, 1);
    expect(worker.position).toBe(b); // arrived on the 7th tick, faster than grass's 10
  });
});

describe('energy while moving (§4.5)', () => {
  it('drains one point per period of movement', () => {
    const world = createWorld(1);
    const path = unwrap(findPath(world, toIndexUnchecked(28, 30), toIndexUnchecked(34, 30)));
    const worker = movingWorker(world, 1, path, toIndexUnchecked(34, 30));

    run(world, 20);
    expect(worker.energy).toBe(MAX_ENERGY - 1);
  });
});

describe('repathing when the grid changes (crit 10, 11)', () => {
  it('routes around an obstacle dropped ahead and still reaches the goal', () => {
    const world = createWorld(1);
    const start = toIndexUnchecked(30, 30);
    const goal = toIndexUnchecked(30, 34);
    const worker = movingWorker(world, 1, unwrap(findPath(world, start, goal)), goal);

    run(world, 15); // get moving
    // Drop a wall across the remaining direct route.
    for (const x of [29, 30, 31])
      setKind(world.tiles, toIndexUnchecked(x, 33), world.tileKinds.indexOf(CORE_STONE));

    // It must recompute and still arrive, without ever standing on stone.
    let arrived = false;
    for (let i = 0; i < 400 && !arrived; i += 1) {
      movementSystem(world);
      if (worker.position === goal) arrived = true;
    }
    expect(arrived).toBe(true);
  });

  it('abandons cleanly and never jams when the goal is sealed off', () => {
    const world = createWorld(1);
    const start = toIndexUnchecked(30, 30);
    const goal = toIndexUnchecked(30, 34);
    const worker = movingWorker(world, 1, unwrap(findPath(world, start, goal)), goal);

    run(world, 5);
    for (const [x, y] of [
      [30, 33],
      [31, 34],
      [30, 35],
      [29, 34],
    ] as const) {
      setKind(world.tiles, toIndexUnchecked(x, y), world.tileKinds.indexOf(CORE_STONE));
    }

    run(world, 50);
    expect(worker.state).not.toBe(WorkerState.Moving);
    expect(worker.task).toBeNull();
  });
});

describe('scope', () => {
  it('ignores workers that are not moving', () => {
    const world = createWorld(1);
    const at: TilePosition = { x: 30, y: 30 };
    const idle = createWorker(asWorkerId(1), toIndexUnchecked(at.x, at.y));
    world.workers.set(idle.id, idle);

    run(world, 10);
    expect(idle.state).toBe(WorkerState.Idle);
    expect(idle.position).toBe(toIndexUnchecked(30, 30));
  });
});
