/**
 * Core buildings. Phase-08.0d.
 *
 * `storageSlots` is a FIELD, not a subclass (ADR-004 §4): a building that
 * stores has one, a building that does not simply omits it. That choice is what
 * lets a plugin ship a storing building in phase-08 without a new type — and it
 * is also what makes a typo silent, because an omitted field and a field set to
 * zero are different things that read alike. The capacity assertions below are
 * the difference between a shed that holds fifty items and one that holds none.
 *
 * Capacity is also deliberately NOT persisted: `hydrateWorld` reads it from the
 * definition so a rebalance reaches old saves without a migration
 * (`deserialize.ts`, ADR-004 §5). These numbers therefore change what an
 * existing save can hold the moment they change here.
 */

import { describe, expect, it } from 'vitest';

import {
  CORE_BUILDINGS,
  CORE_MARKET_STALL,
  CORE_REST_HUT,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
  createBuildingRegistry,
  MARKET_STALL_SLOTS,
  registerCoreBuildings,
  STORAGE_SHED_SLOTS,
} from './buildings';

const registered = (): ReturnType<typeof createBuildingRegistry> => {
  const registry = createBuildingRegistry();
  registerCoreBuildings(registry);
  return registry;
};

describe('registerCoreBuildings', () => {
  it('registers every building in the shipped set', () => {
    const registry = registered();
    for (const building of CORE_BUILDINGS) {
      expect(registry.has(building.id), building.id).toBe(true);
    }
    expect(registry.size).toBe(CORE_BUILDINGS.length);
  });

  it('registers the four buildings v0.1 ships', () => {
    const registry = registered();
    for (const id of [CORE_STORAGE_SHED, CORE_REST_HUT, CORE_SEED_BIN, CORE_MARKET_STALL]) {
      expect(registry.has(id), id).toBe(true);
    }
  });

  it('throws rather than half-registering when core content is malformed', () => {
    // The guard exists for a duplicate or malformed id shipping in the table.
    // Registering twice provokes exactly that condition.
    const registry = registered();
    expect(() => registerCoreBuildings(registry)).toThrow(/failed to register/);
  });

  it('leaves no duplicate ids in the shipped table', () => {
    const ids = CORE_BUILDINGS.map((building) => building.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('storage capacity comes from the definition, not the save', () => {
  it('gives the shed and the stall their declared slots', () => {
    const registry = registered();
    const slotsOf = (id: Parameters<typeof registry.get>[0]): number | undefined => {
      const result = registry.get(id);
      return result.ok ? result.value.storageSlots : undefined;
    };

    expect(slotsOf(CORE_STORAGE_SHED)).toBe(STORAGE_SHED_SLOTS);
    expect(slotsOf(CORE_MARKET_STALL)).toBe(MARKET_STALL_SLOTS);
  });

  it('omits the field entirely on buildings that do not store', () => {
    // Not zero — absent. `deserialize.ts` reads `storageSlots ?? 0`, so the two
    // behave alike today, and a later `?? DEFAULT` would make them differ.
    const registry = registered();
    for (const id of [CORE_REST_HUT, CORE_SEED_BIN]) {
      const result = registry.get(id);
      expect(result.ok && result.value.storageSlots, id).toBeUndefined();
    }
  });

  it('never declares a storing building with zero slots', () => {
    for (const building of CORE_BUILDINGS) {
      if (building.storageSlots === undefined) continue;
      expect(building.storageSlots, building.id).toBeGreaterThan(0);
    }
  });
});
