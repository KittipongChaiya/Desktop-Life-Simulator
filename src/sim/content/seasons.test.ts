/**
 * Phase-11a — the season registry, and the order that IS the year.
 *
 * ADR-021 §Alternatives D: the engine owns the cycle, content owns the names.
 * What these tests guard is the seam between those two — registration order
 * becoming the year, and a world freezing it so later content cannot move it.
 */

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';

import { createInstalledRegistries } from './installed';
import {
  CORE_AUTUMN,
  CORE_SPRING,
  CORE_SUMMER,
  CORE_WINTER,
  createSeasonRegistry,
  seasonOrder,
} from './seasons';

describe('the season registry', () => {
  it('registers and looks up a season', () => {
    const registry = createSeasonRegistry();
    const season = { id: CORE_SPRING, displayName: 'Spring' };

    expect(registry.register(season).ok).toBe(true);
    expect(registry.get(CORE_SPRING)).toEqual({ ok: true, value: season });
  });

  it('refuses a duplicate id, like every other registry', () => {
    const registry = createSeasonRegistry();
    registry.register({ id: CORE_SPRING, displayName: 'Spring' });

    expect(registry.register({ id: CORE_SPRING, displayName: 'Also Spring' }).ok).toBe(false);
  });

  it('reports an unregistered season as an error, never undefined', () => {
    expect(createSeasonRegistry().get(asContentId('mod:monsoon')).ok).toBe(false);
  });
});

describe('seasonOrder', () => {
  it('returns registration order, because registration order IS the year', () => {
    const registry = createSeasonRegistry();
    // Deliberately not alphabetical, and not the shipped order: the point is
    // that this function reports what was registered, in that sequence.
    registry.register({ id: CORE_WINTER, displayName: 'Winter' });
    registry.register({ id: CORE_SUMMER, displayName: 'Summer' });

    expect(seasonOrder(registry)).toEqual([CORE_WINTER, CORE_SUMMER]);
  });

  it('is empty for a registry nothing registered', () => {
    expect(seasonOrder(createSeasonRegistry())).toEqual([]);
  });
});

describe('core ships a four-season year', () => {
  it('registers spring, summer, autumn, winter — in that order', () => {
    // Read through the installed registries rather than by importing
    // `plugins/core`: this is the set a world actually receives, through the
    // same public API a third-party source would use.
    expect(seasonOrder(createInstalledRegistries().seasons)).toEqual([
      CORE_SPRING,
      CORE_SUMMER,
      CORE_AUTUMN,
      CORE_WINTER,
    ]);
  });

  it('gives every season a display name', () => {
    for (const season of createInstalledRegistries().seasons.all()) {
      expect(season.displayName.length).toBeGreaterThan(0);
    }
  });
});
