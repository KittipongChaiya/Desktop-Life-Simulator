/**
 * Worker personality tests. Phase-07.7f.
 *
 * Two properties carry this module. It must be STATELESS — the same id and
 * tick always answer the same, which is what lets it be called every frame
 * with no bookkeeping and survive a reload unchanged. And every offset must
 * RETURN TO ZERO: a fidget that left a sprite a pixel high would accumulate,
 * and after an hour the farm would be staffed by workers hovering above the
 * ground with nothing in the code to point at.
 */

import { describe, expect, it } from 'vitest';

import {
  Fidget,
  FIDGET_DURATION_TICKS,
  FIDGET_PERIOD_TICKS,
  fidgetAt,
  hopLift,
  isGlancing,
  stretchLift,
} from './worker-personality';

/** Every tick of one full period, for a worker. */
function windowTicks(workerId: number, window = 0): (ReturnType<typeof fidgetAt> | null)[] {
  return Array.from({ length: FIDGET_PERIOD_TICKS }, (_, i) =>
    fidgetAt(workerId, window * FIDGET_PERIOD_TICKS + i),
  );
}

describe('statelessness', () => {
  it('answers identically for the same worker and tick', () => {
    for (const tick of [0, 37, 199, 1234, 99_999]) {
      expect(fidgetAt(3, tick)).toEqual(fidgetAt(3, tick));
    }
  });

  it('is unaffected by how many other calls happened first', () => {
    const baseline = fidgetAt(5, 5000);
    for (let i = 0; i < 500; i += 1) fidgetAt(i, i * 3);
    expect(fidgetAt(5, 5000)).toEqual(baseline);
  });

  it('tolerates a malformed tick rather than fidgeting at random', () => {
    expect(fidgetAt(1, Number.NaN)).toBeNull();
    expect(fidgetAt(1, -50)).toBeNull();
  });
});

describe('scheduling', () => {
  it('fidgets exactly once per period', () => {
    const active = windowTicks(2).filter((f) => f !== null);
    expect(active).toHaveLength(FIDGET_DURATION_TICKS);
  });

  it('stands still for most of the time', () => {
    // Sparse on purpose: a worker fidgeting constantly reads as nervous, and
    // every fidget costs frames while it runs.
    const active = windowTicks(2).filter((f) => f !== null).length;
    expect(active / FIDGET_PERIOD_TICKS).toBeLessThan(0.15);
  });

  it('never lets a fidget straddle two windows and change kind mid-motion', () => {
    for (let id = 1; id <= 12; id += 1) {
      const ticks = windowTicks(id);
      expect(ticks[FIDGET_PERIOD_TICKS - 1]).toBeNull();
    }
  });

  it('runs a contiguous span, not a flicker', () => {
    const ticks = windowTicks(4);
    const first = ticks.findIndex((f) => f !== null);
    for (let i = 0; i < FIDGET_DURATION_TICKS; i += 1) {
      expect(ticks[first + i]).not.toBeNull();
    }
  });

  it('progresses from near 0 to near 1 across the span', () => {
    const ticks = windowTicks(4);
    const active = ticks.filter((f) => f !== null);
    expect(active[0]?.progress).toBeCloseTo(0, 5);
    expect(active[active.length - 1]?.progress).toBeGreaterThan(0.9);
  });

  it('staggers workers, so a row never fidgets in unison', () => {
    const starts = new Set(
      Array.from({ length: 8 }, (_, id) => windowTicks(id + 1).findIndex((f) => f !== null)),
    );
    expect(starts.size).toBeGreaterThan(4);
  });

  it('varies what it plays across windows', () => {
    const kinds = new Set(
      Array.from({ length: 20 }, (_, w) => windowTicks(3, w).find((f) => f !== null)?.kind),
    );
    expect(kinds.has(Fidget.LookAround)).toBe(true);
    expect(kinds.has(Fidget.Stretch)).toBe(true);
  });
});

describe('offsets return to zero', () => {
  it('starts and ends a stretch on the ground', () => {
    expect(stretchLift(0)).toBeCloseTo(0, 6);
    expect(stretchLift(1)).toBeCloseTo(0, 6);
  });

  it('actually lifts in the middle', () => {
    expect(stretchLift(0.5)).toBeGreaterThan(1);
  });

  it('starts and ends a hop on the ground', () => {
    expect(hopLift(0)).toBeCloseTo(0, 6);
    expect(hopLift(1)).toBeCloseTo(0, 6);
  });

  it('never drives a sprite below the ground', () => {
    for (let i = 0; i <= 40; i += 1) {
      expect(stretchLift(i / 40)).toBeGreaterThanOrEqual(0);
      expect(hopLift(i / 40)).toBeGreaterThanOrEqual(0);
    }
  });

  it('decays the hop, so the second bounce is smaller than the first', () => {
    const samples = Array.from({ length: 41 }, (_, i) => hopLift(i / 40));
    const firstHalf = Math.max(...samples.slice(0, 20));
    const secondHalf = Math.max(...samples.slice(20));
    expect(secondHalf).toBeLessThan(firstHalf);
    expect(secondHalf).toBeGreaterThan(0);
  });

  it('clamps a late frame to rest rather than freezing mid-air', () => {
    expect(stretchLift(3)).toBeCloseTo(0, 6);
    expect(hopLift(9)).toBeCloseTo(0, 6);
  });
});

describe('the glance', () => {
  it('holds facing either side and turns in the middle', () => {
    expect(isGlancing(0)).toBe(false);
    expect(isGlancing(0.1)).toBe(false);
    expect(isGlancing(0.5)).toBe(true);
    expect(isGlancing(0.9)).toBe(false);
    expect(isGlancing(1)).toBe(false);
  });
});
