/**
 * GameClock tests.
 *
 * These pin the conversion semantics that offline progress (phase-07) will
 * depend on — in particular that partial ticks round DOWN, since over-crediting
 * elapsed time is the failure mode that matters (SAVE_FORMAT.md §6.4).
 */

import { describe, expect, it } from 'vitest';

import { TICK_MS, TICKS_PER_SECOND } from '../../shared/constants';

import {
  msToTicks,
  readClock,
  secondsToTicks,
  ticksToMs,
  ticksToSeconds,
  ticksToWholeSeconds,
} from './game-clock';

describe('ticks to seconds', () => {
  it('converts whole seconds exactly', () => {
    expect(ticksToSeconds(TICKS_PER_SECOND)).toBe(1);
    expect(ticksToSeconds(TICKS_PER_SECOND * 90)).toBe(90);
  });

  it('keeps the fraction in the exact form', () => {
    expect(ticksToSeconds(TICKS_PER_SECOND / 2)).toBe(0.5);
  });

  it('floors in the whole-second form', () => {
    expect(ticksToWholeSeconds(TICKS_PER_SECOND - 1)).toBe(0);
    expect(ticksToWholeSeconds(TICKS_PER_SECOND)).toBe(1);
    expect(ticksToWholeSeconds(TICKS_PER_SECOND * 2 - 1)).toBe(1);
  });

  it('changes once per second, not once per tick', () => {
    // This is the property the status slice depends on to avoid republishing
    // at tick rate (ADR-005 §2).
    const values = new Set<number>();
    for (let tick = 0; tick < TICKS_PER_SECOND * 3; tick += 1) {
      values.add(ticksToWholeSeconds(tick));
    }
    expect(values.size).toBe(3);
  });

  it('handles zero', () => {
    expect(ticksToSeconds(0)).toBe(0);
    expect(ticksToWholeSeconds(0)).toBe(0);
  });
});

describe('ticks to milliseconds', () => {
  it('uses the tick duration', () => {
    expect(ticksToMs(1)).toBe(TICK_MS);
    expect(ticksToMs(TICKS_PER_SECOND)).toBe(1000);
  });
});

describe('milliseconds to ticks', () => {
  it('converts whole ticks', () => {
    expect(msToTicks(1000)).toBe(TICKS_PER_SECOND);
    expect(msToTicks(TICK_MS)).toBe(1);
  });

  it('rounds DOWN, never over-crediting elapsed time', () => {
    expect(msToTicks(TICK_MS - 1)).toBe(0);
    expect(msToTicks(TICK_MS * 1.99)).toBe(1);
  });

  it('clamps negative, zero, and non-finite input to zero', () => {
    // A clock moved backwards must never rewind the world
    // (SAVE_FORMAT.md §6.2).
    expect(msToTicks(-5000)).toBe(0);
    expect(msToTicks(0)).toBe(0);
    expect(msToTicks(Number.NaN)).toBe(0);
    expect(msToTicks(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('round-trips with ticksToMs', () => {
    for (const ticks of [0, 1, 20, 1200, 576_000]) {
      expect(msToTicks(ticksToMs(ticks))).toBe(ticks);
    }
  });
});

describe('seconds to ticks', () => {
  it('converts authored durations', () => {
    // Content authors durations in seconds; ADR-007 §7 stores ticks.
    expect(secondsToTicks(60)).toBe(1200);
    expect(secondsToTicks(120)).toBe(2400);
  });

  it('rounds to the nearest whole tick', () => {
    expect(secondsToTicks(0.51 / TICKS_PER_SECOND)).toBe(1);
  });
});

describe('readClock', () => {
  it('reads from the supplied tick source', () => {
    const clock = readClock(() => TICKS_PER_SECOND * 65);

    expect(clock.tick).toBe(1300);
    expect(clock.elapsedSeconds).toBe(65);
    expect(clock.elapsedSecondsExact).toBe(65);
    expect(clock.elapsedMs).toBe(65_000);
  });

  it('reflects the tick at read time', () => {
    let tick = 0;
    expect(readClock(() => tick).elapsedSeconds).toBe(0);

    tick = TICKS_PER_SECOND * 3;
    expect(readClock(() => tick).elapsedSeconds).toBe(3);
  });
});
