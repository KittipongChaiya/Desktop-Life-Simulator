/**
 * Economy state and the pricing engine. Phase-06, GAME_DESIGN.md §6.2, §6.3,
 * ADR-013 §Decision (pricing pipeline).
 *
 * Prices are content-defined bases passed through a bounded, deterministic
 * modifier pipeline (ADR-013). In v0.1 the pipeline is one modifier: the
 * per-item multiplier, depressed by sales and recovered by time, clamped to
 * [0.50, 1.00]. Future modifiers (regional, contracts, v0.3 demand) extend
 * the pipeline; they never replace it.
 *
 * Multipliers are stored to 3 decimal places ROUNDED ON WRITE
 * (`SAVE_FORMAT.md` §3.3). Every mutation passes through `roundMultiplier`,
 * so the stored value is always an exact 3-decimal quantity — binary floating
 * point never accumulates into the save format or across a determinism replay.
 *
 * The map is SPARSE: no entry means 1.0. Recovery deletes entries reaching the
 * cap, so an idle economy carries no state and the snapshot slice compares
 * cheaply.
 */

import type { ContentId } from '../../shared/ids';

/** Multiplier lost per unit sold (`GAME_DESIGN.md` §6.2). */
export const SALE_DECAY_PER_UNIT = 0.002;

/** Multiplier regained per recovery period (§6.2). */
export const RECOVERY_PER_PERIOD = 0.005;

/** Ticks per recovery period (§6.2 — "every 20 ticks"). */
export const RECOVERY_PERIOD_TICKS = 20;

/** The worst case a dump can reach (§6.2). */
export const MULTIPLIER_FLOOR = 0.5;

/** The undepressed ceiling (§6.2). */
export const MULTIPLIER_CAP = 1.0;

export interface EconomyState {
  /**
   * Per-item price multipliers, SPARSE — an absent item is at 1.0. Values are
   * exact 3-decimal quantities in [0.50, 1.00).
   */
  readonly multipliers: Map<ContentId, number>;

  /** Land expansions bought so far — the `n` in `cost(n)` (§6.3). */
  expansionsPurchased: number;
}

export function createEconomyState(): EconomyState {
  return { multipliers: new Map(), expansionsPurchased: 0 };
}

/** Rounds to the stored precision: 3 decimals, on every write (SAVE_FORMAT §3.3). */
function roundMultiplier(multiplier: number): number {
  return Math.round(multiplier * 1000) / 1000;
}

/** The multiplier for an item — 1.0 unless a sale has depressed it. */
export function multiplierOf(state: EconomyState, item: ContentId): number {
  return state.multipliers.get(item) ?? MULTIPLIER_CAP;
}

/** The current sale price: `floor(basePrice × multiplier)` (§6.2). Integer, always. */
export function salePrice(basePrice: number, multiplier: number): number {
  return Math.floor(basePrice * multiplier);
}

/** The multiplier after selling `units`: down `units × 0.002`, floored at 0.50. */
export function decayedMultiplier(multiplier: number, units: number): number {
  return Math.max(MULTIPLIER_FLOOR, roundMultiplier(multiplier - units * SALE_DECAY_PER_UNIT));
}

/**
 * The multiplier after `periods` recovery periods, capped at 1.00.
 *
 * PURE and batch-capable: phase-07's offline catchUp passes the elapsed period
 * count and gets exactly what tick-by-tick recovery would have produced —
 * per-period rounding cannot diverge because every intermediate value is an
 * exact multiple of 0.005 within 3 decimals.
 */
export function recoveredMultiplier(multiplier: number, periods: number): number {
  return Math.min(MULTIPLIER_CAP, roundMultiplier(multiplier + periods * RECOVERY_PER_PERIOD));
}

/** Records a sale of `units`, depressing the item's multiplier. */
export function recordSale(state: EconomyState, item: ContentId, units: number): void {
  state.multipliers.set(item, decayedMultiplier(multiplierOf(state, item), units));
}

/**
 * Advances every depressed multiplier by one recovery period, dropping entries
 * that reach the cap so the map stays sparse.
 */
export function recoverAll(state: EconomyState): void {
  for (const [item, multiplier] of state.multipliers) {
    const recovered = recoveredMultiplier(multiplier, 1);
    if (recovered >= MULTIPLIER_CAP) state.multipliers.delete(item);
    else state.multipliers.set(item, recovered);
  }
}
