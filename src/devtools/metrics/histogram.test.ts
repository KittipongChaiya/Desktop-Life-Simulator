/**
 * Duration histogram tests. Phase-07.7M1.
 *
 * This exists to decide whether a performance budget was met, so its own
 * arithmetic is checked against hand-computed answers rather than against
 * itself. A percentile that is quietly off by one rank would let a phase
 * report PASS on a budget it missed, which is the failure this whole phase is
 * organised to prevent.
 */

import { describe, expect, it } from 'vitest';

import { createDurationHistogram, HISTOGRAM_CAPACITY } from './histogram';

/** Records 1..n milliseconds, so the expected percentiles are obvious. */
function ramp(
  n: number,
  capacity = HISTOGRAM_CAPACITY,
): ReturnType<typeof createDurationHistogram> {
  const histogram = createDurationHistogram(capacity);
  for (let i = 1; i <= n; i += 1) histogram.record(i);
  return histogram;
}

describe('an empty histogram', () => {
  it('reports zero rather than inventing a tail', () => {
    const histogram = createDurationHistogram();
    expect(histogram.percentile(99)).toBe(0);
    expect(histogram.average()).toBe(0);
    expect(histogram.max()).toBe(0);
    expect(histogram.count()).toBe(0);
  });
});

describe('percentiles, against hand-computed answers', () => {
  it('places p50 at the middle of 1..100', () => {
    expect(ramp(100).percentile(50)).toBe(50);
  });

  it('places p99 at 99, not at the maximum', () => {
    // The distinction that matters: p99 must not silently report the peak.
    const histogram = ramp(100);
    expect(histogram.percentile(99)).toBe(99);
    expect(histogram.max()).toBe(100);
  });

  it('places p95 at 95', () => {
    expect(ramp(100).percentile(95)).toBe(95);
  });

  it('reports the extremes at the ends', () => {
    const histogram = ramp(100);
    expect(histogram.percentile(100)).toBe(100);
    expect(histogram.percentile(0)).toBe(1);
  });

  it('is order-independent — the same samples answer the same shuffled', () => {
    const ascending = createDurationHistogram();
    for (let i = 1; i <= 50; i += 1) ascending.record(i);

    const shuffled = createDurationHistogram();
    for (const value of [7, 42, 1, 19, 50, 3]) shuffled.record(value);
    for (let i = 1; i <= 50; i += 1) {
      if (![7, 42, 1, 19, 50, 3].includes(i)) shuffled.record(i);
    }

    expect(shuffled.percentile(50)).toBe(ascending.percentile(50));
    expect(shuffled.percentile(99)).toBe(ascending.percentile(99));
  });

  it('exposes a tail that an average would hide', () => {
    // The reason p99 is the budget: 99 fast ticks and one slow one.
    const histogram = createDurationHistogram();
    for (let i = 0; i < 99; i += 1) histogram.record(1);
    histogram.record(500);

    expect(histogram.average()).toBeCloseTo(5.99, 2); // looks fine
    expect(histogram.percentile(99)).toBe(1); // 99% are still fast
    expect(histogram.max()).toBe(500); // and the tail is visible
  });

  it('clamps a percentile outside 0–100', () => {
    const histogram = ramp(10);
    expect(histogram.percentile(-5)).toBe(histogram.percentile(0));
    expect(histogram.percentile(400)).toBe(histogram.percentile(100));
  });
});

describe('the ring', () => {
  it('retains only the most recent window', () => {
    const histogram = ramp(20, 10);
    expect(histogram.count()).toBe(10);
    // 11..20 survive, so the median of the window is 15 or 16, never 10.
    expect(histogram.percentile(0)).toBe(11);
    expect(histogram.percentile(100)).toBe(20);
  });

  it('counts everything recorded, including what it overwrote', () => {
    const histogram = ramp(2000, 100);
    expect(histogram.count()).toBe(100);
    expect(histogram.total()).toBe(2000);
  });

  it('averages over everything, not just the window', () => {
    // A mean whose denominator silently changed would be unreadable.
    const histogram = ramp(100, 10);
    expect(histogram.average()).toBeCloseTo(50.5, 6);
  });

  it('keeps the all-time maximum even after it leaves the window', () => {
    const histogram = createDurationHistogram(4);
    histogram.record(99);
    for (let i = 0; i < 10; i += 1) histogram.record(1);

    expect(histogram.max()).toBe(99);
    expect(histogram.percentile(100)).toBe(1); // gone from the window
  });
});

describe('bad samples', () => {
  it('refuses a negative or non-finite duration', () => {
    // A clock adjustment is not a slow tick, and recording one would poison
    // every percentile taken after it.
    const histogram = createDurationHistogram();
    histogram.record(-1);
    histogram.record(Number.NaN);
    histogram.record(Number.POSITIVE_INFINITY);

    expect(histogram.count()).toBe(0);
    expect(histogram.total()).toBe(0);
  });

  it('accepts a zero-length tick', () => {
    // Real, and common: a tick that does nothing on a fast machine.
    const histogram = createDurationHistogram();
    histogram.record(0);
    expect(histogram.count()).toBe(1);
  });
});

describe('reset', () => {
  it('clears the window, the totals, and the peak', () => {
    const histogram = ramp(500);
    histogram.reset();

    expect(histogram.count()).toBe(0);
    expect(histogram.total()).toBe(0);
    expect(histogram.max()).toBe(0);
    expect(histogram.percentile(99)).toBe(0);
  });
});

describe('cost', () => {
  it('records a large run without growing anything', () => {
    // Allocation-free by construction; this asserts the window stays capped
    // however long the session runs.
    const histogram = createDurationHistogram(256);
    for (let i = 0; i < 100_000; i += 1) histogram.record(i % 7);

    expect(histogram.count()).toBe(256);
    expect(histogram.total()).toBe(100_000);
  });
});
