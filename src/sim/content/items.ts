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

export const CORE_TURNIP_SEED = asContentId('core:turnip_seed');
export const CORE_WHEAT_SEED = asContentId('core:wheat_seed');
export const CORE_CARROT_SEED = asContentId('core:carrot_seed');
export const CORE_PUMPKIN_SEED = asContentId('core:pumpkin_seed');

export type ItemRegistry = ContentRegistry<ItemDefinition>;

export function createItemRegistry(): ItemRegistry {
  return createContentRegistry<ItemDefinition>('item');
}

/**
 * Registers the v0.1 items — one per crop.
 *
 * Prices rise with growth time so the longer crops stay worth the wait
 * (`GAME_DESIGN.md` §3.2). The numbers are §3.1's, exactly.
 */
export function registerCoreItems(registry: ItemRegistry): void {
  const items: readonly ItemDefinition[] = [
    {
      id: CORE_TURNIP,
      displayName: 'Turnip',
      sprite: 'ui-world:item_turnip',
      basePrice: 12,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_WHEAT,
      displayName: 'Wheat',
      sprite: 'ui-world:item_wheat',
      basePrice: 34,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CARROT,
      displayName: 'Carrot',
      sprite: 'ui-world:item_carrot',
      basePrice: 80,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_PUMPKIN,
      displayName: 'Pumpkin',
      sprite: 'ui-world:item_pumpkin',
      basePrice: 230,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_TURNIP_SEED,
      displayName: 'Turnip Seeds',
      sprite: 'ui-world:item_turnip_seed',
      basePrice: 5,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_WHEAT_SEED,
      displayName: 'Wheat Seeds',
      sprite: 'ui-world:item_wheat_seed',
      basePrice: 12,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CARROT_SEED,
      displayName: 'Carrot Seeds',
      sprite: 'ui-world:item_carrot_seed',
      basePrice: 25,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_PUMPKIN_SEED,
      displayName: 'Pumpkin Seeds',
      sprite: 'ui-world:item_pumpkin_seed',
      basePrice: 60,
      stackSize: DEFAULT_STACK_SIZE,
    },
  ];

  for (const item of items) {
    const result = registry.register(item);
    if (!result.ok) {
      // Core content failing to register is a programming error, not a runtime
      // condition — duplicate or malformed ids shipped.
      throw new Error(`failed to register ${item.id}: ${result.error.message}`);
    }
  }
}

/** Stack size for an item, or the default if the item is unknown. */
export function stackSizeOf(registry: ItemRegistry, item: ContentId): number {
  const definition = registry.get(item);
  return definition.ok ? definition.value.stackSize : DEFAULT_STACK_SIZE;
}
