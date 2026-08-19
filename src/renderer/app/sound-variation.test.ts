/**
 * Pitch variation. Phase-47 — `sound-variation.ts`.
 *
 * Every assertion here is something a player would HEAR go wrong: an error
 * tone that wobbles, a repeating pattern the ear locks onto, or a rate far
 * enough from 1 that a two-note pluck lands on a wrong note.
 */

import { describe, expect, it } from 'vitest';

import { NO_VARIATION, variationRate } from './sound-variation';
import { AudioCategory } from './sounds';

/** Every rate a category produces over a long session. */
const rates = (category: AudioCategory, count: number): number[] =>
  Array.from({ length: count }, (_, i) => variationRate(category, i + 1));

describe('signals hold their shape', () => {
  it.each([AudioCategory.Ui, AudioCategory.Ambient, AudioCategory.Music])(
    '%s never varies',
    (category) => {
      // A click, an error and a notification are STATEMENTS. A shape that moves
      // reads as a fault rather than as life — and an ambient bed whose rate
      // changed would audibly shift pitch mid-weather.
      for (const rate of rates(category, 200)) expect(rate).toBe(NO_VARIATION);
    },
  );
});

describe('world sounds vary', () => {
  it('does not play the same rate twice in a row', () => {
    const first = rates(AudioCategory.World, 60);

    for (let i = 1; i < first.length; i += 1) {
      expect(first[i]).not.toBe(first[i - 1]);
    }
  });

  it('actually moves — a rule that returned 1 would pass every other test here', () => {
    const varied = rates(AudioCategory.World, 40).filter((rate) => rate !== NO_VARIATION);

    expect(varied.length).toBe(40);
  });

  it('stays within a semitone, so nothing sounds detuned', () => {
    // THE BOUND THAT MATTERS. `coin` is two tones a fifth apart; move it far
    // enough and it stops being variety and becomes a wrong note.
    for (const rate of rates(AudioCategory.World, 500)) {
      expect(rate).toBeGreaterThan(0.93);
      expect(rate).toBeLessThan(1.07);
    }
  });

  it('does not cycle audibly', () => {
    // A plain modulo over a handful of values is a pattern the ear finds
    // inside a minute. Over 200 plays the sequence must not repeat with any
    // short period.
    const long = rates(AudioCategory.World, 200);

    for (const period of [2, 3, 4, 5, 6, 8, 12, 16]) {
      const periodic = long.every((rate, i) => rate === long[i % period]);
      expect(periodic, `rates repeat with period ${String(period)}`).toBe(false);
    }
  });

  it('spreads either side of 1 rather than always sharpening', () => {
    // A rule that only ever raised the pitch would make a long session drift
    // brighter and brighter to the ear.
    const long = rates(AudioCategory.World, 300);
    const above = long.filter((rate) => rate > 1).length;

    expect(above).toBeGreaterThan(90);
    expect(above).toBeLessThan(210);
  });

  it('is deterministic — the same farm sounds the same on every launch', () => {
    // `Math.random` here would make this untestable and make a save sound
    // different every time it was opened.
    expect(rates(AudioCategory.World, 20)).toEqual(rates(AudioCategory.World, 20));
  });
});
