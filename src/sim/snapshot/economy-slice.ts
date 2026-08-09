/**
 * Wallet and economy snapshot projections. Phase-06d, ADR-005 §2.
 *
 * The wallet slice is one number, so the coin readout re-renders alone when
 * coins change and never otherwise.
 *
 * The economy slice speaks in INTEGER prices, deliberately not multipliers —
 * the crit-16 gate: a recovering multiplier moves every 20 ticks, but the
 * visible price `floor(basePrice × multiplier)` crosses far fewer values, and
 * a view can only ever show whole coins. Projecting the integer is what keeps
 * a recovering market from re-rendering the shop forty times.
 */

import type { ItemRegistry } from '../content/items';
import {
  seasonalMultiplier,
  type SeasonalPricingSource,
  expansionCost,
  multiplierOf,
  plotSizeAfter,
  salePrice,
  type EconomyState,
} from '../world/economy';
import type { Wallet } from '../world/wallet';

/** The coin readout's entire world. */
export interface WalletView {
  readonly coins: number;
}

/** One item's live market line. */
export interface PriceView {
  readonly item: string;
  /** The current sale price — `floor(basePrice × multiplier)`. Integer, always. */
  readonly price: number;
  /** The undepressed reference, for "price is down" indicators. */
  readonly basePrice: number;
}

export interface EconomyView {
  /** Every registered item, sorted by id (deterministic). */
  readonly prices: readonly PriceView[];
  /** Land expansions bought so far (§6.3). */
  readonly expansionsPurchased: number;
  /** Cost of the next expansion, or null once the plot is at the world edge. */
  readonly nextExpansionCost: number | null;
}

/** The world state the projections read. `World` satisfies this structurally. */
export interface EconomyProjectionSource extends SeasonalPricingSource {
  readonly wallet: Wallet;
  readonly economy: EconomyState;
  readonly itemRegistry: ItemRegistry;
}

/** The largest plot the 64×64 world can hold. */
const MAX_PLOT_SIZE = 64;

export function projectWallet(source: EconomyProjectionSource): WalletView {
  return { coins: source.wallet.coins };
}

export function walletEquals(a: WalletView, b: WalletView): boolean {
  return a.coins === b.coins;
}

export function projectEconomy(source: EconomyProjectionSource): EconomyView {
  const prices = source.itemRegistry
    .all()
    .map((definition) => ({
      item: definition.id,
      price: salePrice(
        definition.basePrice,
        multiplierOf(source.economy, definition.id),
        seasonalMultiplier(source, definition.id),
      ),
      basePrice: definition.basePrice,
    }))
    .sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));

  const purchased = source.economy.expansionsPurchased;
  const atMax = plotSizeAfter(purchased + 1) > MAX_PLOT_SIZE;

  return {
    prices,
    expansionsPurchased: purchased,
    nextExpansionCost: atMax ? null : expansionCost(purchased),
  };
}

/** True if two projections are equal — the change gate (crit 16). */
export function economyEquals(a: EconomyView, b: EconomyView): boolean {
  if (
    a.expansionsPurchased !== b.expansionsPurchased ||
    a.nextExpansionCost !== b.nextExpansionCost
  ) {
    return false;
  }
  if (a.prices.length !== b.prices.length) return false;
  for (let i = 0; i < a.prices.length; i += 1) {
    const x = a.prices[i];
    const y = b.prices[i];
    if (x === undefined || y === undefined) return false;
    if (x.item !== y.item || x.price !== y.price || x.basePrice !== y.basePrice) return false;
  }
  return true;
}
