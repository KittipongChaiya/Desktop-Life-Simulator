/**
 * Economy state and the pricing engine. Phase-06, GAME_DESIGN.md §6.2, §6.3,
 * ADR-013 §Decision (pricing pipeline).
 *
 * Prices are content-defined bases passed through a bounded, deterministic
 * modifier pipeline (ADR-013). Three modifiers now ride it: the per-item sale
 * multiplier ([0.50, 1.00], depressed by sales, recovered by time), the
 * seasonal factor ([0.90, 1.00], phase-11), and DEMAND ([0.85, 1.15],
 * phase-21 — the modifier this header promised since phase-06). Since
 * ADR-033 the base price is the ANCHOR, not the ceiling: the town's wants
 * can pay a declared premium over it, and the player memorizes the bands.
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

import { hashString, mix32 } from '../../shared/hash';
import type { ContentId } from '../../shared/ids';
import { cropYielding, isInSeason, type CropRegistry } from '../content/crops';
import { dayFor, seasonFor } from '../time/game-clock';

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

/**
 * The current sale price: `floor(basePrice × Π modifiers)` (ADR-013 §4).
 *
 * VARIADIC since phase-11c, and floored exactly ONCE at the end. Flooring per
 * modifier would compound rounding and make the declared band a lie — the
 * predictability guarantee is that the effective price cannot leave the product
 * of the bands, which only holds if the product is taken first.
 */
export function salePrice(basePrice: number, ...modifiers: readonly number[]): number {
  return Math.floor(modifiers.reduce((price, modifier) => price * modifier, basePrice));
}

/**
 * The seasonal price modifier's floor. Phase-11c — ADR-021 §2, ADR-013 §4.
 *
 * Band **[0.90, 1.00]**: produce sells at its base price in a season its crop
 * can be grown in, and at nine tenths otherwise. Combined with the sale
 * multiplier's [0.50, 1.00], the effective price lives in [0.45, 1.00] of base
 * — the product of the declared bands, which is the whole predictability
 * guarantee (ADR-013 §4).
 *
 * **It never exceeds 1.00, and that is deliberate.** A seasonal PREMIUM would
 * double demand's job (ADR-021 §2's refusal, upheld by ADR-033 §2): since
 * phase-21 the base price is the ANCHOR rather than the ceiling, and the one
 * modifier allowed above it is demand, with its own declared band. The season
 * still only ever shaves.
 *
 * **The band is shallow on purpose.** A player selling through a market stall
 * never meets it: produce is sold as it is harvested, in the season it grew in.
 * It is reachable by holding stock across a boundary, which is a choice. Ten
 * percent is enough to notice in the ledger and far too little to make being
 * away a mistake (`VISION.md` §2.2).
 */
export const SEASON_MULTIPLIER_FLOOR = 0.9;

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

// ── Land expansion (§6.3) ────────────────────────────────────────────────────

/** Base cost of the first expansion (§6.3). */
export const EXPANSION_BASE_COST = 100;

/** Per-expansion cost multiplier (§6.3). */
export const EXPANSION_COST_GROWTH = 1.8;

/** Starting plot side length (`GAME_DESIGN.md` §2.1). */
export const BASE_PLOT_SIZE = 8;

/** Cost of the NEXT expansion after `purchased` have been bought: `floor(100 × 1.8^n)`. */
export function expansionCost(purchased: number): number {
  return Math.floor(EXPANSION_BASE_COST * EXPANSION_COST_GROWTH ** purchased);
}

/** Plot side length after `purchased` expansions — one ring (+2) each (§6.3). */
export function plotSizeAfter(purchased: number): number {
  return BASE_PLOT_SIZE + 2 * purchased;
}

/**
 * What a seasonal price needs to know. `World` satisfies this structurally.
 *
 * The season is DERIVED here rather than passed in, so no caller can hand the
 * pipeline a season the tick disagrees with (ADR-021 §1).
 */
export interface SeasonalPricingSource {
  readonly tick: number;
  readonly ticksPerDay: number;
  readonly daysPerSeason: number;
  readonly seasons: readonly string[];
  readonly cropRegistry: CropRegistry;
}

