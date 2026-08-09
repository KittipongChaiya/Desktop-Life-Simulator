/**
 * Weather-modulated growth. Phase-12c — ADR-022 §4.
 *
 * This is the consumer wetness had to gain or not ship at all:
 *
 * > wetness must gain a real consumer in the same phase that gives it a
 * > producer, or neither ships (ADR-022 §4)
 *
 * Shipping rain that writes a value nothing reads would have recreated
 * `grid.moisture` in the very phase that removed it.
 *
 * ## Rain accelerates. Drought never stalls
 *
 * ADR-022 §5 sets the ceiling: **a dry farm must remain fully playable and
 * fully profitable.** So the rate is `1` when dry and `WET_GROWTH_RATE` when
 * wet — never below 1, ever. A dry world grows at exactly the speed it grew at
 * before this phase existed, which is also why no crop time needed rebalancing.
 *
 * `VISION.md` §2.2 is the reason rather than caution: weather is the purest form
 * of a thing the player cannot control and cannot be present for. A drought that
 * slowed a farm would punish someone for a hash of a number they never saw.
 *
 * ## The integral is a finite sum, and reduces to ADR-009's behaviour
 *
 * ```
 * progress(crop, tick) = ∫ rate(wetness(tile, t)) dt   over [plantedTick, tick]
 * ```
 *
 * evaluated as one term per weather period plus two partials, because wetness
 * is constant within a period by construction. When it never rains every rate
 * is 1 and the sum collapses to `tick − plantedTick` — so ADR-009's shipped
 * growth is the special case, not something replaced (ADR-022 §4).
 *
 * The cost is bounded by periods, not ticks: a crop planted an hour ago spans
 * twelve periods at the shipped default, and the longest crop in the game spans
 * four.
 */

import type { WeatherKindDefinition } from '../content/weather-kinds';
import type { Crop } from '../world/crop';

import { weatherPeriodFor } from './weather';
import { wetnessAt, type WetnessSource } from './wetness';

/**
 * Growth rate on wet soil, as a multiple of the dry rate.
 *
 * Declared and bounded, so the effective rate lives in [1.00, 1.25] and a
 * player who knows a crop's time always knows its best and worst case — the
 * ADR-013 §4 predictability discipline applied to time instead of money.
 *
 * A quarter faster is enough to notice across a pumpkin and far too little to
 * make a dry spell feel like a punishment.
 */
export const WET_GROWTH_RATE = 1.25;

/** Wetness at or above which soil counts as wet. */
export const WET_THRESHOLD = 1;

/** What modulated growth reads. `World` satisfies this structurally. */
export interface GrowthSource extends WetnessSource {
  readonly tiles: { readonly wateredAt: Uint32Array };
  readonly weatherKindRegistry: { all(): readonly WeatherKindDefinition[] };
}

/** The growth rate on a tile at a tick. Never below 1 (ADR-022 §5). */
export function growthRateAt(source: GrowthSource, tile: number, tick: number): number {
  const wetness = wetnessAt(
    source,
    source.weatherKindRegistry.all(),
    source.tiles.wateredAt[tile] ?? 0,
    tick,
  );
  return wetness >= WET_THRESHOLD ? WET_GROWTH_RATE : 1;
}

/**
 * Growth accrued by a crop up to `tick`, in effective ticks.
 *
 * Replaces `elapsedTicks` wherever the question is "how grown is this", and
 * deliberately not where the question is "how old is this" — a player looking
 * at a crop's age wants wall-clock, not effective, time.
 *
 * The rate is sampled at each period's START and applied across the overlap.
 * That is a definition, not an approximation of a finer truth: wetness is
 * constant within a period, so there is no finer truth to approximate.
 */
export function growthProgress(source: GrowthSource, crop: Crop, tick: number): number {
  const from = crop.plantedTick;
  const to = tick;
  if (to <= from) return 0;

  const length = source.ticksPerWeatherPeriod;
  // Without a usable period length there is no rate history, so growth is
  // elapsed time — ADR-009's behaviour, reached by the shortest path.
  //
  // TESTED FOR FINITENESS, not just for sign. `undefined <= 0` is false, so a
  // source missing the field falls through to a loop bounded by NaN, which
  // runs zero times and reports a crop that never grows. A silent zero is the
  // worst answer available here — it stops the game rather than degrading it —
  // so this rejects anything that is not a positive number rather than only
  // what is negative. Found by four tests failing with crops frozen at stage 0.
  if (!Number.isFinite(length) || length <= 0) return to - from;

  const first = weatherPeriodFor(from, length);
  const last = weatherPeriodFor(to - 1, length);

  let progress = 0;
  for (let period = first; period <= last; period += 1) {
    const start = period * length;
    const ticks = Math.min(to, start + length) - Math.max(from, start);
    if (ticks <= 0) continue;

    progress += ticks * growthRateAt(source, crop.tile, start);
  }

  return progress;
}
