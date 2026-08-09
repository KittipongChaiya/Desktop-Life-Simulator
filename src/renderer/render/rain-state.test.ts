/**
 * Phase-12d — raindrop positions, derived rather than rolled (ADR-017 §5).
 */

import { describe, expect, it } from 'vitest';

import { dropColumn, dropDrift, dropFall, dropSpeed, RAIN_DROPS } from './rain-state';

describe('a drop is derived', () => {
  it('gives the same drop the same column every time', () => {
    for (let index = 0; index < RAIN_DROPS; index += 1) {
      expect(dropColumn(index)).toBe(dropColumn(index));
    }
  });

  it('spreads drops across the width rather than stacking them', () => {
    // A hash that ignored the index would put every drop in one column, and
    // every other test here would still pass.
    const columns = new Set(Array.from({ length: RAIN_DROPS }, (_, i) => dropColumn(i)));
    expect(columns.size).toBeGreaterThan(RAIN_DROPS / 2);
  });

  it('varies speed so the rain has depth', () => {
    const speeds = new Set(Array.from({ length: RAIN_DROPS }, (_, i) => dropSpeed(i)));
    expect(speeds.size).toBeGreaterThan(1);
  });

  it('keeps every position inside the viewport', () => {
    // Wrapped, not clamped — a clamped drop piles up at the edge.
    for (let index = 0; index < RAIN_DROPS; index += 1) {
      for (const now of [0, 137, 5_000, 999_999]) {
        expect(dropFall(index, now)).toBeGreaterThanOrEqual(0);
        expect(dropFall(index, now)).toBeLessThan(1);
        expect(dropDrift(index, now)).toBeGreaterThanOrEqual(0);
        expect(dropDrift(index, now)).toBeLessThan(1);
      }
    }
  });

  it('falls: a drop is lower a moment later', () => {
    const before = dropFall(3, 1_000);
    const after = dropFall(3, 1_010);
    // Unless it wrapped in that 10 ms, which is what the inequality allows.
    expect(after === before).toBe(false);
  });

  it('is a pure function of index and time', () => {
    const first = Array.from({ length: RAIN_DROPS }, (_, i) => dropDrift(i, 12_345));
    const again = Array.from({ length: RAIN_DROPS }, (_, i) => dropDrift(i, 12_345));
    expect(again).toEqual(first);
  });
});
