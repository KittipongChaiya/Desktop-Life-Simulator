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
  easedApproach,
  idleBob,
  interpolatedPosition,
  isColumnCulled,
  selectAnimation,
  workerRig,
  workerAtTile,
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
    // `Working` moved out of this case in 07.7e — see the working-animation
    // block below. It asserted `idle_s` here, which was accurate while nothing
    // selected the swing animation and is the defect now that something does.
    expect(selectAnimation(WorkerState.Idle, Direction.West)).toBe('idle_w');
    expect(selectAnimation(WorkerState.Rest, Direction.South)).toBe('idle_s');
    expect(selectAnimation(WorkerState.SeekingRest, Direction.North)).toBe('idle_n');
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

describe('workerAtTile', () => {
  const workers = [
    view({ id: 1, tile: tile(30, 30), toTile: tile(31, 30) }),
    view({ id: 2, tile: tile(34, 34), toTile: tile(34, 34) }),
  ];

  it('finds a worker standing on the tile', () => {
    expect(workerAtTile(workers, tile(34, 34))).toBe(2);
  });

  it('finds a moving worker by the tile it is stepping onto', () => {
    expect(workerAtTile(workers, tile(31, 30))).toBe(1);
  });

  it('returns null when no worker is on the tile', () => {
    expect(workerAtTile(workers, tile(10, 10))).toBeNull();
  });
});

/**
 * 07.7e — the animation polish additions.
 *
 * The first block is the one that mattered: `Working` fell through to `idle`,
 * so a worker tilling, planting, or harvesting stood perfectly still while a
 * six-frame swing animation sat unused in the atlas since phase-05.5.
 */
describe('working selects the swing that already existed', () => {
  it('animates a working worker instead of standing them still', () => {
    expect(selectAnimation(WorkerState.Working, Direction.South)).toBe('harvest');
  });

  it('uses one motion for every task, because that is the art there is', () => {
    for (const facing of [Direction.North, Direction.East, Direction.South, Direction.West]) {
      expect(selectAnimation(WorkerState.Working, facing)).toBe('harvest');
    }
  });

  it('leaves walking and idling exactly as they were', () => {
    expect(selectAnimation(WorkerState.Moving, Direction.North)).toBe('walk_n');
    expect(selectAnimation(WorkerState.Idle, Direction.West)).toBe('idle_w');
    expect(selectAnimation(WorkerState.Rest, Direction.East)).toBe('idle_e');
  });
});

describe('arrival easing', () => {
  it('pins both ends, so a step never overshoots its tile', () => {
    expect(easedApproach(0)).toBeCloseTo(0, 6);
    expect(easedApproach(1)).toBeCloseTo(1, 6);
  });

  it('runs ahead of linear, then settles — a step placed, not a slide', () => {
    expect(easedApproach(0.5)).toBeGreaterThan(0.5);
    for (let i = 1; i < 10; i += 1) expect(easedApproach(i / 10)).toBeGreaterThan(i / 10);
  });

  it('never reverses', () => {
    let previous = -1;
    for (let i = 0; i <= 20; i += 1) {
      const value = easedApproach(i / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('clamps a late or malformed frame rather than flinging the sprite', () => {
    expect(easedApproach(-1)).toBe(0);
    expect(easedApproach(4)).toBe(1);
    expect(easedApproach(Number.NaN)).toBe(1);
  });
});

describe('idle breathing', () => {
  it('stays within its amplitude', () => {
    for (let tick = 0; tick < 400; tick += 1) {
      expect(Math.abs(idleBob(tick, 1))).toBeLessThanOrEqual(1.0001);
    }
  });

  it('is derived, so the same worker breathes the same on every launch', () => {
    expect(idleBob(137, 4)).toBe(idleBob(137, 4));
  });

  it('puts workers out of phase, so a row does not pulse in lockstep', () => {
    const atTick = (id: number): number => idleBob(50, id);
    expect(atTick(1)).not.toBeCloseTo(atTick(2), 3);
    expect(atTick(2)).not.toBeCloseTo(atTick(3), 3);
  });

  it('actually moves over a cycle', () => {
    const samples = Array.from({ length: 60 }, (_, tick) => idleBob(tick, 7));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(1);
  });
});

describe('workerRig', () => {
  it('gives the base rig an empty prefix, so its bare keys still resolve', () => {
    // The worker rig shipped first as the default and its animation keys are
    // bare (`walk_s`, not `worker_walk_s`). Some worker must still select it.
    const prefixes = new Set(Array.from({ length: 200 }, (_, id) => workerRig(id)));

    expect(prefixes.has('')).toBe(true);
  });

  it('uses every rig that exists, and invents none', () => {
    const prefixes = new Set(Array.from({ length: 300 }, (_, id) => workerRig(id)));

    expect([...prefixes].sort()).toEqual(['', 'worker_b_', 'worker_c_']);
  });

  it('is stable — a worker does not change clothes between frames', () => {
    // A costume that moved would be a bug nobody could describe: the farm
    // would shimmer as workers were redrawn.
    for (const id of [0, 1, 7, 42, 1000]) {
      const first = workerRig(id);
      for (let repeat = 0; repeat < 5; repeat += 1) expect(workerRig(id)).toBe(first);
    }
  });

  it('does not deal the rigs out in order to the first hires', () => {
    // THE REASON THE HASH EXISTS. Worker ids are consecutive, so `id % 3`
    // would make the first three hires exactly one of each, every game,
    // forever — which reads as a rule rather than as people.
    const first = Array.from({ length: 9 }, (_, id) => workerRig(id));
    const cyclic = first.every((rig, index) => rig === first[index % 3]);

    expect(cyclic, 'rigs repeat with period 3 — this is a modulo, not a hash').toBe(false);
  });

  it('prefixes every animation the selector can return', () => {
    // The failure this catches is silent: `ANIMATIONS[key]` returns undefined
    // and the renderer draws nothing at all, which is what happened when the
    // rigs existed as sprites but had no manifest entries.
    expect(selectAnimation(WorkerState.Moving, Direction.South, 'worker_b_')).toBe(
      'worker_b_walk_s',
    );
    expect(selectAnimation(WorkerState.Idle, Direction.North, 'worker_c_')).toBe('worker_c_idle_n');
    expect(selectAnimation(WorkerState.Working, Direction.East, 'worker_b_')).toBe(
      'worker_b_harvest',
    );
    // And the base rig is unchanged, which is what keeps the committed art working.
    expect(selectAnimation(WorkerState.Moving, Direction.South)).toBe('walk_s');
  });
});
