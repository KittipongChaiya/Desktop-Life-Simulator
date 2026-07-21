/**
 * Game loop tests: pause/resume and time scaling. ADR-007.
 */

import { describe, expect, it } from 'vitest';

import { TICK_MS, TICKS_PER_SECOND } from '../../shared/constants';
import { createWorld } from '../../sim/world/world';

import { createGameLoop } from './game-loop';
import { createSnapshotStore } from './snapshot-store';

/** A loop driven by an explicit clock, so no test depends on wall time. */
function harness() {
  const world = createWorld(1);
  const store = createSnapshotStore(world.snapshots);

  let now = 0;
  let frame: ((timestamp: number) => void) | null = null;

  const loop = createGameLoop({
    world,
    store,
    now: () => now,
    schedule: (callback) => {
      frame = callback;
      return 1;
    },
    cancel: () => {
      frame = null;
    },
  });

  /** Advances wall time by `ms` in 60fps steps. */
  const advance = (ms: number): void => {
    const step = 1000 / 60;
    for (let elapsed = 0; elapsed < ms; elapsed += step) {
      now += step;
      frame?.(now);
    }
  };

  return { world, loop, advance };
}

describe('pause and resume', () => {
  it('stops advancing the simulation while paused', () => {
    const { world, loop, advance } = harness();
    loop.start();
    advance(1000);

    const atPause = world.tick;
    expect(atPause).toBeGreaterThan(0);

    loop.pause();
    advance(2000);
    expect(world.tick).toBe(atPause);
  });

  it('resumes without replaying the paused duration', () => {
    // Banking paused time would produce a burst of ticks on resume.
    const { world, loop, advance } = harness();
    loop.start();
    loop.pause();
    advance(5000);

    loop.resume();
    advance(1000);

    expect(world.tick).toBeLessThanOrEqual(TICKS_PER_SECOND + 2);
  });

  it('reports its paused state', () => {
    const { loop } = harness();
    expect(loop.isPaused()).toBe(false);
    loop.pause();
    expect(loop.isPaused()).toBe(true);
    loop.resume();
    expect(loop.isPaused()).toBe(false);
  });

  it('steps explicitly even while paused', () => {
    const { world, loop } = harness();
    loop.pause();
    loop.step(10);

    expect(world.tick).toBe(10);
  });

  it('rejects a non-positive step count', () => {
    const { loop } = harness();
    expect(() => loop.step(0)).toThrow();
    expect(() => loop.step(-1)).toThrow();
    expect(() => loop.step(1.5)).toThrow();
  });
});

describe('time scaling', () => {
  it('defaults to 1', () => {
    expect(harness().loop.timeScale()).toBe(1);
  });

  it('produces more ticks per real second when scaled up', () => {
    const base = harness();
    base.loop.start();
    base.advance(1000);

    const fast = harness();
    fast.loop.setTimeScale(3);
    fast.loop.start();
    fast.advance(1000);

    expect(fast.world.tick).toBeGreaterThan(base.world.tick);
  });

  it('produces fewer ticks when scaled down', () => {
    const base = harness();
    base.loop.start();
    base.advance(1000);

    const slow = harness();
    slow.loop.setTimeScale(0.5);
    slow.loop.start();
    slow.advance(1000);

    expect(slow.world.tick).toBeLessThan(base.world.tick);
  });

  it('never changes the tick duration', () => {
    // Scaling multiplies ticks-per-frame; TICK_MS is frozen (ADR-007 §7).
    // If scaling stretched a tick, tick counts would stop mapping to game time
    // and every authored duration would silently drift.
    const { loop } = harness();
    loop.setTimeScale(4);

    expect(TICK_MS).toBe(1000 / TICKS_PER_SECOND);
    expect(loop.timeScale()).toBe(4);
  });

  it('visits the same tick states, only sooner', () => {
    // A scaled run must be a fast-forward, not a different simulation.
    const slow = harness();
    slow.loop.start();
    slow.advance(4000);

    const fast = harness();
    fast.loop.setTimeScale(4);
    fast.loop.start();
    fast.advance(1000);

    expect(fast.world.rng.getState()).toEqual(slow.world.rng.getState());
  });

  it('rejects a non-positive or non-finite scale', () => {
    const { loop } = harness();
    expect(() => loop.setTimeScale(0)).toThrow();
    expect(() => loop.setTimeScale(-2)).toThrow();
    expect(() => loop.setTimeScale(Number.NaN)).toThrow();
    expect(() => loop.setTimeScale(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('stays bounded by the catch-up cap under an extreme scale', () => {
    // Scaling must not defeat the spiral-of-death guard (ADR-007 §3).
    const { world, loop, advance } = harness();
    loop.setTimeScale(1000);
    loop.start();
    advance(1000);

    // 60 frames, at most MAX_CATCHUP_TICKS each.
    expect(world.tick).toBeLessThanOrEqual(60 * 5 + 5);
  });
});

describe('independence from render rate', () => {
  it('produces the same tick count at 30fps and 144fps', () => {
    // The simulation must never depend on how often frames happen.
    const run = (fps: number): number => {
      const world = createWorld(1);
      const store = createSnapshotStore(world.snapshots);
      let now = 0;
      let frame: ((t: number) => void) | null = null;

      const loop = createGameLoop({
        world,
        store,
        now: () => now,
        schedule: (cb) => {
          frame = cb;
          return 1;
        },
        cancel: () => undefined,
      });
      loop.start();

      const step = 1000 / fps;
      for (let elapsed = 0; elapsed < 1000; elapsed += step) {
        now += step;
        frame?.(now);
      }
      return world.tick;
    };

    expect(run(30)).toBe(run(144));
  });
});
