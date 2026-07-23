/**
 * Item registry. Phase-05, ADR-011.
 */

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';

import {
  CORE_CARROT,
  CORE_PUMPKIN,
  CORE_TURNIP,
  CORE_WHEAT,
  createItemRegistry,
  DEFAULT_STACK_SIZE,
  registerCoreItems,
  stackSizeOf,
} from './items';

describe('core items', () => {
  const registry = createItemRegistry();
  registerCoreItems(registry);

  it('registers produce and seeds — two items per crop (06b)', () => {
    expect(registry.size).toBe(8);
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
  const registry = createItemRegistry();
  registerCoreItems(registry);

  it('returns the item stack size', () => {
    expect(stackSizeOf(registry, CORE_WHEAT)).toBe(DEFAULT_STACK_SIZE);
  });

  it('falls back to the default for an unknown item', () => {
    expect(stackSizeOf(registry, asContentId('core:unknown'))).toBe(DEFAULT_STACK_SIZE);
  });
});
