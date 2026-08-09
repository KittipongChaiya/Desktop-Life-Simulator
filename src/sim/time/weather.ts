/**
 * Weather, derived. Phase-12a — ADR-022 §1.
 *
 * ```
 * period  = floor(tick / ticksPerWeatherPeriod)
 * weather = weatherFor(seed, period, season)
 * ```
 *
 * **It is a hash, not a draw.** Consuming `world.rng` would mean a world that
 * showed weather diverged from one that did not — ADR-017 §5's rule at world
 * scale — and would put the save's determinism at the mercy of a cosmetic
 * feature. A hash of stored inputs cannot diverge, which buys the whole of
 * ADR-022 §1's table at once: no save field, no migration, no catch-up, and
 * weather that is queryable at any tick, past or future. Phase-12b's derived
 * wetness depends on that last property outright.
 *
 * ## Persistence comes from the period's LENGTH
 *
 * Each period's weather is drawn independently, so rain lasts exactly one
 * period and the period is what stops it flickering — five real minutes at the
 * shipped default. ADR-022 §1 leaves room for richer shape *"over consecutive
 * periods"*, and this signature already takes everything such a generator would
 * need: it can look at `period - 1` for free, because past weather is
 * computable. Nothing here has to change to add hysteresis later, so nothing
 * here does it now (`AI_RULES.md` §1.5).
 *
 * ## What happens when content disagrees
 *
 * Selection walks the registry in registration order and returns `undefined`
 * when no kind can occur — a world whose content registered no weather has no
 * weather, rather than an invented clear sky. Every caller in phase 12 treats
 * that as "dry", which is the correct degradation under ADR-022 §5: rain is a
 * convenience, and its absence must always be playable.
 */

import { mix32 } from '../../shared/hash';
import { weightIn, type WeatherKindDefinition } from '../content/weather-kinds';

/** The weather period a tick falls in, counting from zero. */
export function weatherPeriodFor(tick: number, ticksPerPeriod: number): number {
  if (ticksPerPeriod <= 0) return 0;
  return Math.floor(tick / ticksPerPeriod);
}

/**
 * The weather in a period, or `undefined` if no kind can occur.
 *
 * Pure and total. The same arguments give the same answer forever, which is
 * what makes *"weather queried for a past period equals what was observed live
 * at that period"* a property of the function rather than of a cache.
 */
export function weatherFor(
  seed: number,
  period: number,
  season: string | undefined,
  kinds: readonly WeatherKindDefinition[],
): WeatherKindDefinition | undefined {
  let total = 0;
  for (const kind of kinds) total += weightIn(kind, season);
  if (total <= 0) return undefined;

  // The hash is mixed with the period, so consecutive periods are unrelated
  // and the same period always resolves the same way.
  const roll = mix32(seed, period) % total;

  let walked = 0;
  for (const kind of kinds) {
    walked += weightIn(kind, season);
    if (roll < walked) return kind;
  }

  // Unreachable: `roll < total` and the walk reaches `total`. Handled over
  // asserted (`CODE_STYLE.md` §1.2) — a floating-point weight could in
  // principle leave a gap, and returning the last eligible kind is a better
  // answer than throwing inside a derivation the renderer calls.
  for (let index = kinds.length - 1; index >= 0; index -= 1) {
    const kind = kinds[index];
    if (kind !== undefined && weightIn(kind, season) > 0) return kind;
  }
  return undefined;
}
