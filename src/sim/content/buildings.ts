/**
 * Building definitions. Phase-05, ADR-004 §5, ADR-011.
 *
 * A building is the KIND of structure: its cost, sprite, and — for the ones
 * that store — how many slots their container holds. Storage is a definition
 * FIELD, not a subclass (ADR-004 §4): a building that stores has `storageSlots`;
 * one that does not, omits it. The storage shed is the only building in v0.1;
 * the rest hut, seed bin, and market stall arrive in phase-06 with the economy.
 *
 * `cost` is defined but not charged until phase-06 (no wallet yet).
 */

import { asContentId, type ContentId } from '../../shared/ids';

import { createContentRegistry, type ContentRegistry } from './registry';

export interface BuildingDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  /** Sprite key from the generated manifest (ASSETS.md §5). */
  readonly sprite: string;
  /** Coins to build. Provisional until phase-06 (`GAME_DESIGN.md` §5). */
  readonly cost: number;
  /** Slots of the container this building owns, if it stores items (ADR-011). */
  readonly storageSlots?: number;
}

export const CORE_STORAGE_SHED = asContentId('core:storage_shed');

/** Slots a storage shed provides. `GAME_DESIGN.md` §5, §7. */
export const STORAGE_SHED_SLOTS = 50;

export type BuildingRegistry = ContentRegistry<BuildingDefinition>;

export function createBuildingRegistry(): BuildingRegistry {
  return createContentRegistry<BuildingDefinition>('building');
}

/** Registers the v0.1 buildings — only the storage shed. */
export function registerCoreBuildings(registry: BuildingRegistry): void {
  const buildings: readonly BuildingDefinition[] = [
    {
      id: CORE_STORAGE_SHED,
      displayName: 'Storage Shed',
      sprite: 'buildings:storage_shed',
      cost: 200,
      storageSlots: STORAGE_SHED_SLOTS,
    },
  ];

  for (const building of buildings) {
    const result = registry.register(building);
    if (!result.ok) {
      // Core content failing to register is a programming error, not a runtime
      // condition — duplicate or malformed ids shipped.
      throw new Error(`failed to register ${building.id}: ${result.error.message}`);
    }
  }
}
