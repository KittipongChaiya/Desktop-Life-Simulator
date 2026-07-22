/**
 * Pure worker-render maths. Phase-04c.
 *
 * Interpolation, animation-frame selection, and culling — no PixiJS, so the
 * geometry the renderer depends on is testable without a GPU.
 */

import { describe, expect, it } from 'vitest';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';
import { Direction, type WorkerView } from '../../sim/snapshot/workers-slice';
import { WorkerState } from '../../sim/world/worker';

import {
  currentFrame,
  interpolatedPosition,
  isColumnCulled,
  selectAnimation,
} from './worker-render';

const tile = (x: number, y: number): number => y * WORLD_WIDTH + x;

function view(overrides: Partial<WorkerView>): WorkerView {
  return {
    id: 1,
    tile: tile(10, 10),
    toTile: tile(10, 10),
    moveFraction: 0,
    facing: Direction.South,
    state: WorkerState.Idle,
    task: null,
    energy: 100,
    ...overrides,
  };
}

describe('interpolatedPosition', () => {
  it('places a stationary worker at its tile', () => {
    const stationary = view({ tile: tile(10, 12) });
    expect(interpolatedPosition(stationary, stationary, 0.5)).toEqual({
      x: 10 * TILE_SIZE,
      y: 12 * TILE_SIZE,
    });
  });

  it('interpolates within a tile step by moveFraction and between snapshots by alpha', () => {
    const from = tile(10, 10);
    const to = tile(11, 10); // one tile east
    const prev = view({ tile: from, toTile: to, moveFraction: 0.0 });
    const current = view({ tile: from, toTile: to, moveFraction: 0.5 });

    // Halfway between prev (0.0) and current (0.5) → fraction 0.25 of a tile.
    expect(interpolatedPosition(prev, current, 0.5)).toEqual({
      x: 10 * TILE_SIZE + 0.25 * TILE_SIZE,
      y: 10 * TILE_SIZE,
    });
  });
});

describe('selectAnimation', () => {
  it('walks in the facing direction while moving', () => {
    expect(selectAnimation(WorkerState.Moving, Direction.South)).toBe('walk_s');
    expect(selectAnimation(WorkerState.Moving, Direction.North)).toBe('walk_n');
    expect(selectAnimation(WorkerState.Moving, Direction.East)).toBe('walk_e');
    expect(selectAnimation(WorkerState.Moving, Direction.West)).toBe('walk_w');
  });

  it('idles in the facing direction otherwise', () => {
    expect(selectAnimation(WorkerState.Working, Direction.South)).toBe('idle_s');
    expect(selectAnimation(WorkerState.Idle, Direction.West)).toBe('idle_w');
  });
});

describe('currentFrame', () => {
  const walk = {
    frames: ['a', 'b', 'c', 'd'],
    frameTicks: 4,
    loop: true,
  };

  it('advances one frame per frameTicks and loops', () => {
    expect(currentFrame(walk, 0)).toBe('a');
    expect(currentFrame(walk, 4)).toBe('b');
    expect(currentFrame(walk, 8)).toBe('c');
    expect(currentFrame(walk, 16)).toBe('a'); // wrapped
  });

  it('holds a single-frame (idle) animation regardless of tick', () => {
    const idle = { frames: ['only'], frameTicks: 0, loop: false };
    expect(currentFrame(idle, 0)).toBe('only');
    expect(currentFrame(idle, 999)).toBe('only');
  });
});

describe('isColumnCulled', () => {
  it('culls a worker whose column is outside the visible range', () => {
    expect(isColumnCulled(tile(5, 10), 8, 20)).toBe(true);
    expect(isColumnCulled(tile(25, 10), 8, 20)).toBe(true);
  });

  it('keeps a worker inside the visible range', () => {
    expect(isColumnCulled(tile(10, 10), 8, 20)).toBe(false);
  });
});
