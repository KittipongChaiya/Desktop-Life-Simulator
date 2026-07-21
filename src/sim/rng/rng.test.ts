/**
 * RNG determinism tests. Phase-00 acceptance criterion 12.
 *
 * Determinism is the property ADR-002, ADR-003, ADR-004, and ADR-007 all rest
 * on. If these fail, something far more serious than one feature is broken.
 */

import { describe, expect, it } from 'vitest';

import { createRng, type RngState } from './rng';

describe('determinism (criterion 12)', () => {
  it('produces an identical sequence from the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);

    for (let i = 0; i < 10_000; i += 1) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('reaches identical state after 100,000 draws', () => {
    const a = createRng(0xdecafbad);
    const b = createRng(0xdecafbad);

    for (let i = 0; i < 100_000; i += 1) {
      a.next();
      b.next();
    }

    expect(a.getState()).toEqual(b.getState());
  });

  it('produces different sequences from different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);

    const drawsA = Array.from({ length: 100 }, () => a.next());
    const drawsB = Array.from({ length: 100 }, () => b.next());

    expect(drawsA).not.toEqual(drawsB);
  });

  it('is not degenerate for adjacent seeds', () => {
    // Naive seeding leaves most state words near-identical for nearby seeds,
    // producing correlated early output. splitmix32 expansion avoids that.
    const first = Array.from({ length: 20 }, (_, i) => createRng(i).next());
    expect(new Set(first).size).toBe(first.length);
  });
});

describe('state serialization', () => {
  it('resumes the stream mid-sequence after restore', () => {
    const original = createRng(999);
    for (let i = 0; i < 500; i += 1) original.next();

    const snapshot = original.getState();
    const expected = Array.from({ length: 100 }, () => original.next());

    const restored = createRng(0);
    restored.setState(snapshot);
    const actual = Array.from({ length: 100 }, () => restored.next());

    expect(actual).toEqual(expected);
  });

  it('exposes exactly four 32-bit unsigned words', () => {
    const state: RngState = createRng(42).getState();

    expect(state).toHaveLength(4);
    for (const word of state) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('round-trips through JSON, matching the save format', () => {
    // SAVE_FORMAT.md §2 stores rngState as a plain JSON array.
    const rng = createRng(7);
    for (let i = 0; i < 50; i += 1) rng.next();

    const revived = createRng(0);
    revived.setState(JSON.parse(JSON.stringify(rng.getState())) as RngState);

    expect(revived.next()).toBe(createRngAt(rng.getState()).next());
  });
});

function createRngAt(state: RngState) {
  const rng = createRng(0);
  rng.setState(state);
  return rng;
}

describe('output range', () => {
  it('returns floats within [0, 1)', () => {
    const rng = createRng(2024);

    for (let i = 0; i < 50_000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('returns integers within an inclusive range', () => {
    const rng = createRng(31337);
    const seen = new Set<number>();

    for (let i = 0; i < 20_000; i += 1) {
      const value = rng.nextInt(3, 9);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
      seen.add(value);
    }

    // Both bounds must actually be reachable.
    expect(seen.has(3)).toBe(true);
    expect(seen.has(9)).toBe(true);
    expect(seen.size).toBe(7);
  });

  it('handles a single-value range', () => {
    const rng = createRng(5);
    expect(rng.nextInt(4, 4)).toBe(4);
  });

  it('throws when max is below min', () => {
    const rng = createRng(5);
    expect(() => rng.nextInt(10, 2)).toThrow();
  });

  it('is roughly uniform', () => {
    const rng = createRng(8675309);
    const buckets = new Array<number>(10).fill(0);
    const draws = 200_000;

    for (let i = 0; i < draws; i += 1) {
      const bucket = Math.floor(rng.next() * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }

    // Every bucket within 5% of its expected share.
    const expected = draws / 10;
    for (const count of buckets) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.05);
    }
  });
});
