/**
 * Phase-12a — the weather kinds core ships, read through the installed
 * registries rather than by importing `plugins/core`.
 *
 * The weights are content, so what is pinned here is not their exact values
 * but the SHAPE a player would notice: every season can produce weather, rain
 * is possible in all four, and summer is the driest.
 */

import { describe, expect, it } from 'vitest';

import { weatherFor } from '../time/weather';

import { createInstalledRegistries } from './installed';
import { CORE_AUTUMN, CORE_SPRING, CORE_SUMMER, CORE_WINTER } from './seasons';
import { ANY_SEASON, CORE_CLEAR, CORE_RAIN, weatherTint, weightIn } from './weather-kinds';

const SEASONS = [CORE_SPRING, CORE_SUMMER, CORE_AUTUMN, CORE_WINTER];

const kinds = (): ReturnType<typeof createInstalledRegistries>['weatherKinds'] =>
  createInstalledRegistries().weatherKinds;

describe('core ships clear and rain', () => {
  it('registers both, in that order', () => {
    // Order is part of the answer: selection walks it.
    expect(
      kinds()
        .all()
        .map((kind) => kind.id),
    ).toEqual([CORE_CLEAR, CORE_RAIN]);
  });

  it('gives clear no rainfall and rain some', () => {
    const registry = kinds();
    const clear = registry.get(CORE_CLEAR);
    const rain = registry.get(CORE_RAIN);
    if (!clear.ok || !rain.ok) throw new Error('core weather is not installed');

    expect(clear.value.rainfall).toBe(0);
    expect(rain.value.rainfall).toBeGreaterThan(0);
  });
});

describe('every season has weather', () => {
  it('can produce a kind in all four seasons', () => {
    // A season with no eligible kind would leave that quarter of the year with
    // no weather at all, and nothing would say so.
    const all = kinds().all();
    for (const season of SEASONS) {
      expect(weatherFor(1, 0, season, all), `no weather in ${season}`).toBeDefined();
    }
  });

  it('can rain in all four seasons', () => {
    const all = kinds().all();
    for (const season of SEASONS) {
      const rained = Array.from({ length: 300 }, (_, period) =>
        weatherFor(21, period, season, all),
      ).some((kind) => kind?.id === CORE_RAIN);

      expect(rained, `never rains in ${season}`).toBe(true);
    }
  });

  it('makes summer the driest season', () => {
    // The one seasonal pattern a player is meant to notice.
    const registry = kinds();
    const rain = registry.get(CORE_RAIN);
    if (!rain.ok) throw new Error('setup failed');

    const summer = weightIn(rain.value, CORE_SUMMER);
    for (const season of [CORE_SPRING, CORE_AUTUMN, CORE_WINTER]) {
      expect(weightIn(rain.value, season)).toBeGreaterThan(summer);
    }
  });

  it('declares no any-season fallback, so a season must be named', () => {
    // Core's weights are per season on purpose: a '*' entry would quietly make
    // every future season inherit spring's weather instead of declaring its own.
    for (const kind of kinds().all()) {
      expect(kind.weights[ANY_SEASON]).toBeUndefined();
    }
  });
});

describe('the weather tint (phase-33)', () => {
  it('gives rain a tint at all, so weather shows on an idle overlay', () => {
    // THE GAP THIS CLOSED, stated correctly. Falling drops have existed since
    // phase-12d, but they are ambient motion (ADR-017 §2): off by default, and
    // surrendered once the pointer idles. An overlay left open beside real
    // work therefore showed a clear day whatever the weather. A tint costs no
    // per-frame work, so it can be on always.
    //
    // Read through the installed registries, like everything else in this
    // file: what is pinned is that core's rainy weather declares a tint and
    // that the tint does something, not which blue it is.
    const registry = kinds();
    const rain = registry.get(CORE_RAIN);

    expect(rain.ok).toBe(true);
    if (!rain.ok) return;
    expect(rain.value.tint, 'rain declares no tint, so rain is invisible again').toBeDefined();
    expect(weatherTint(registry, CORE_RAIN)).not.toBe(0xffffff);
  });

  it('leaves clear weather alone', () => {
    // Clear is not a special case in the engine — it is a kind whose rainfall
    // happens to be nothing — and it must be one for the ground too.
    expect(weatherTint(kinds(), CORE_CLEAR)).toBe(0xffffff);
  });

  it('is white when there is no weather, or the kind is not registered', () => {
    // Weather shipped by an existing plugin declares no tint, and must keep
    // working rather than painting the world black.
    expect(weatherTint(kinds(), undefined)).toBe(0xffffff);
    expect(weatherTint(kinds(), 'mod:blizzard')).toBe(0xffffff);
  });

  it('darkens rather than brightens, so rain reads as cloud', () => {
    const tint = weatherTint(kinds(), CORE_RAIN);

    for (const shift of [16, 8, 0]) {
      expect((tint >> shift) & 0xff).toBeLessThanOrEqual(0xff);
    }
    // Cooler than it is warm: the blue channel survives more than the red.
    expect(tint & 0xff).toBeGreaterThan((tint >> 16) & 0xff);
  });
});
