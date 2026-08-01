/**
 * Presentation randomness tests. Phase-07.7b, ADR-017 §5.
 *
 * The property that matters is STATELESSNESS. Every other assertion here is
 * ordinary; the interleaving test is the one that would catch the failure this
 * module exists to prevent — a decorative animation drawing from a generator
 * and, by advancing it, desynchronising every future tick from a saved game.
 */

import { describe, expect, it } from 'vitest';

import { derivedIndex, derivedRange, derivedUnit, mix } from './presentation-rng';

describe('the mixer', () => {
  it('returns the same value for the same inputs, always', () => {
    expect(mix(1, 2)).toBe(mix(1, 2));
    expect(mix(0, 0)).toBe(mix(0, 0));
    expect(mix(7, 4096)).toBe(mix(7, 4096));
  });

  it('separates neighbouring inputs', () => {
    // Adjacent tiles must not produce adjacent results, or a field of decor
    // lines up in visible bands.
    const a = mix(1, 100);
    const b = mix(1, 101);
    expect(a).not.toBe(b);
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });

  it('is order-sensitive', () => {
    expect(mix(3, 9)).not.toBe(mix(9, 3));
  });

  it('stays a non-negative 32-bit integer', () => {
    for (const [a, b] of [
      [0, 0],
      [-1, -1],
      [2_147_483_647, 2_147_483_647],
      [123, 456_789],
    ]) {
      const value = mix(a ?? 0, b ?? 0);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffff_ffff);
    }
  });
});

describe('statelessness — the ADR-017 §5 guarantee', () => {
  it('produces identical results however the calls are interleaved', () => {
    // A generator would give different answers depending on call order. A hash
    // cannot. This is what lets a butterfly vary its path without touching
    // `world.rng` and desynchronising the simulation.
    const straight = [mix(1, 1), mix(1, 2), mix(1, 3)];

    const interleaved: number[] = [];
    interleaved.push(mix(1, 1));
    mix(99, 99); // an unrelated call between them
    interleaved.push(mix(1, 2));
    mix(50, 50);
    mix(51, 51);
    interleaved.push(mix(1, 3));

    expect(interleaved).toEqual(straight);
  });

  it('is unchanged by how many times it has been called', () => {
    const first = derivedUnit(42, 7);
    for (let i = 0; i < 1000; i += 1) derivedUnit(i, i);
    expect(derivedUnit(42, 7)).toBe(first);
  });
});

describe('derivedUnit', () => {
  it('lands in [0, 1)', () => {
    for (let tile = 0; tile < 500; tile += 1) {
      const value = derivedUnit(1, tile);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads across the range rather than clustering', () => {
    // Four quarters, 500 samples: a hash this coarse would show up here.
    const buckets = [0, 0, 0, 0];
    for (let tile = 0; tile < 500; tile += 1) {
      const bucket = Math.floor(derivedUnit(9, tile) * 4);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) expect(count).toBeGreaterThan(80);
  });
});

describe('derivedRange', () => {
  it('stays within bounds', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = derivedRange(-3, 3, 5, i);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThan(3);
    }
  });

  it('is deterministic for the same inputs', () => {
    expect(derivedRange(0, 10, 1, 2)).toBe(derivedRange(0, 10, 1, 2));
  });

  it('collapses to the bound when the range is empty', () => {
    expect(derivedRange(4, 4, 1, 2)).toBe(4);
  });
});

describe('derivedIndex', () => {
  it('picks inside the collection', () => {
    for (let i = 0; i < 200; i += 1) {
      const index = derivedIndex(5, 3, i);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(5);
    }
  });

  it('is stable, so a worker keeps the same fidget for the same trigger', () => {
    expect(derivedIndex(5, 12, 340)).toBe(derivedIndex(5, 12, 340));
  });

  it('returns 0 for an empty collection rather than NaN', () => {
    // Cosmetic code must not produce an out-of-range index inside a frame.
    expect(derivedIndex(0, 1, 2)).toBe(0);
  });
});
