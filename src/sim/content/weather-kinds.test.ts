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
import { ANY_SEASON, CORE_CLEAR, CORE_RAIN, weightIn } from './weather-kinds';

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
