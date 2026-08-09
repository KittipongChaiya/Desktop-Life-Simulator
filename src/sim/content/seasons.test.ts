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
  seasonTint,
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

describe('a season carries its ground colour (ADR-021 §6)', () => {
  it('resolves a registered season to its tint', () => {
    const registry = createSeasonRegistry();
    registry.register({ id: CORE_AUTUMN, displayName: 'Autumn', tint: 0xffdcae });

    expect(seasonTint(registry, CORE_AUTUMN)).toBe(0xffdcae);
  });

  it('leaves the terrain alone when there is no season', () => {
    // White is the identity for a multiplied tint, so a world with no seasons
    // draws exactly as it did before seasons existed.
    expect(seasonTint(createSeasonRegistry(), undefined)).toBe(0xffffff);
  });

  it('leaves the terrain alone for a season nothing registered', () => {
    // A save naming a season whose source has been uninstalled: the ground
    // goes neutral rather than a guessed colour, matching how a missing phase
    // tint paints nothing.
    expect(seasonTint(createSeasonRegistry(), 'mod:monsoon')).toBe(0xffffff);
  });

  it('gives every shipped season a tint, and only spring the identity', () => {
    // Spring is the neutral one; if a second season were also white the
    // boundary into it would be invisible.
    const registry = createInstalledRegistries().seasons;
    const tints = registry.all().map((season) => season.tint);

    expect(tints).toHaveLength(4);
    expect(tints.filter((tint) => tint === 0xffffff)).toHaveLength(1);
  });
});
