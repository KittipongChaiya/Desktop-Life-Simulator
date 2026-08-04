/**
 * Performance series. Phase-07.8h.
 *
 * The plotting maths, tested where it is cheap to test: a graph that silently
 * divides by zero on a flat series, or scales a 60-second window against the
 * wrong bounds, is wrong in a way a screenshot will not show.
 */

import { describe, expect, it } from 'vitest';

import { heapMegabytes } from './heap';
import { pushSample, seriesPath, seriesRange } from './series';

describe('pushSample', () => {
  it('appends until the window is full, then slides', () => {
    let series: readonly number[] = [];
    for (const value of [1, 2, 3, 4]) series = pushSample(series, value, 3);

    expect(series).toEqual([2, 3, 4]);
  });

  it('returns a new array, so a committed series is never mutated underneath', () => {
    const first: readonly number[] = [1];
    const second = pushSample(first, 2, 4);

    expect(first).toEqual([1]);
    expect(second).not.toBe(first);
  });

  it('holds a window of exactly the capacity asked for', () => {
    let series: readonly number[] = [];
    for (let i = 0; i < 500; i += 1) series = pushSample(series, i, 120);

    expect(series).toHaveLength(120);
    expect(series.at(-1)).toBe(499);
  });
});

describe('seriesRange', () => {
  it('reports the bounds a graph should scale against', () => {
    expect(seriesRange([3, 9, 1])).toEqual({ min: 1, max: 9 });
  });

  it('gives a flat series a non-zero span, so it draws a line and not a divide', () => {
    // A flat series is the NORMAL case for an idle farm: fps 0, forever.
    const range = seriesRange([5, 5, 5]);

    expect(range.max).toBeGreaterThan(range.min);
  });

  it('centres a flat series, so a steady 60 fps does not read as a stall', () => {
    const range = seriesRange([60, 60]);

    expect(60 - range.min).toBeCloseTo(range.max - 60);
    expect(seriesPath([60, 60], 100, 20)).toBe('0.0,10.0 100.0,10.0');
  });

  it('handles an empty series without inventing data', () => {
    expect(seriesRange([])).toEqual({ min: 0, max: 1 });
  });
});

describe('seriesPath', () => {
  it('draws nothing for an empty series', () => {
    expect(seriesPath([], 100, 20)).toBe('');
  });

  it('places a single sample at the right edge', () => {
    // One point is a line of zero length; it still has to appear, because "no
    // data yet" and "the value is zero" must look different.
    expect(seriesPath([5], 100, 20)).toContain('100.0,');
  });

  it('spans the full width and inverts the y axis', () => {
    const path = seriesPath([0, 10], 100, 20);
    const points = path.split(' ').map((p) => p.split(',').map(Number));

    expect(points[0]?.[0]).toBe(0);
    expect(points.at(-1)?.[0]).toBe(100);
    // Larger values sit HIGHER, which is upward on screen: smaller y.
    expect(points[0]?.[1]).toBeGreaterThan(points.at(-1)?.[1] ?? 0);
  });

  it('keeps every point inside the box it was given', () => {
    const path = seriesPath([1, 50, 3, 99, 0], 200, 40);

    for (const point of path.split(' ')) {
      const [x, y] = point.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(200);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(40);
    }
  });

  it('draws a flat series as a flat line rather than NaN', () => {
    const path = seriesPath([7, 7, 7], 60, 10);

    expect(path).not.toContain('NaN');
    const ys = path.split(' ').map((p) => Number(p.split(',')[1]));
    expect(new Set(ys).size).toBe(1);
  });
});

describe('heapMegabytes', () => {
  it('reports nothing where the runtime does not expose a heap', () => {
    // `performance.memory` is a non-standard Chromium extension. Absent is the
    // honest answer, not zero — a graph plotting 0 MB would read as a leak fix.
    expect(heapMegabytes({})).toBeNull();
  });

  it('converts bytes to megabytes', () => {
    expect(heapMegabytes({ memory: { usedJSHeapSize: 12 * 1024 * 1024 } })).toBeCloseTo(12);
  });

  it('rejects a value that is present but not a number', () => {
    expect(heapMegabytes({ memory: {} as { usedJSHeapSize: number } })).toBeNull();
  });
});
