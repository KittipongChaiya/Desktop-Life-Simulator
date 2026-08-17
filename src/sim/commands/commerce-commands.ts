/**
 * Commerce commands: selling goods, buying seeds. Phase-06b, GAME_DESIGN.md
 * §3.1, §6.2, §6.4, ADR-013.
 *
 * These are the market boundary (ADR-013: the market is a boundary, never an
 * agent). `sellItems` is the boundary event where goods leave the world and
 * coins enter the wallet; `buySeeds` is the recurring sink where coins leave
 * and seed items enter. Both are all-or-nothing: a rejection mutates nothing
 * (ADR-010 §2).
 *
 * Pricing (§6.2, resolved interpretation 1): a sale credits
 * `quantity × floor(basePrice × multiplier)` at the PRE-SALE multiplier, then
 * decays the multiplier once by `quantity × 0.002`. Seed purchases are fixed
 * at the §3.1 list price — only selling passes the multiplier pipeline.
 */

import { FARM_SIZE } from '../../shared/constants';
import { appError, ErrorCode } from '../../shared/errors';
import { isContentId, type ContentId } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { stackSizeOf } from '../content/items';
import {
  acceptable,
  addItems,
  containerCount,
  removeItems,
  type Container,
} from '../world/container';
import {
  seasonalMultiplier,
  expansionCost,
  multiplierOf,
  plotSizeAfter,
  recordSale,
  salePrice,
} from '../world/economy';
import { claimCenteredPlot } from '../world/tile-grid';
import { addCoins, spendCoins } from '../world/wallet';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

// ── Validators ───────────────────────────────────────────────────────────────

/**
 * Every container the sale may draw from, in the order it draws from them:
 * the player inventory first, then storage buildings by ascending id.
 *
 * WHY SHEDS COUNT (07.9). `projectInventory` aggregates the player inventory
 * AND every storage building into the single list the inventory panel renders
 * — deliberately, because that is how a shed's "+50 slots" and a worker's
 * deposits become visible to the player. Selling used to count `world.inventory`
 * alone, so goods a WORKER harvested (they go to the nearest shed with room,
 * never to the player inventory) showed up in the panel with live prices and
 * `Sell 1` / `All` buttons that were silently refused as `MissingItem`.
 *
 * Hiring a worker and building a shed are the two things the game most
 * encourages, and together they turned selling off. What the panel offers and
 * what the command accepts are now the same set of goods, by construction.
 *
 * Sorted by id rather than left in Map order: command results are part of the
 * deterministic tick (ADR-007 §1), so the container a unit came out of may not
 * depend on insertion history.
 *
 * The player's own inventory goes FIRST so that selling a few units empties
 * what the player is carrying before it touches a shed they were stockpiling.
 */
export function sellableContainers(world: CommandWorld): readonly Container[] {
  const sheds = [...world.buildingStorage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, container]) => container);
  return [world.inventory, ...sheds];
}

/**
 * Total units of an item across everything the player owns.
 *
 * EXPORTED since phase-20: contract delivery draws from exactly what selling
 * draws from (ADR-032 §5) — a second copy of this rule is how the two would
 * silently drift apart.
 */
export function heldForSale(world: CommandWorld, itemId: ContentId): number {
  let total = 0;
  for (const container of sellableContainers(world)) total += containerCount(container, itemId);
  return total;
}

/**
 * Checks a sale is legal. Rejects: unknown item, bad quantity, more than the
 * player holds across inventory and sheds. Order: most specific cause first.
 */
export function validateSell(
  world: CommandWorld,
  itemId: ContentId,
  quantity: number,
): ValidationResult {
  const definition = world.itemRegistry.get(itemId);
  if (!definition.ok) return err(definition.error);

  const held = heldForSale(world, itemId);
  if (held < quantity) {
    return err(
      appError(ErrorCode.MissingItem, 'not enough held to sell', { itemId, quantity, held }),
    );
  }

  return ok();
}

