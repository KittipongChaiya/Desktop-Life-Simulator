/**
 * Item definitions. Phase-05, ADR-011, ADR-004 §5.
 *
 * An item is the KIND of resource: its display name, icon, stack size, and base
 * price. It is registered once and never mutated; a held amount is an
 * `ItemStack` (`world/container.ts`) that references a definition by `ContentId`
 * and stores only the quantity. That split — definition vs. instance — is why a
 * plugin can add an item and why rebalancing a price is a data edit, not a save
 * migration.
 *
 * The v0.1 items are the four crops' harvest goods plus their seeds (06b).
 * Produce ids match the crop ids (`core:wheat` the crop yields `core:wheat`
 * the item); seeds are `core:<crop>_seed`. `basePrice` values follow the
 * `GAME_DESIGN.md` §3.1 crop table — "Sell (base)" for produce, "Seed cost"
 * for seeds, so a seed sold back at `multiplier ≤ 1.0` can never beat its
 * purchase price (phase doc, resolved interpretation 3). Rebalancing is a
 * data edit here, never a save migration.
 */

import { asContentId, type ContentId } from '../../shared/ids';

import { createContentRegistry, type ContentRegistry } from './registry';

export interface ItemDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  /** Icon sprite key from the generated manifest (ASSETS.md §5). */
  readonly sprite: string;
  /** Sale price before dynamic pricing (`GAME_DESIGN.md` §6.2). Provisional until phase-06. */
  readonly basePrice: number;
  /** Maximum quantity per slot (`GAME_DESIGN.md` §7). */
  readonly stackSize: number;
}

/** Every v0.1 item stacks to 99 (`GAME_DESIGN.md` §7). */
export const DEFAULT_STACK_SIZE = 99;

export const CORE_TURNIP = asContentId('core:turnip');
export const CORE_WHEAT = asContentId('core:wheat');
export const CORE_CARROT = asContentId('core:carrot');
export const CORE_PUMPKIN = asContentId('core:pumpkin');

/** Gathered from the wilds (phase-27, ADR-037). */
export const CORE_WOOD = asContentId('core:wood');
export const CORE_STONE = asContentId('core:stone');
export const CORE_ORE = asContentId('core:ore');

/** Processed goods — the v0.4 chain's middle and end (phase-25, ADR-035). */
export const CORE_FLOUR = asContentId('core:flour');
export const CORE_BREAD = asContentId('core:bread');

export const CORE_TURNIP_SEED = asContentId('core:turnip_seed');
export const CORE_WHEAT_SEED = asContentId('core:wheat_seed');
export const CORE_CARROT_SEED = asContentId('core:carrot_seed');
export const CORE_PUMPKIN_SEED = asContentId('core:pumpkin_seed');

export type ItemRegistry = ContentRegistry<ItemDefinition>;

export function createItemRegistry(): ItemRegistry {
  return createContentRegistry<ItemDefinition>('item');
}

/** Stack size for an item, or the default if the item is unknown. */
export function stackSizeOf(registry: ItemRegistry, item: ContentId): number {
  const definition = registry.get(item);
  return definition.ok ? definition.value.stackSize : DEFAULT_STACK_SIZE;
}
