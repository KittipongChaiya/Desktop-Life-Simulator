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

import { appError, ErrorCode } from '../../shared/errors';
import { isContentId, type ContentId } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { stackSizeOf } from '../content/items';
import { acceptable, addItems, containerCount, removeItems } from '../world/container';
import { multiplierOf, recordSale, salePrice } from '../world/economy';
import { addCoins, spendCoins } from '../world/wallet';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

// ── Validators ───────────────────────────────────────────────────────────────

/**
 * Checks a sale is legal. Rejects: unknown item, bad quantity, more than the
 * player inventory holds. Order: most specific cause first.
 */
export function validateSell(
  world: CommandWorld,
  itemId: ContentId,
  quantity: number,
): ValidationResult {
  const definition = world.itemRegistry.get(itemId);
  if (!definition.ok) return err(definition.error);

  const held = containerCount(world.inventory, itemId);
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
 * Sells items from the player inventory: removes the goods, credits the wallet
 * at the pre-sale price, then depresses the multiplier and publishes the fact.
 */
export function sellItems(world: CommandWorld, itemId: ContentId, quantity: number): Result<void> {
  const validation = validateSell(world, itemId, quantity);
  if (!validation.ok) return validation;

  const definition = world.itemRegistry.get(itemId);
  if (!definition.ok) return err(definition.error); // unreachable — validated above

  // Price the whole batch BEFORE recording the sale (interpretation 1).
  const coins =
    quantity * salePrice(definition.value.basePrice, multiplierOf(world.economy, itemId));

  removeItems(world.inventory, itemId, quantity); // validated — removes exactly
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
}
