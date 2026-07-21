/**
 * Accumulator loop tests. Phase-00 acceptance criteria 13 and 14.
 */

import { describe, expect, it } from 'vitest';

import { MAX_CATCHUP_TICKS, TICK_MS, TICKS_PER_SECOND } from '../../shared/constants';

import { createAccumulator } from './loop';

describe('accumulator tick rate (criterion 13)', () => {
  it('advances exactly TICKS_PER_SECOND over one simulated second', () => {
    const accumulator = createAccumulator();
    let ticks = 0;

    // 60 frames at ~16.67ms == 1000ms.
    for (let frame = 0; frame < 60; frame += 1) {
      ticks += accumulator.advance(1000 / 60);
    }

    expect(ticks).toBe(TICKS_PER_SECOND);
  });

  it('advances exactly TICKS_PER_SECOND * 10 over ten simulated seconds', () => {
    const accumulator = createAccumulator();
    let ticks = 0;

    for (let frame = 0; frame < 600; frame += 1) {
      ticks += accumulator.advance(1000 / 60);
    }

    expect(ticks).toBe(TICKS_PER_SECOND * 10);
  });

  it('does not lose fractional time across frames', () => {
    const accumulator = createAccumulator();
    let ticks = 0;

    // 7ms frames divide unevenly into the 50ms tick; leftovers must carry.
    for (let frame = 0; frame < 1000; frame += 1) {
      ticks += accumulator.advance(7);
    }

    expect(ticks).toBe(Math.floor((1000 * 7) / TICK_MS));
  });

  it('emits no ticks when less than one tick of time has passed', () => {
    const accumulator = createAccumulator();
    expect(accumulator.advance(TICK_MS - 1)).toBe(0);
  });

  it('emits exactly one tick at precisely the tick boundary', () => {
    const accumulator = createAccumulator();
    expect(accumulator.advance(TICK_MS)).toBe(1);
    expect(accumulator.pending()).toBe(0);
  });
});

describe('spiral-of-death guard (criterion 14)', () => {
  it('caps a 10-second stall at MAX_CATCHUP_TICKS', () => {
    const accumulator = createAccumulator();
    expect(accumulator.advance(10_000)).toBe(MAX_CATCHUP_TICKS);
  });

  it('discards time beyond the cap rather than banking it', () => {
    const accumulator = createAccumulator();
    accumulator.advance(10_000);

    // If the stall had been banked, this frame would run a backlog.
    expect(accumulator.advance(1000 / 60)).toBe(0);
  });

  it('does not compound across repeated stalls', () => {
    const accumulator = createAccumulator();

    for (let stall = 0; stall < 10; stall += 1) {
      expect(accumulator.advance(10_000)).toBeLessThanOrEqual(MAX_CATCHUP_TICKS);
    }
  });

  it('resumes normal cadence after a stall', () => {
    const accumulator = createAccumulator();
    accumulator.advance(10_000);

    let ticks = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      ticks += accumulator.advance(1000 / 60);
    }

    expect(ticks).toBe(TICKS_PER_SECOND);
  });
});

describe('interpolation alpha', () => {
  it('stays within [0, 1)', () => {
    const accumulator = createAccumulator();

    for (let frame = 0; frame < 500; frame += 1) {
      accumulator.advance(1000 / 60);
      const alpha = accumulator.alpha();
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('reports the fraction into the current tick', () => {
    const accumulator = createAccumulator();
    accumulator.advance(TICK_MS / 2);
    expect(accumulator.alpha()).toBeCloseTo(0.5, 10);
  });
});

describe('malformed input', () => {
  it('ignores negative, NaN, and infinite deltas', () => {
    const accumulator = createAccumulator();

    expect(accumulator.advance(-100)).toBe(0);
    expect(accumulator.advance(Number.NaN)).toBe(0);
    expect(accumulator.advance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(accumulator.pending()).toBe(0);
  });
});
