/**
 * Standing, derived. Phase-22 — ADR-034 §1.
 *
 * What the tiers must hold: the thresholds sit exactly where the ADR declares
 * them, expiry never subtracts, and there is no stored score anywhere — a
 * standing is computed from the counters every time it is asked for.
 */

import { describe, expect, it } from 'vitest';

import { createContractStats } from './contracts';
import { FRIEND_AT, nextStandingAt, PILLAR_AT, standingAtLeast, standingOf } from './reputation';

const stats = (fulfilled: number, expired = 0) => ({
  ...createContractStats(),
  fulfilled,
  expired,
});

describe('standingOf', () => {
  it('starts a fresh world as a newcomer', () => {
    expect(standingOf(createContractStats())).toBe('newcomer');
  });

  it('steps up exactly at the declared thresholds', () => {
    expect(standingOf(stats(FRIEND_AT - 1))).toBe('newcomer');
    expect(standingOf(stats(FRIEND_AT))).toBe('friend');
    expect(standingOf(stats(PILLAR_AT - 1))).toBe('friend');
    expect(standingOf(stats(PILLAR_AT))).toBe('pillar');
    expect(standingOf(stats(PILLAR_AT * 5))).toBe('pillar');
  });

  it('expiry never subtracts — nothing lowers your name (ADR-034 §1)', () => {
    expect(standingOf(stats(FRIEND_AT, 100))).toBe('friend');
    expect(standingOf(stats(PILLAR_AT, 1_000))).toBe('pillar');
  });
});

describe('standingAtLeast', () => {
  it('a Pillar passes every door, a newcomer only the open one', () => {
    expect(standingAtLeast('pillar', 'newcomer')).toBe(true);
    expect(standingAtLeast('pillar', 'friend')).toBe(true);
    expect(standingAtLeast('pillar', 'pillar')).toBe(true);
    expect(standingAtLeast('friend', 'pillar')).toBe(false);
    expect(standingAtLeast('friend', 'friend')).toBe(true);
    expect(standingAtLeast('newcomer', 'friend')).toBe(false);
    expect(standingAtLeast('newcomer', 'newcomer')).toBe(true);
  });
});

describe('nextStandingAt', () => {
  it('names the next threshold, and null at the top', () => {
    expect(nextStandingAt(stats(0))).toBe(FRIEND_AT);
    expect(nextStandingAt(stats(FRIEND_AT))).toBe(PILLAR_AT);
    expect(nextStandingAt(stats(PILLAR_AT))).toBeNull();
  });
});
