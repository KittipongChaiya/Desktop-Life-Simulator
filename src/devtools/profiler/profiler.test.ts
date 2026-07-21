/**
 * Profiler tests. Phase-01.5 deliverable 3.
 */

import { describe, expect, it } from 'vitest';

import { createNullProfiler, createProfiler } from './profiler';

/**
 * Deterministic clock returning scripted readings in order.
 *
 * `begin()` takes the first reading and the returned end-function takes the
 * second, so [0, 5] yields a 5ms sample.
 */
function scriptedClock(readings: readonly number[]) {
  let index = 0;
  return () => readings[Math.min(index++, readings.length - 1)] ?? 0;
}

describe('measurement', () => {
  it('records a scope duration', () => {
    const profiler = createProfiler({ now: scriptedClock([0, 5]) });
    profiler.begin('sim')();

    const [stat] = profiler.stats();
    expect(stat?.name).toBe('sim');
    expect(stat?.last).toBe(5);
    expect(stat?.count).toBe(1);
  });

  it('measure() returns the wrapped value and still records', () => {
    const profiler = createProfiler({ now: scriptedClock([0, 3]) });
    const result = profiler.measure('work', () => 42);

    expect(result).toBe(42);
    expect(profiler.stats()[0]?.count).toBe(1);
  });

  it('records even when the measured function throws', () => {
    const profiler = createProfiler({ now: scriptedClock([0, 2]) });

    expect(() =>
      profiler.measure('bad', () => {
        throw new Error('x');
      }),
    ).toThrow();
    expect(profiler.stats()[0]?.count).toBe(1);
  });

  it('creates scopes on first use, so new subsystems need no registration', () => {
    const profiler = createProfiler({ now: scriptedClock([0, 1]) });
    profiler.record('brand-new-subsystem', 1);

    expect(profiler.stats().map((s) => s.name)).toContain('brand-new-subsystem');
  });
});

describe('statistics', () => {
  it('computes mean, p95, and max', () => {
    const profiler = createProfiler();
    for (const value of [1, 2, 3, 4, 100]) profiler.record('s', value);

    const [stat] = profiler.stats();
    expect(stat?.mean).toBeCloseTo(22, 5);
    expect(stat?.max).toBe(100);
    expect(stat?.p95).toBe(100);
  });

  it('sorts scopes by descending mean cost', () => {
    const profiler = createProfiler();
    profiler.record('cheap', 1);
    profiler.record('expensive', 50);

    expect(profiler.stats().map((s) => s.name)).toEqual(['expensive', 'cheap']);
  });

  it('bounds memory with a rolling window over a long run', () => {
    const profiler = createProfiler();
    for (let i = 0; i < 10_000; i += 1) profiler.record('s', i % 7);

    const [stat] = profiler.stats();
    expect(stat?.count).toBe(10_000);
    // Mean reflects the recent window, not all 10k samples.
    expect(stat?.mean).toBeLessThan(7);
  });

  it('reports nothing before any sample', () => {
    expect(createProfiler().stats()).toHaveLength(0);
  });

  it('clears on reset', () => {
    const profiler = createProfiler();
    profiler.record('s', 1);
    profiler.reset();

    expect(profiler.stats()).toHaveLength(0);
  });
});

describe('null profiler', () => {
  it('records nothing but still returns measured values', () => {
    const profiler = createNullProfiler();
    expect(profiler.measure('x', () => 7)).toBe(7);
    profiler.record('x', 100);
    expect(profiler.stats()).toHaveLength(0);
  });
});
