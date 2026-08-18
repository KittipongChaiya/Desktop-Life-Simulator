/**
 * Item registry. Phase-05, ADR-011.
 */

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';

import { createInstalledRegistries } from './installed';
import {
  CORE_BREAD,
  CORE_CARROT,
  CORE_FLOUR,
  CORE_PUMPKIN,
  CORE_TURNIP,
  CORE_WHEAT,
  DEFAULT_STACK_SIZE,
  stackSizeOf,
} from './items';

describe('core items', () => {
  const registry = createInstalledRegistries().items;

  it('registers produce and seeds — two items per crop (06b)', () => {
    // Asserted as the RELATION rather than a total, because phase-25 broke the
    // total: `core:flour` and `core:bread` are items no crop yields, so "two
    // per crop" stopped being a statement about the registry's size and went
    // back to being a statement about crops. A count would have had to be
    // edited by every future content addition, saying nothing each time.
    const crops = createInstalledRegistries().crops;
    for (const crop of crops.all()) {
      expect(registry.has(crop.id), `${crop.id} has no produce item`).toBe(true);
      expect(registry.has(crop.seedItem), `${crop.id} has no seed item`).toBe(true);
    }
  });

  it('registers the processed goods no crop yields (phase-25)', () => {
    expect(registry.has(CORE_FLOUR)).toBe(true);
    expect(registry.has(CORE_BREAD)).toBe(true);
  });

  it('carries a definition with a name, sprite, price, and stack size', () => {
    const wheat = registry.get(CORE_WHEAT);
    expect(wheat.ok).toBe(true);
    if (wheat.ok) {
      expect(wheat.value.displayName).toBe('Wheat');
      expect(wheat.value.stackSize).toBe(DEFAULT_STACK_SIZE);
      expect(wheat.value.basePrice).toBeGreaterThan(0);
    }
  });

  it('prices longer crops higher (§3.2)', () => {
    const wheat = registry.get(CORE_WHEAT);
    const pumpkin = registry.get(CORE_PUMPKIN);
    if (wheat.ok && pumpkin.ok) {
      expect(pumpkin.value.basePrice).toBeGreaterThan(wheat.value.basePrice);
    }
  });

  it('base prices match the §3.1 crop table — finalised in phase-06', () => {
    const priceOf = (id: typeof CORE_TURNIP): number => {
      const item = registry.get(id);
      return item.ok ? item.value.basePrice : -1;
    };
    expect(priceOf(CORE_TURNIP)).toBe(12);
    expect(priceOf(CORE_WHEAT)).toBe(34);
    expect(priceOf(CORE_CARROT)).toBe(80);
    expect(priceOf(CORE_PUMPKIN)).toBe(230);
  });
});

describe('stackSizeOf', () => {
  const registry = createInstalledRegistries().items;

  it('returns the item stack size', () => {
    expect(stackSizeOf(registry, CORE_WHEAT)).toBe(DEFAULT_STACK_SIZE);
  });

  it('falls back to the default for an unknown item', () => {
    expect(stackSizeOf(registry, asContentId('core:unknown'))).toBe(DEFAULT_STACK_SIZE);
  });
});
