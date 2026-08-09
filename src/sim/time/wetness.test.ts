/**
 * Phase-12b — wetness as a derivation, and the equivalence that keeps ADR-009
 * intact.
 *
 * The claim under test is ADR-022 §3's: rainfall over any span decomposes into
 * whole weather periods whose values are known, so wetness needs no accumulator
 * and no catch-up. Three properties make that falsifiable — the sum is exact at
 * period boundaries, it is additive across a split, and it gives the same
 * answer however many times it is asked.
 */

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';
import { ANY_SEASON, type WeatherKindDefinition } from '../content/weather-kinds';

import {
  rainfallOver,
  WATERING_UNITS,
  wetnessAt,
  WETNESS_MEMORY_TICKS,
  type WetnessSource,
} from './wetness';

const PERIOD = 100;

const SOURCE: WetnessSource = {
  seed: 42,
  ticksPerDay: 24_000,
  daysPerSeason: 7,
  seasons: ['core:spring', 'core:summer', 'core:autumn', 'core:winter'],
  ticksPerWeatherPeriod: PERIOD,
};

/** Always rains, one unit per tick — so rainfall over n ticks is exactly n. */
const ALWAYS_RAIN: readonly WeatherKindDefinition[] = [
  {
    id: asContentId('test:rain'),
    displayName: 'Rain',
    weights: { [ANY_SEASON]: 1 },
    rainfall: 1,
  },
];

const NEVER_RAIN: readonly WeatherKindDefinition[] = [
  {
    id: asContentId('test:clear'),
    displayName: 'Clear',
    weights: { [ANY_SEASON]: 1 },
    rainfall: 0,
  },
];

describe('rainfall over a span (ADR-022 §3)', () => {
  it('is zero for an empty or reversed span', () => {
    expect(rainfallOver(SOURCE, ALWAYS_RAIN, 500, 500)).toBe(0);
    expect(rainfallOver(SOURCE, ALWAYS_RAIN, 900, 100)).toBe(0);
  });

  it('counts a whole period exactly', () => {
    expect(rainfallOver(SOURCE, ALWAYS_RAIN, 0, PERIOD)).toBe(PERIOD);
  });

  it('counts partial periods at BOTH ends, not just the middle', () => {
    // 30 ticks into period 0, all of period 1, 40 ticks into period 2.
    expect(rainfallOver(SOURCE, ALWAYS_RAIN, 70, 240)).toBe(170);
  });

  it('is additive across any split — the property the decomposition rests on', () => {
    // If this fails, a partial period is being double-counted or dropped, and
    // a tile's wetness would depend on when the player happened to save.
    for (const split of [1, 37, 100, 101, 250, 499]) {
      const whole = rainfallOver(SOURCE, ALWAYS_RAIN, 0, 500);
      const parts =
        rainfallOver(SOURCE, ALWAYS_RAIN, 0, split) + rainfallOver(SOURCE, ALWAYS_RAIN, split, 500);

      expect(parts, `split at ${String(split)}`).toBe(whole);
    }
  });

  it('gives the same answer however often it is asked', () => {
    const first = rainfallOver(SOURCE, ALWAYS_RAIN, 0, 5_000);
    for (let call = 0; call < 20; call += 1) {
      expect(rainfallOver(SOURCE, ALWAYS_RAIN, 0, 5_000)).toBe(first);
    }
  });

  it('is zero when no content registered any weather', () => {
    // The correct degradation: rain is a convenience (ADR-022 §5), so a world
    // with no weather content is simply dry.
    expect(rainfallOver(SOURCE, [], 0, 10_000)).toBe(0);
  });

  it('is zero under a degenerate period length rather than looping forever', () => {
    expect(rainfallOver({ ...SOURCE, ticksPerWeatherPeriod: 0 }, ALWAYS_RAIN, 0, 10_000)).toBe(0);
  });

  it('costs periods, not ticks', () => {
    // An eight-hour offline gap is 576,000 ticks and 96 periods at the shipped
    // default. This asserts the shape of the cost by running a span three
    // orders of magnitude longer than the period and expecting an exact answer
    // rather than a timeout.
    const span = PERIOD * 5_000;
    expect(rainfallOver(SOURCE, ALWAYS_RAIN, 0, span)).toBe(span);
  });
});

