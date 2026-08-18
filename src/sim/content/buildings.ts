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
  /**
   * Slots of the two containers a factory owns (ADR-035 §2). Absent takes
   * `DEFAULT_FACTORY_SLOTS`.
   *
   * CAPACITY, never identity. What makes a building a factory is that a recipe
   * names it (ADR-035 §1) — this field only says how much it can hold while
   * doing so, exactly as `storageSlots` says how much a shed holds without
   * being what makes it a shed. A building carrying these slots and named by
   * no recipe simply does nothing, which is the same benign outcome as a
   * recipe naming a building nobody built.
   */
  readonly factorySlots?: { readonly input: number; readonly output: number };
  /**
   * `false` for buildings the player can never place — the town's, founded by
   * world construction (ADR-030 §4). Absent means placeable, so every v0.1
   * definition is unchanged.
   */
  readonly playerPlaceable?: boolean;
}

export const CORE_STORAGE_SHED = asContentId('core:storage_shed');
export const CORE_REST_HUT = asContentId('core:rest_hut');
export const CORE_SEED_BIN = asContentId('core:seed_bin');
export const CORE_MARKET_STALL = asContentId('core:market_stall');

/** The v0.4 factories (phase-25, ADR-035). */
export const CORE_MILL = asContentId('core:mill');
export const CORE_KITCHEN = asContentId('core:kitchen');

/**
 * Slots each of a factory's two containers holds when its definition is silent.
 *
 * Small on purpose. A factory is a work station, not a warehouse: a deep input
 * buffer would let a chain hide an imbalance for hours before revealing it, and
 * the whole point of v0.4's headline criterion is that an unattended chain's
 * behaviour is visible rather than deferred. Storage is what sheds are for.
 */
export const DEFAULT_FACTORY_SLOTS = { input: 4, output: 4 } as const;

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

/**
 * The `GAME_DESIGN.md` §5 table as data. Exported so the shop panel can show
 * costs without a world reference — static content, the same way the HUD
 * imports `hireCost` (06e).
 */
export const CORE_BUILDINGS: readonly BuildingDefinition[] = [
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
  // The v0.4 factories (phase-25). Neither declares `storageSlots`: a factory's
  // containers live in `world.factories`, deliberately out of the general
  // deposit-target path, so a worker cannot fill a mill with turnips
  // (ADR-035 §2).
  //
  // ART IS REAL SINCE PHASE-26. Both were stand-ins through phase 25 — the
  // mill drew `storage_shed`, the kitchen drew `cottage` — and the live pass
  // found them indistinguishable on the plot. `generate-world-art.mjs` now
  // paints both, designed silhouette-first: the mill is a tall stone tower with
  // an external water wheel breaking its outline, the kitchen a low wide
  // bakehouse with a chimney and an oven bulge. Told apart by SHAPE before
  // colour, which is what a player reads at a glance.
  {
    id: CORE_MILL,
    displayName: 'Mill',
    sprite: 'buildings:mill',
    cost: 900,
  },
  {
    id: CORE_KITCHEN,
    displayName: 'Kitchen',
    sprite: 'buildings:kitchen',
    cost: 1600,
  },
];