/**
 * Checks a seed purchase is legal. Rejects: unknown crop, bad quantity,
 * insufficient funds, no room for the WHOLE purchase — partially delivered
 * seeds would break the all-or-nothing contract.
 */
export function validateBuySeeds(
  world: CommandWorld,
  cropId: ContentId,
  quantity: number,
): ValidationResult {
  const definition = world.cropRegistry.get(cropId);
  if (!definition.ok) return err(definition.error);

  const cost = definition.value.seedCost * quantity;
  if (world.wallet.coins < cost) {
    return err(
      appError(ErrorCode.InsufficientFunds, 'not enough coins for seeds', {
        cropId,
        cost,
        held: world.wallet.coins,
      }),
    );
  }

  const seedItem = definition.value.seedItem;
  const space = acceptable(world.inventory, seedItem, stackSizeOf(world.itemRegistry, seedItem));
  if (space < quantity) {
    return err(
      appError(ErrorCode.InventoryFull, 'no room for the whole seed purchase', {
        cropId,
        quantity,
        space,
      }),
    );
  }

  return ok();
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Sells items the player owns — inventory and sheds alike (`sellableContainers`)
 * — removing the goods, crediting the wallet at the pre-sale price, then
 * depressing the multiplier and publishing the fact.
 */
export function sellItems(world: CommandWorld, itemId: ContentId, quantity: number): Result<void> {
  const validation = validateSell(world, itemId, quantity);
  if (!validation.ok) return validation;

  const definition = world.itemRegistry.get(itemId);
  if (!definition.ok) return err(definition.error); // unreachable — validated above

  // Price the whole batch BEFORE recording the sale (interpretation 1). One
  // batch at one multiplier even when the units come out of several containers
  // — where a good was stored is not a pricing input.
  const coins =
    quantity *
    salePrice(
      definition.value.basePrice,
      multiplierOf(world.economy, itemId),
      seasonalMultiplier(world, itemId),
    );

  // Drain in order: the player's own inventory, then sheds by id. The total was
  // validated above, so this always takes exactly `quantity` units. Each call is
  // capped at what its container holds, because `removeItems` is all-or-nothing
  // per container and would otherwise remove nothing at all.
  let remaining = quantity;
  for (const container of sellableContainers(world)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, containerCount(container, itemId));
    if (take <= 0) continue;
    remaining -= removeItems(container, itemId, take).removed;
  }
  const credit = addCoins(world.wallet, coins);
  if (!credit.ok) return credit; // unreachable — quantity × floor() is a non-negative integer

  recordSale(world.economy, itemId, quantity);
  world.events.publish('itemSold', { item: itemId, quantity, coins, automatic: false });
  return ok();
}

/** Buys seeds at the fixed list price: debits the wallet, delivers the seeds. */
export function buySeeds(world: CommandWorld, cropId: ContentId, quantity: number): Result<void> {
  const validation = validateBuySeeds(world, cropId, quantity);
  if (!validation.ok) return validation;

  const definition = world.cropRegistry.get(cropId);
  if (!definition.ok) return err(definition.error); // unreachable — validated above

  const spend = spendCoins(world.wallet, definition.value.seedCost * quantity);
  if (!spend.ok) return spend; // unreachable — funds validated above

  const seedItem = definition.value.seedItem;
  // Space was validated, so the whole quantity fits — nothing is dropped.
  addItems(world.inventory, seedItem, quantity, stackSizeOf(world.itemRegistry, seedItem));
  return ok();
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Parses a raw command quantity. Commands carry untrusted primitives
 * (ADR-010 §5); a zero, negative, fractional, or unsafe quantity becomes a
 * typed rejection here, before any arithmetic can meet it.
 */
function toQuantity(quantity: number): Result<number> {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return err(
      appError(ErrorCode.InvalidIntent, 'quantity must be a positive integer', { quantity }),
    );
  }
  return ok(quantity);
}

/** Parses a raw command field into a content id. */
function toContentIdField(raw: string, field: string): Result<ContentId> {
  if (!isContentId(raw)) {
    return err(appError(ErrorCode.UnknownContent, `malformed ${field}`, { [field]: raw }));
  }
  return ok(raw);
}

