/**
 * Building definitions. Phase-05 + 06c, ADR-004 §5, ADR-011.
 *
 * A building is the KIND of structure: its cost, sprite, and — for the ones
 * that store — how many slots their container holds. Storage is a definition
 * FIELD, not a subclass (ADR-004 §4): a building that stores has `storageSlots`;
 * one that does not, omits it. All four `GAME_DESIGN.md` §5 buildings are here;
 * costs are charged by `placeBuilding` since 06c.
 *
 * Behavioural effects (the rest hut's recovery rate, the seed bin's replant
 * memory, the stall's auto-sell) live in the systems that own those behaviours
 * — a definition stays data (ADR-004).
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
export const CORE_REST_HUT = asContentId('core:rest_hut');
export const CORE_SEED_BIN = asContentId('core:seed_bin');
export const CORE_MARKET_STALL = asContentId('core:market_stall');

/** Slots a storage shed provides. `GAME_DESIGN.md` §5, §7. */
export const STORAGE_SHED_SLOTS = 50;

/**
 * Slots the market stall's receiving container holds. A pass-through buffer,
 * not real storage — the economy sweep sells its contents every tick — but it
 * must exist so the stall participates in the ordinary deposit-target service
 * (ADR-011; resolved interpretation 6). Sized small on purpose.
 */
export const MARKET_STALL_SLOTS = 10;

export type BuildingRegistry = ContentRegistry<BuildingDefinition>;

export function createBuildingRegistry(): BuildingRegistry {
  return createContentRegistry<BuildingDefinition>('building');
}

/** Registers the v0.1 buildings — the `GAME_DESIGN.md` §5 table, exactly. */
export function registerCoreBuildings(registry: BuildingRegistry): void {
  const buildings: readonly BuildingDefinition[] = [
    {
      id: CORE_STORAGE_SHED,
      displayName: 'Storage Shed',
      sprite: 'buildings:storage_shed',
      cost: 200,
      storageSlots: STORAGE_SHED_SLOTS,
    },
    {
      id: CORE_REST_HUT,
      displayName: 'Rest Hut',
      sprite: 'buildings:rest_hut',
      cost: 300,
    },
    {
      id: CORE_SEED_BIN,
      displayName: 'Seed Bin',
      sprite: 'buildings:seed_bin',
      cost: 500,
    },
    {
      id: CORE_MARKET_STALL,
      displayName: 'Market Stall',
      sprite: 'buildings:market_stall',
      cost: 1200,
      storageSlots: MARKET_STALL_SLOTS,
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