/**
 * The seasonal modifier for an item, in `[SEASON_MULTIPLIER_FLOOR, 1]`.
 *
 * Returns 1 for anything no crop yields — seeds, and any future manufactured
 * good. A seed's price is what a crop costs to START, and gating that by season
 * would double the plantability rule with a silent second penalty.
 */
export function seasonalMultiplier(source: SeasonalPricingSource, item: ContentId): number {
  const crop = cropYielding(source.cropRegistry, item);
  if (crop === undefined) return 1;

  const season = seasonFor(
    dayFor(source.tick, source.ticksPerDay),
    source.daysPerSeason,
    source.seasons,
  );
  return isInSeason(crop, season) ? 1 : SEASON_MULTIPLIER_FLOOR;
}

// ── Demand (phase-21, ADR-033) ───────────────────────────────────────────────

/** A demand spell's length, in days. Two days is 40 real minutes — a mood. */
export const DEMAND_SPELL_DAYS = 2;

/**
 * The declared demand distribution (ADR-033 §1). The doubled `1.00` makes
 * steady the commonest state, and the table's mean is exactly 1.0 — demand
 * redistributes price over time rather than inflating or deflating it. This
 * table IS the tuning surface (ADR-004 §5).
 */
export const DEMAND_STEPS = [0.85, 0.9, 0.95, 1.0, 1.0, 1.05, 1.1, 1.15] as const;

/** The band's floor — what offline catch-up credits at (ADR-033 §4). */
export const DEMAND_FLOOR = DEMAND_STEPS[0];

/**
 * What a spell lookup needs — seed and the crop registry alone, so the offer
 * board (which has no `tick`) can ask about tomorrow without pretending to
 * be a full pricing source.
 */
export interface DemandSpellSource {
  readonly seed: number;
  readonly cropRegistry: CropRegistry;
}

/** What live demand pricing reads. `World` satisfies this structurally. */
export interface DemandPricingSource extends SeasonalPricingSource {
  readonly seed: number;
}

/** The demand spell a tick falls in. */
export function demandSpellFor(tick: number, ticksPerDay: number): number {
  return Math.floor(dayFor(tick, ticksPerDay) / DEMAND_SPELL_DAYS);
}

/**
 * The demand multiplier for an item at a SPELL, in the declared band.
 *
 * A hash, never a draw (ADR-022 §1): same seed, same item, same spell, same
 * answer, on every machine — which is what lets catch-up query the past and
 * the notice board lean toward tomorrow's wants. Non-yield items answer 1,
 * the seasonal modifier's own guard: a seed's price is a crop's starting
 * cost, not a market mood.
 */
export function demandAtSpell(source: DemandSpellSource, item: ContentId, spell: number): number {
  const crop = cropYielding(source.cropRegistry, item);
  if (crop === undefined) return 1;
  const step = mix32(mix32(source.seed, hashString(item)), spell) % DEMAND_STEPS.length;
  return DEMAND_STEPS[step] ?? 1;
}

/** The demand multiplier for an item NOW — the pipeline's third factor. */
export function demandMultiplier(source: DemandPricingSource, item: ContentId): number {
  return demandAtSpell(source, item, demandSpellFor(source.tick, source.ticksPerDay));
}

/**
 * The LOWEST demand an item saw across a tick span — offline catch-up's
 * conservative price point (ADR-033 §4). Exact when the span sits inside one
 * spell; never above any spell the span touched.
 */
export function worstDemandOver(
  source: DemandPricingSource,
  item: ContentId,
  fromTick: number,
  toTick: number,
): number {
  const first = demandSpellFor(fromTick, source.ticksPerDay);
  const last = demandSpellFor(toTick, source.ticksPerDay);
  let worst = Infinity;
  for (let spell = first; spell <= last; spell += 1) {
    worst = Math.min(worst, demandAtSpell(source, item, spell));
  }
  return Number.isFinite(worst) ? worst : 1;
}
