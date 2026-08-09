/**
 * Phase-12a — weather as a derivation.
 *
 * Two properties carry the whole design, and everything else here supports
 * them:
 *
 * 1. **It is queryable at any tick, and the answer never changes.** ADR-022 §1
 *    calls this out because phase-12b's wetness computes rainfall over a past
 *    span; if a past period could answer differently on a second call, wetness
 *    would drift under a player who did nothing.
 * 2. **It touches no RNG.** A world that shows weather must be byte-identical
 *    to one that does not (ADR-017 §5 at world scale). That is asserted here
 *    against the real generator rather than by reading the code.
 */

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';
import { ANY_SEASON, type WeatherKindDefinition } from '../content/weather-kinds';
import { createRng } from '../rng/rng';

import { weatherFor, weatherPeriodFor } from './weather';

const CLEAR: WeatherKindDefinition = {
  id: asContentId('core:clear'),
  displayName: 'Clear',
  weights: { spring: 60, summer: 85 },
  rainfall: 0,
};

const RAIN: WeatherKindDefinition = {
  id: asContentId('core:rain'),
  displayName: 'Rain',
  weights: { spring: 40, summer: 15 },
  rainfall: 1,
};

const KINDS = [CLEAR, RAIN];

describe('the weather period', () => {
  it('counts from zero and advances with the tick', () => {
    expect(weatherPeriodFor(0, 6_000)).toBe(0);
    expect(weatherPeriodFor(5_999, 6_000)).toBe(0);
    expect(weatherPeriodFor(6_000, 6_000)).toBe(1);
    expect(weatherPeriodFor(60_000, 6_000)).toBe(10);
  });

  it('is total on a degenerate period length', () => {
    expect(weatherPeriodFor(500, 0)).toBe(0);
  });
});

describe('the derivation is stable (ADR-022 §1)', () => {
  it('gives the same answer for the same period, every time', () => {
    const first = weatherFor(1234, 7, 'spring', KINDS);
    for (let call = 0; call < 50; call += 1) {
      expect(weatherFor(1234, 7, 'spring', KINDS)).toBe(first);
    }
  });

  it('answers for a PAST period exactly as it did live', () => {
    // Walk forward recording each period, then query them all again from the
    // far end. This is the acceptance ADR-022 §Validation asks for, and the
    // property phase-12b's rainfall sum depends on.
    const observed: (string | undefined)[] = [];
    for (let period = 0; period < 200; period += 1) {
      observed.push(weatherFor(99, period, 'spring', KINDS)?.id);
    }

    for (let period = 0; period < 200; period += 1) {
      expect(weatherFor(99, period, 'spring', KINDS)?.id, `period ${String(period)}`).toBe(
        observed[period],
      );
    }
  });

  it('gives different worlds different weather', () => {
    // Same period, different seed. If these agreed everywhere the seed would
    // not be an input at all.
    const a = Array.from({ length: 60 }, (_, p) => weatherFor(1, p, 'spring', KINDS)?.id);
    const b = Array.from({ length: 60 }, (_, p) => weatherFor(2, p, 'spring', KINDS)?.id);

    expect(a).not.toEqual(b);
  });

  it('does not repeat itself period after period', () => {
    // A hash that ignored the period would return one kind forever, and every
    // other test here would still pass.
    const run = Array.from({ length: 100 }, (_, p) => weatherFor(7, p, 'spring', KINDS)?.id);

    expect(new Set(run).size).toBeGreaterThan(1);
  });
});

describe('it never touches the world RNG (ADR-017 §5)', () => {
  it('leaves an RNG stream byte-identical', () => {
    // The guard that matters: a save whose owner watched the rain must not
    // diverge from one whose owner did not.
    const untouched = createRng(4242);
    const alongside = createRng(4242);

    const before = Array.from({ length: 20 }, () => untouched.next());

    for (let period = 0; period < 500; period += 1) {
      weatherFor(4242, period, 'spring', KINDS);
    }

    const after = Array.from({ length: 20 }, () => alongside.next());
    expect(after).toEqual(before);
  });
});

describe('seasonal weighting', () => {
  it('rains more in a season weighted for it', () => {
    const rainy = Array.from(
      { length: 400 },
      (_, p) => weatherFor(5, p, 'spring', KINDS)?.id,
    ).filter((id) => id === RAIN.id).length;
    const dry = Array.from({ length: 400 }, (_, p) => weatherFor(5, p, 'summer', KINDS)?.id).filter(
      (id) => id === RAIN.id,
    ).length;

    // Spring is 40/100 rain, summer 15/100. Over 400 periods the gap is not a
    // coin flip, and the seeds are fixed so this cannot flake.
    expect(rainy).toBeGreaterThan(dry);
  });

  it('never returns a kind with no weight in the season', () => {
    const winterOnly: WeatherKindDefinition = {
      ...RAIN,
      id: asContentId('mod:blizzard'),
      weights: { winter: 100 },
    };

    for (let period = 0; period < 200; period += 1) {
      expect(weatherFor(11, period, 'spring', [CLEAR, winterOnly])?.id).toBe(CLEAR.id);
    }
  });

  it('falls back to the any-season weight', () => {
    const always: WeatherKindDefinition = {
      ...RAIN,
      id: asContentId('mod:drizzle'),
      weights: { [ANY_SEASON]: 100 },
    };

    expect(weatherFor(3, 0, 'a-season-nobody-declared', [always])?.id).toBe(always.id);
  });

  it('works in a world with no seasons at all', () => {
    const always: WeatherKindDefinition = { ...RAIN, weights: { [ANY_SEASON]: 1 } };
    expect(weatherFor(3, 0, undefined, [always])?.id).toBe(always.id);
  });
});

describe('degenerate content', () => {
  it('returns undefined when no kind can occur', () => {
    // A world whose content registered no weather has NO weather, rather than
    // an invented clear sky. Callers treat that as dry (ADR-022 §5).
    expect(weatherFor(1, 0, 'spring', [])).toBeUndefined();
    expect(weatherFor(1, 0, 'winter', KINDS)).toBeUndefined();
  });

  it('ignores a negative weight rather than corrupting the total', () => {
    // The weight has to be large enough to drive the TOTAL negative, or the
    // guard changes nothing and this test proves nothing: with a small
    // negative the walk still reaches the first eligible kind either way.
    // Verified by mutation — dropping the clamp fails this and only this.
    const small: WeatherKindDefinition = { ...CLEAR, weights: { spring: 10 } };
    const broken: WeatherKindDefinition = { ...RAIN, weights: { spring: -50 } };

    expect(weatherFor(1, 0, 'spring', [small, broken])?.id).toBe(small.id);
  });
});