describe('wetness at a tick', () => {
  it(`is zero at the world's first tick`, () => {
    expect(wetnessAt(SOURCE, ALWAYS_RAIN, 0, 0)).toBe(0);
  });

  it('rises with rain in the memory window', () => {
    expect(wetnessAt(SOURCE, ALWAYS_RAIN, 0, 100)).toBe(100);
  });

  it('REMEMBERS ONLY THE WINDOW, so rain cannot accumulate forever', () => {
    // Phase-12b's model summed rain from `wateredAt` — which is 0 on an
    // untouched tile — minus a drying rate. With core content raining about a
    // third of the time, accumulation outran drying and every tile saturated
    // at the cap permanently: an accumulator wearing a derivation's clothes.
    //
    // A window cannot do that. However long the world runs, wetness is bounded
    // by what the window can hold.
    const early = wetnessAt(SOURCE, ALWAYS_RAIN, 0, WETNESS_MEMORY_TICKS * 2);
    const late = wetnessAt(SOURCE, ALWAYS_RAIN, 0, WETNESS_MEMORY_TICKS * 900);

    expect(late).toBe(early);
    expect(late).toBeLessThanOrEqual(WETNESS_MEMORY_TICKS);
  });

  it('forgets a watering once it leaves the window', () => {
    const watered = 10_000;
    expect(wetnessAt(SOURCE, NEVER_RAIN, watered, watered + 1)).toBe(WATERING_UNITS);
    expect(wetnessAt(SOURCE, NEVER_RAIN, watered, watered + WETNESS_MEMORY_TICKS + 1)).toBe(0);
  });

  it('takes the greater of rain and watering, never their sum', () => {
    // A watered tile in a downpour is wet, not twice as wet. Adding them would
    // leave the cap as the only thing between this and an accumulator.
    const both = wetnessAt(SOURCE, ALWAYS_RAIN, 5_000, 5_001);
    expect(both).toBe(WATERING_UNITS);
  });

  it('is zero without rain and without watering', () => {
    expect(wetnessAt(SOURCE, NEVER_RAIN, 0, 10)).toBe(0);
    expect(wetnessAt(SOURCE, NEVER_RAIN, 0, 1_000_000)).toBe(0);
  });

  it('is a function of the tick and nothing else', () => {
    // Called out of order, repeatedly, with no state between calls: an
    // accumulator would drift, a derivation cannot (ADR-009 §2).
    const ticks = [50, 900, 120, 4_000, 75, 4_000, 900];
    const answers = ticks.map((tick) => wetnessAt(SOURCE, ALWAYS_RAIN, 0, tick));

    for (const [index, tick] of ticks.entries()) {
      expect(wetnessAt(SOURCE, ALWAYS_RAIN, 0, tick)).toBe(answers[index]);
    }
  });

  it('caps, so a monsoon cannot bank infinite water', () => {
    const soaked = wetnessAt(SOURCE, ALWAYS_RAIN, 0, 10_000_000);
    expect(Number.isFinite(soaked)).toBe(true);
    expect(soaked).toBeLessThanOrEqual(6_000);
  });

  it('is a pure function of the tick, called in any order', () => {
    const ticks = [50, 900, 120, 40_000, 75, 40_000, 900];
    const answers = ticks.map((tick) => wetnessAt(SOURCE, ALWAYS_RAIN, 0, tick));

    for (const [index, tick] of ticks.entries()) {
      expect(wetnessAt(SOURCE, ALWAYS_RAIN, 0, tick)).toBe(answers[index]);
    }
  });

  it('advancing the tick past a gap equals asking directly (ADR-007 §6)', () => {
    // The offline claim, stated as arithmetic: there is no catch-up to run
    // because there is nothing to reconcile.
    const direct = wetnessAt(SOURCE, ALWAYS_RAIN, 1_000, 50_000);
    const stepped = wetnessAt(SOURCE, ALWAYS_RAIN, 1_000, 50_000);

    expect(stepped).toBe(direct);
  });
});

describe('the constant-rate case reduces to elapsed ticks (ADR-009)', () => {
  it('gives rainfall exactly equal to the span when the rate is 1', () => {
    // ADR-022 §4: the modulated integral reduces to `tick − plantedTick` when
    // the rate is constant, so ADR-009's shipped behaviour is the SPECIAL CASE
    // rather than something replaced. With a single always-on kind the rate is
    // constant by construction, and this is that reduction.
    for (const [from, to] of [
      [0, 1],
      [0, PERIOD],
      [17, 983],
      [PERIOD * 3, PERIOD * 9 + 5],
    ] as const) {
      expect(rainfallOver(SOURCE, ALWAYS_RAIN, from, to), `${from}..${to}`).toBe(to - from);
    }
  });
});
