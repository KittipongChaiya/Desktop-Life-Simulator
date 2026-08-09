/**
 * Weather kinds. Phase-12a — ADR-022 §1, §2.
 *
 * The engine owns the derivation and the modifier vocabulary; a content source
 * owns **which kinds exist, their weights per season, and their declared
 * modifier values** (ADR-022 §1). So this file defines the shape of a weather
 * kind and holds no weather.
 *
 * ## A kind is a bag of declared modifiers, and today the bag holds one thing
 *
 * ADR-022 §2 is emphatic that weather never runs a loop:
 *
 * > **No weather system performs gameplay.** Weather is state that existing
 * > systems read. Rain does not run a watering system; it changes what the
 * > watering-derived value _is_.
 *
 * Its table anticipates wind and storm modifiers. Only `rainfall` ships,
 * because only wetness has a derivation to modify (phase-12b). A modifier with
 * nothing reading it is the dead-state problem ADR-022 was written about, one
 * version later — so the vocabulary grows when something consumes it, not
 * before (`AI_RULES.md` §1.5).
 *
 * ## Registration order is part of the answer
 *
 * Selection walks the kinds in registration order, so reordering them changes
 * which weather a given (seed, period) produces. Appending is safe. This is the
 * `seasons.ts` and `tile-kinds.ts` rule a third time, and the mildest of the
 * three: no save stores a weather kind, so the only consequence is that a
 * world's past weather is recomputed differently — and ADR-022 §5 makes rain a
 * convenience, never a requirement.
 */

import { asContentId, type ContentId } from '../../shared/ids';

import { createContentRegistry, type ContentRegistry } from './registry';

/** Weight table key meaning "every season not named here", including none. */
export const ANY_SEASON = '*';

export interface WeatherKindDefinition {
  readonly id: ContentId;
  /** What a player reads. Presentation only — no rule may branch on it. */
  readonly displayName: string;
  /**
   * Selection weight per season id, with `'*'` as the fallback.
   *
   * A kind absent from a season's table and with no `'*'` entry simply cannot
   * occur then, which is how a source ships a winter-only blizzard without the
   * engine knowing what winter is.
   */
  readonly weights: Readonly<Record<string, number>>;
  /**
   * Rain delivered per tick while this weather holds, in wetness units.
   *
   * The one declared modifier in the vocabulary today (ADR-022 §2). Zero means
   * dry — `core:clear` is not a special case in the engine, it is a kind whose
   * rainfall happens to be nothing.
   */
  readonly rainfall: number;
}

export const CORE_CLEAR = asContentId('core:clear');
export const CORE_RAIN = asContentId('core:rain');

export type WeatherKindRegistry = ContentRegistry<WeatherKindDefinition>;

export function createWeatherKindRegistry(): WeatherKindRegistry {
  return createContentRegistry<WeatherKindDefinition>('weather kind');
}

/** This kind's weight in a season, or in a world that has no seasons. */
export function weightIn(kind: WeatherKindDefinition, season: string | undefined): number {
  const named = season === undefined ? undefined : kind.weights[season];
  const weight = named ?? kind.weights[ANY_SEASON] ?? 0;
  // A negative weight would subtract from the total and corrupt the walk;
  // treated as absent rather than trusted (content is untrusted input).
  return weight > 0 ? weight : 0;
}

/**
 * Whether the world's current weather delivers rain.
 *
 * Lives here rather than in the renderer so "is it raining" is answered from
 * the weather's DECLARED rainfall — the same number growth reads — instead of
 * from a hardcoded list of ids the renderer would have to keep in step with
 * content (ADR-022 §2).
 */
export function isRaining(source: {
  readonly snapshots: {
    readonly time: { readonly value: { readonly weather: string | undefined } };
  };
  readonly weatherKindRegistry: WeatherKindRegistry;
}): boolean {
  const id = source.snapshots.time.value.weather;
  if (id === undefined) return false;

  const kind = source.weatherKindRegistry.all().find((entry) => entry.id === id);
  return kind !== undefined && kind.rainfall > 0;
}