/**
 * Checks a land expansion is legal. Rejects: a plot already at the farm
 * region's edge (ADR-030 §1 — the cap the grid itself imposed before v0.3,
 * now stated by meaning so ownership can never cross into town land),
 * insufficient funds for the §6.3 escalation.
 */
export function validateExpandLand(world: CommandWorld): ValidationResult {
  const purchased = world.economy.expansionsPurchased;
  if (plotSizeAfter(purchased + 1) > FARM_SIZE) {
    return err(
      appError(ErrorCode.InvalidIntent, 'the plot is already at its maximum size', { purchased }),
    );
  }

  const cost = expansionCost(purchased);
  if (world.wallet.coins < cost) {
    return err(
      appError(ErrorCode.InsufficientFunds, 'not enough coins to expand', {
        cost,
        held: world.wallet.coins,
      }),
    );
  }

  return ok();
}

/**
 * Buys the next ring of land (§6.3): spends `floor(100 × 1.8^n)`, claims the
 * larger centered plot (the inner claim is idempotent — only the ring is new),
 * and counts the purchase. New tiles arrive grass, therefore tillable.
 */
export function expandLand(world: CommandWorld): Result<void> {
  const validation = validateExpandLand(world);
  if (!validation.ok) return validation;

  const purchased = world.economy.expansionsPurchased;
  const spend = spendCoins(world.wallet, expansionCost(purchased));
  if (!spend.ok) return spend; // unreachable — funds validated above

  claimCenteredPlot(world.tiles, plotSizeAfter(purchased + 1));
  world.economy.expansionsPurchased = purchased + 1;
  return ok();
}

/**
 * Credits the wallet — the declared DEV-ONLY source (ADR-013 §sources). Only
 * the devtools console's `money` command and test setups issue this; no
 * gameplay surface does. It exists as a command because there is no other
 * write path into the world (ADR-010 §1), dev tooling included.
 */
export function grantCoins(world: CommandWorld, amount: number): Result<void> {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    return err(appError(ErrorCode.InvalidIntent, 'grant must be a positive integer', { amount }));
  }
  return addCoins(world.wallet, amount);
}

export function registerCommerceCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('sellItems', {
    validate: (world, command) => {
      const quantity = toQuantity(command.quantity);
      if (!quantity.ok) return quantity;
      const itemId = toContentIdField(command.itemId, 'itemId');
      return itemId.ok ? validateSell(world, itemId.value, quantity.value) : itemId;
    },
    execute: (context, command) => {
      const quantity = toQuantity(command.quantity);
      if (!quantity.ok) return quantity;
      const itemId = toContentIdField(command.itemId, 'itemId');
      return itemId.ok ? sellItems(context.world, itemId.value, quantity.value) : itemId;
    },
  });

  dispatcher.register('buySeeds', {
    validate: (world, command) => {
      const quantity = toQuantity(command.quantity);
      if (!quantity.ok) return quantity;
      const cropId = toContentIdField(command.cropId, 'cropId');
      return cropId.ok ? validateBuySeeds(world, cropId.value, quantity.value) : cropId;
    },
    execute: (context, command) => {
      const quantity = toQuantity(command.quantity);
      if (!quantity.ok) return quantity;
      const cropId = toContentIdField(command.cropId, 'cropId');
      return cropId.ok ? buySeeds(context.world, cropId.value, quantity.value) : cropId;
    },
  });

  dispatcher.register('expandLand', {
    validate: (world) => validateExpandLand(world),
    execute: (context) => expandLand(context.world),
  });

  dispatcher.register('grantCoins', {
    validate: (_world, command) =>
      Number.isSafeInteger(command.amount) && command.amount >= 1
        ? ok()
        : err(
            appError(ErrorCode.InvalidIntent, 'grant must be a positive integer', {
              amount: command.amount,
            }),
          ),
    execute: (context, command) => grantCoins(context.world, command.amount),
  });
}
