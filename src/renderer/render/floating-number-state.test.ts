/**
 * Floating number pool tests. Phase-07.7c, ADR-017 §4.
 *
 * Same three obligations as every pool in this phase — never grows, never
 * allocates after construction, reliably empties — plus one of its own: the
 * text is built ONCE at emission. A number that formats itself per frame
 * allocates a string per number per frame, which is the defect the pool exists
 * to avoid, one level down and harder to see.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';

import {
  createFloatingNumberPool,
  FLOATING_DURATION_MS,
  FLOATING_POOL_CAPACITY,
  FloatingKind,
} from './floating-number-state';

const TILE = toIndexUnchecked(30, 30);
const OTHER = toIndexUnchecked(31, 30);

describe('emitting', () => {
  it('starts empty', () => {
    const pool = createFloatingNumberPool();
    expect(pool.isEmpty(0)).toBe(true);
  });

  it('formats the amount with a leading plus', () => {
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 12, 0);

    expect(pool.activeAt(0)[0]?.text).toBe('+12');
  });

  it('floors a fractional amount rather than showing decimals', () => {
    // Coins are integers everywhere else in this game (ADR-013); a "+2.5"
    // would be the renderer inventing a precision the economy does not have.
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 2.9, 0);

    expect(pool.activeAt(0)[0]?.text).toBe('+2');
  });

  it('ignores nothing-happened amounts', () => {
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 0, 0);
    pool.emit(FloatingKind.Coins, TILE, -5, 0);
    pool.emit(FloatingKind.Coins, TILE, Number.NaN, 0);

    expect(pool.isEmpty(0)).toBe(true);
  });

  it('carries its kind through', () => {
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Item, TILE, 1, 0);

    expect(pool.activeAt(0)[0]?.kind).toBe(FloatingKind.Item);
  });

  it('drifts sideways so two numbers on one tile stay readable', () => {
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 5, 0);
    pool.emit(FloatingKind.Coins, TILE, 7, 13);

    const drifts = pool.activeAt(13).map((n) => n.driftX);
    expect(drifts[0]).not.toBe(drifts[1]);
  });

  it('drifts identically for the same trigger — derived, never rolled', () => {
    const read = (): number | undefined => {
      const pool = createFloatingNumberPool();
      pool.emit(FloatingKind.Coins, OTHER, 9, 500);
      return pool.activeAt(500)[0]?.driftX;
    };

    expect(read()).toBe(read());
  });
});

describe('expiry — the lease depends on this', () => {
  it('rises across its lifetime', () => {
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 1, 0);

    expect(pool.activeAt(0)[0]?.progress).toBeCloseTo(0, 5);
    expect(pool.activeAt(FLOATING_DURATION_MS / 2)[0]?.progress).toBeCloseTo(0.5, 5);
  });

  it('becomes empty once the lifetime has passed', () => {
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 1, 0);

    expect(pool.isEmpty(FLOATING_DURATION_MS - 1)).toBe(false);
    expect(pool.isEmpty(FLOATING_DURATION_MS)).toBe(true);
  });

  it('empties even after a long overlapping stream', () => {
    const pool = createFloatingNumberPool();
    for (let t = 0; t < 5000; t += 100) pool.emit(FloatingKind.Coins, TILE, t + 1, t);

    expect(pool.isEmpty(5000 + FLOATING_DURATION_MS)).toBe(true);
  });

  it('clear() drops everything, so teardown cannot leak a lease', () => {
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 3, 0);
    pool.clear();

    expect(pool.isEmpty(0)).toBe(true);
  });
});

describe('pooling — ADR-017 §4', () => {
  it('never exceeds its capacity', () => {
    const pool = createFloatingNumberPool();
    for (let i = 0; i < 200; i += 1) pool.emit(FloatingKind.Coins, TILE, i + 1, 0);

    expect(pool.activeAt(0).length).toBeLessThanOrEqual(FLOATING_POOL_CAPACITY);
  });

  it('recycles the OLDEST, keeping what the player just earned', () => {
    const pool = createFloatingNumberPool();
    for (let i = 0; i < FLOATING_POOL_CAPACITY; i += 1) {
      pool.emit(FloatingKind.Coins, TILE, 1, i);
    }
    pool.emit(FloatingKind.Coins, TILE, 999, FLOATING_POOL_CAPACITY);

    const texts = pool.activeAt(FLOATING_POOL_CAPACITY).map((n) => n.text);
    expect(texts).toContain('+999');
    expect(texts).toHaveLength(FLOATING_POOL_CAPACITY);
  });

  it('returns the same array instance every call', () => {
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 1, 0);

    expect(pool.activeAt(0)).toBe(pool.activeAt(0));
  });

  it('reuses the same view objects rather than minting new ones', () => {
    const pool = createFloatingNumberPool();
    for (let i = 0; i < FLOATING_POOL_CAPACITY; i += 1) {
      pool.emit(FloatingKind.Coins, TILE, i + 1, 0);
    }
    const original = new Set<unknown>(pool.activeAt(0));

    for (let t = 1; t < 4000; t += 13) pool.emit(FloatingKind.Item, TILE, t, t);

    for (const view of pool.activeAt(4000)) expect(original.has(view)).toBe(true);
    expect(original.size).toBe(FLOATING_POOL_CAPACITY);
  });

  it('builds each string once, not once per frame', () => {
    // Reading the same number across many frames must hand back the identical
    // string instance — proof the text is not being rebuilt in `activeAt`.
    const pool = createFloatingNumberPool();
    pool.emit(FloatingKind.Coins, TILE, 42, 0);

    const first = pool.activeAt(0)[0]?.text;
    for (let t = 1; t < 400; t += 1) pool.activeAt(t);

    expect(pool.activeAt(400)[0]?.text).toBe(first);
  });
});
