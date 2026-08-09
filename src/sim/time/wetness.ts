/**
 * Derived wetness. Phase-12b — ADR-022 §3.
 *
 * ```
 * wetness(tile, tick) = f( wateredAt[tile], rainfall over [wateredAt, tick] )
 * ```
 *
 * Nothing accumulates. The grid stores WHEN a tile was last watered, and the
 * rain since is recomputed from the weather derivation — which is exact,
 * because ADR-022 §1 makes weather a function of the period index, so any span
 * decomposes into whole periods whose values are known.
 *
 * That decomposition is the piece ADR-009 §2 named years ago and never got:
 *
 * > a piecewise-constant rate history that never had to be stored
 *
 * It is obtained here for free, because the rate history is not stored at all —
 * it is derived from the same hash the weather came from.
 *
 * ## The sum is bounded by the number of periods, not the number of ticks
 *
 * A player away for the full eight-hour offline cap crosses 96 weather periods
 * at the shipped default. Summing 96 terms is not a loop worth avoiding; summing
 * 576,000 ticks would be. The two partial periods at the ends are handled
 * exactly rather than rounded, so the answer does not depend on where a span
 * happens to start.
 *
 * ## Wetness decays, and the decay is derived too
 *
 * Rain adds; time removes. Both are computed from the same span, so a tile's
 * wetness is a function of the tick and nothing else — advancing the tick past
 * a gap IS the catch-up (ADR-007 §6), with no error budget and nothing to
 * reconcile.
 */

import type { WeatherKindDefinition } from '../content/weather-kinds';

import { seasonFor, dayFor } from './game-clock';
import { weatherFor, weatherPeriodFor } from './weather';

/**
 * How far back wetness remembers, in ticks. Phase-12c.
 *
 * **A bounded WINDOW, not a decay rate**, and the correction matters. Phase-12b
 * shipped this as `rainfall since wateredAt, minus drying × elapsed`, which is
 * wrong in a way that only shows up over hours: `wateredAt` is 0 on an
 * untouched tile, so the span ran from the world's first tick and rain
 * integrated forever. With core content raining about a third of the time,
 * accumulation outruns drying and **every tile saturates at the cap and stays
 * there** — permanently wet, which is the accumulator behaviour ADR-022 §3
 * exists to prevent, wearing a derivation's clothes.
 *
 * A window fixes it by construction: rain leaves the window as time passes, so
 * there is nothing to accumulate. 12,000 ticks is half a day and two weather
 * periods at the shipped defaults, which is also what bounds the cost — the sum
 * is over two or three periods however long the world has been running.
 */
export const WETNESS_MEMORY_TICKS = 12_000;

/** Wetness a fresh watering delivers. Sized so watering reads as one soaking. */
export const WATERING_UNITS = 6_000;

/** The most wetness a tile can hold. Rain beyond this is runoff. */
export const WETNESS_CAP = 6_000;

/** What the derivation reads. `World` satisfies this structurally. */
export interface WetnessSource {
  readonly seed: number;
  readonly ticksPerDay: number;
  readonly daysPerSeason: number;
  readonly seasons: readonly string[];
  readonly ticksPerWeatherPeriod: number;
}

/**
 * Total rainfall delivered over `[from, to)`, in wetness units.
 *
 * Exact: whole periods contribute their full length, the two partial periods
 * at the ends contribute their overlap. Returns 0 for an empty or reversed
 * span rather than a negative quantity.
 */
export function rainfallOver(
  source: WetnessSource,
  kinds: readonly WeatherKindDefinition[],
  from: number,
  to: number,
): number {
  if (to <= from || source.ticksPerWeatherPeriod <= 0) return 0;

  const first = weatherPeriodFor(from, source.ticksPerWeatherPeriod);
  const last = weatherPeriodFor(to - 1, source.ticksPerWeatherPeriod);

  let total = 0;
  for (let period = first; period <= last; period += 1) {
    const start = period * source.ticksPerWeatherPeriod;
    const end = start + source.ticksPerWeatherPeriod;

    // The overlap of this period with the span — a full period in the middle,
    // a partial one at either end.
    const ticks = Math.min(to, end) - Math.max(from, start);
    if (ticks <= 0) continue;

    // The season is taken at the period's START, so a period has one weather
    // for its whole length even if a season turns inside it. Splitting it
    // would make weather depend on the calendar mid-period, which is a second
    // rule for no gain.
    const season = seasonFor(
      dayFor(start, source.ticksPerDay),
      source.daysPerSeason,
      source.seasons,
    );
    const weather = weatherFor(source.seed, period, season, kinds);
    if (weather === undefined) continue; // no content registered — dry

    total += weather.rainfall * ticks;
  }

  return total;
}

/**
 * A tile's wetness at a tick, from rain in the memory window and any watering
 * inside it.
 *
 * Rain and watering are combined by `max`, not by adding: a watered tile in a
 * downpour is wet, not twice as wet. Adding them would make the cap the only
 * thing standing between the model and an accumulator.
 */
export function wetnessAt(
  source: WetnessSource,
  kinds: readonly WeatherKindDefinition[],
  wateredAt: number,
  tick: number,
): number {
  if (tick <= 0) return 0;

  const windowStart = Math.max(0, tick - WETNESS_MEMORY_TICKS);
  const rain = rainfallOver(source, kinds, windowStart, tick);
  // `wateredAt` of 0 means never watered, and tick 0 is not a watering.
  const watered = wateredAt > 0 && wateredAt >= windowStart ? WATERING_UNITS : 0;

  return Math.min(WETNESS_CAP, Math.max(rain, watered));
}
