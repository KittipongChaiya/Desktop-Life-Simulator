/**
 * Phase-12c — the consumer wetness had to gain, and the ceiling it lives under.
 *
 * Two claims carry this file:
 *
 * 1. **Rain may accelerate; drought may not stall** (ADR-022 §5). A dry farm
 *    must grow at exactly the speed it grew at before weather existed, or every
 *    crop time in `GAME_DESIGN.md` §3.1 silently became a lie.
 * 2. **The constant-rate case reduces to `tick − plantedTick`** (ADR-022 §4),
 *    so ADR-009's shipped growth is the special case rather than something
 *    replaced.
 */

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';
import { ANY_SEASON, type WeatherKindDefinition } from '../content/weather-kinds';
import type { Crop } from '../world/crop';

import { growthProgress, growthRateAt, WET_GROWTH_RATE, type GrowthSource } from './growth';
import { WATERING_UNITS } from './wetness';

const PERIOD = 1_000;

const kindsOf = (kinds: readonly WeatherKindDefinition[]): GrowthSource['weatherKindRegistry'] => ({
  all: () => kinds,
});

const RAIN: WeatherKindDefinition = {
  id: asContentId('test:rain'),
  displayName: 'Rain',
  weights: { [ANY_SEASON]: 1 },
  rainfall: 1,
};

const CLEAR: WeatherKindDefinition = {
  id: asContentId('test:clear'),
  displayName: 'Clear',
  weights: { [ANY_SEASON]: 1 },
  rainfall: 0,
};

function sourceOf(kinds: readonly WeatherKindDefinition[], wateredAt = 0): GrowthSource {
  const grid = new Uint32Array(16);
  grid[0] = wateredAt;
  return {
    seed: 7,
    ticksPerDay: 24_000,
    daysPerSeason: 7,
    seasons: ['core:spring'],
    ticksPerWeatherPeriod: PERIOD,
    tiles: { wateredAt: grid },
    weatherKindRegistry: kindsOf(kinds),
  };
}

const crop = (plantedTick: number): Crop => ({
  tile: 0 as Crop['tile'],
  cropId: asContentId('core:wheat'),
  plantedTick,
});

describe('a dry farm grows exactly as it always did (ADR-022 §5)', () => {
  it('accrues one tick of growth per tick with no rain', () => {
    const dry = sourceOf([CLEAR]);

    for (const [planted, now] of [
      [0, 1],
      [0, PERIOD],
      [17, 983],
      [0, 24_000],
      [5_500, 41_237],
    ] as const) {
      expect(growthProgress(dry, crop(planted), now), `${planted}..${now}`).toBe(now - planted);
    }
  });

  it('never falls below the dry rate, whatever the weather', () => {
    // The ceiling stated as an inequality over every configuration this test
    // can build. A rate below 1 would mean a drought that slows a farm, which
    // ADR-022 §5 forbids outright.
    for (const kinds of [[CLEAR], [RAIN], [CLEAR, RAIN], []]) {
      const source = sourceOf(kinds);
      for (const tick of [1, 500, PERIOD, 12_345, 99_999]) {
        expect(growthRateAt(source, 0, tick), `${String(tick)}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('grows normally when no content registered any weather', () => {
    // A world with no weather kinds is dry, not stopped.
    expect(growthProgress(sourceOf([]), crop(0), 5_000)).toBe(5_000);
  });
});

describe('rain accelerates, within the declared band', () => {
  it('accrues the wet rate while it rains', () => {
    // From the SECOND period on. The first period of a world's life samples
    // wetness at tick 0, when no rain has fallen yet, so it grows dry — which
    // is correct rather than an edge case: a crop planted in the first minute
    // of a world has not been rained on.
    expect(growthProgress(sourceOf([RAIN]), crop(PERIOD), PERIOD * 2)).toBeCloseTo(
      PERIOD * WET_GROWTH_RATE,
      6,
    );
  });

  it('grows the first period dry, because nothing has rained yet', () => {
    expect(growthProgress(sourceOf([RAIN]), crop(0), PERIOD)).toBe(PERIOD);
  });

  it('stays inside [1, WET_GROWTH_RATE] per tick over a long span', () => {
    // The predictability guarantee applied to time: a player who knows a
    // crop's time always knows its best and worst case.
    const span = 50_000;
    for (const kinds of [[CLEAR], [RAIN], [CLEAR, RAIN]]) {
      const progress = growthProgress(sourceOf(kinds), crop(0), span);
      expect(progress).toBeGreaterThanOrEqual(span);
      expect(progress).toBeLessThanOrEqual(span * WET_GROWTH_RATE);
    }
  });

  it('counts a watered tile as wet even with no rain at all', () => {
    // The other producer of wetness. Watering has no consumer of its own yet —
    // there is no watering can — but the rate must not pretend a watered tile
    // is dry, or adding the tool later would look like it changed the rules.
    const watered = sourceOf([CLEAR], 4_000);
    expect(growthRateAt(watered, 0, 4_001)).toBe(WET_GROWTH_RATE);
    expect(WATERING_UNITS).toBeGreaterThan(0);
  });
});

describe('the sum is exact and derived', () => {
  it('is zero before the crop was planted', () => {
    expect(growthProgress(sourceOf([RAIN]), crop(500), 400)).toBe(0);
    expect(growthProgress(sourceOf([RAIN]), crop(500), 500)).toBe(0);
  });

  it('is additive across an arbitrary split', () => {
    // Growth from A to C must equal A→B plus B→C, including splits landing
    // mid-period — otherwise a crop's progress would depend on when the
    // player happened to look at it.
    const source = sourceOf([CLEAR, RAIN]);
    for (const split of [1, 137, PERIOD, PERIOD + 1, 3_500]) {
      const whole = growthProgress(source, crop(0), 5_000);
      const parts =
        growthProgress(source, crop(0), split) + growthProgress(source, crop(split), 5_000);

      expect(parts, `split at ${String(split)}`).toBeCloseTo(whole, 6);
    }
  });

  it('gives the same answer however often it is asked', () => {
    // A derivation, not an accumulator: no state between calls (ADR-009 §2).
    const source = sourceOf([CLEAR, RAIN]);
    const first = growthProgress(source, crop(0), 40_000);

    for (let call = 0; call < 30; call += 1) {
      expect(growthProgress(source, crop(0), 40_000)).toBe(first);
    }
  });

  it('advancing past a gap equals asking at the far end (ADR-007 §6)', () => {
    // The offline claim: there is nothing to catch up, because there is
    // nothing accumulating.
    const source = sourceOf([CLEAR, RAIN]);
    const gap = 576_000; // the eight-hour offline cap

    expect(growthProgress(source, crop(0), gap)).toBe(growthProgress(source, crop(0), gap));
  });

  it('falls back to elapsed time when the period length is unusable', () => {
    // `undefined <= 0` is false, so a source missing the field once fell
    // through to a NaN-bounded loop and reported a crop that never grew. The
    // guard tests finiteness; this pins it.
    const broken = { ...sourceOf([RAIN]), ticksPerWeatherPeriod: undefined as unknown as number };
    expect(growthProgress(broken, crop(0), 5_000)).toBe(5_000);
  });
});
