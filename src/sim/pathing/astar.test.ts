/**
 * A* pathfinding. Phase-04b, GAME_DESIGN.md §4, acceptance criteria 9–13.
 *
 * 4-directional, deterministic (tie-breaks by lowest index, never RNG), and
 * failing explicitly on an unreachable goal rather than hanging.
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../shared/errors';
import { manhattanDistance, toIndexUnchecked, toPosition } from '../../shared/geometry';
import { asTileIndex, type TileIndex } from '../../shared/ids';
import { unwrap } from '../../shared/result';
import { CORE_STONE } from '../content/tile-kinds';
import { setKind, type TileGrid } from '../world/tile-grid';
import { createWorld, type World } from '../world/world';

import { findPath } from './astar';

/** Marks a tile as an impassable stone obstacle. */
function block(world: World, x: number, y: number): void {
  setKind(world.tiles, toIndexUnchecked(x, y), world.tileKinds.indexOf(CORE_STONE));
}

function every(path: readonly TileIndex[], predicate: (t: TileIndex) => boolean): boolean {
  return path.every(predicate);
}

function isStone(grid: TileGrid, tileKinds: World['tileKinds']): (t: TileIndex) => boolean {
  const stone = tileKinds.indexOf(CORE_STONE);
  return (t) => grid.kind[t] === stone;
}

describe('findPath on an open grid (crit 9)', () => {
  it('returns just the start tile when already at the goal', () => {
    const world = createWorld(1);
    const at = toIndexUnchecked(30, 30);
    expect(unwrap(findPath(world, at, at))).toEqual([at]);
  });

  it('steps to an adjacent goal', () => {
    const world = createWorld(1);
    const path = unwrap(findPath(world, toIndexUnchecked(30, 30), toIndexUnchecked(31, 30)));
    expect(path).toEqual([toIndexUnchecked(30, 30), toIndexUnchecked(31, 30)]);
  });

  it('produces an optimal-length path (manhattan + 1 tiles)', () => {
    const world = createWorld(1);
    const start = toIndexUnchecked(28, 28);
    const goal = toIndexUnchecked(34, 33);
    const path = unwrap(findPath(world, start, goal));
    const expectedLength =
      manhattanDistance(unwrap(toPosition(start)), unwrap(toPosition(goal))) + 1;
    expect(path).toHaveLength(expectedLength);
    expect(path[0]).toBe(start);
    expect(path[path.length - 1]).toBe(goal);
  });
});

describe('findPath around obstacles (crit 10)', () => {
  it('routes around a wall and never steps on an impassable tile', () => {
    const world = createWorld(1);
    // A three-wide stone wall across row y=31 blocking the direct column.
    block(world, 29, 31);
    block(world, 30, 31);
    block(world, 31, 31);

    const path = unwrap(findPath(world, toIndexUnchecked(30, 30), toIndexUnchecked(30, 32)));
    expect(path[0]).toBe(toIndexUnchecked(30, 30));
    expect(path[path.length - 1]).toBe(toIndexUnchecked(30, 32));
    expect(every(path, (t) => !isStone(world.tiles, world.tileKinds)(t))).toBe(true);
  });
});

describe('findPath failure (crit 11)', () => {
  it('fails explicitly when the goal is impassable', () => {
    const world = createWorld(1);
    const goal = toIndexUnchecked(30, 30);
    block(world, 30, 30);
    const result = findPath(world, toIndexUnchecked(28, 28), goal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.PathUnreachable);
  });

  it('fails explicitly when the goal is walled off, without hanging', () => {
    const world = createWorld(1);
    const goal = toIndexUnchecked(30, 30);
    // Enclose the goal on all four sides.
    block(world, 30, 29);
    block(world, 31, 30);
    block(world, 30, 31);
    block(world, 29, 30);
    const result = findPath(world, toIndexUnchecked(20, 20), goal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.PathUnreachable);
  });
});

describe('findPath determinism (crit 12, 13)', () => {
  it('produces an identical path from identical inputs', () => {
    const world = createWorld(1);
    const start = toIndexUnchecked(28, 28);
    const goal = toIndexUnchecked(35, 35);
    expect(unwrap(findPath(world, start, goal))).toEqual(unwrap(findPath(world, start, goal)));
  });

  it('breaks ties the same way every run (fixed neighbour order, lowest index)', () => {
    const world = createWorld(1);
    // Diagonal target: many equal-cost routes. The result must be stable.
    const a = unwrap(findPath(world, asTileIndex(2080), toIndexUnchecked(33, 33)));
    const b = unwrap(findPath(world, asTileIndex(2080), toIndexUnchecked(33, 33)));
    expect(a).toEqual(b);
  });
});
