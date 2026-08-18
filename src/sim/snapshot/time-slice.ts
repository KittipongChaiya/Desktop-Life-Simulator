/**
 * The calendar, projected for views. Phase-10b — ADR-020 §3.
 *
 * `{ day, phase }` and nothing else. The omission is the design:
 *
 * > **The simulation publishes a phase. It never publishes a fraction of a
 * > day.** (ADR-020 §3)
 *
 * A `timeOfDay` here would be correct, cheap to compute, and would republish
 * this slice on all 1,728,000 ticks of a day — ADR-005 §2 calls that a defect
 * outright, and PERFORMANCE.md §4.2's idle budget is what it would spend. The
 * quantized phase is the same move `CropStage` makes: four states, so a day
 * dirties the lighting layer four times rather than continuously.
 *
 * `day` rides along because it changes on a phase boundary anyway — the first
 * phase begins at time-of-day zero, which is exactly when the day increments.
 * Carrying it costs no extra republish, and a readout of the day alone would
 * otherwise need a slice of its own.
 *
 * It is deliberately NOT part of `StatusSlice`. Status republishes once a
 * second (uptime), so a day readout folded into it would re-render 86,400
 * times a day to show a number that changes once (ADR-005 §2 — a component
 * subscribes only to what it reads).
 */

import type { WeatherKindDefinition } from '../content/weather-kinds';
import { dayFor, phaseFor, seasonFor, type DayPhase } from '../time/game-clock';
import { weatherFor, weatherPeriodFor } from '../time/weather';

/** The calendar as a view sees it. */
export interface TimeView {
  /** Days elapsed since world creation, counting from zero. */
  readonly day: number;
  /** The named phase the world is in — never a fraction (ADR-020 §3). */
  readonly phase: DayPhase;
  /**
   * The season, or `undefined` in a world whose content registered none.
   *
   * It rides here rather than in a slice of its own because it changes far
   * LESS often than the phase — once a week of game time against four times a
   * day — so it adds no republish at all. A slice exists to stop a consumer
   * re-rendering on changes it does not read; nothing re-renders on a change
   * that never happens.
   */
  readonly season: string | undefined;
  /**
   * The current weather kind's id, or `undefined` if none can occur.
   *
   * Rides here for the season's reason: it changes four times a day at the
   * shipped defaults, which is the same order as the phase, so it adds no
   * republish anyone pays for. A `weatherChanged` event was not built — see
   * ADR-022 §6's amendment and the phase doc; presentation reads slices.
   */
  readonly weather: string | undefined;
  /**
   * Whether the current weather kind puts water on the ground. Phase-29.
   *
   * A BOOLEAN beside the id it is derived from, and the pair is deliberate:
   * `weather` is the identity a future consumer may want to branch on, and
   * this is the one question the renderer actually asks. Deriving it there
   * would mean the renderer holding the weather registry to look up
   * `rainfall`, which is a live simulation read for a fact the slice can
   * simply carry (ADR-039 §4).
   *
   * It costs no republish: it can only change when `weather` does.
   */
  readonly raining: boolean;
}

/**
 * The world state the projection reads. `World` satisfies this structurally.
 *
 * `ticksPerDay` comes from the world rather than a constant because it is
 * frozen per world (ADR-020 §2) — reading the default here would renumber the
 * days of any save created under a different one.
 */
export interface TimeProjectionSource {
  readonly tick: number;
  readonly ticksPerDay: number;
  /** Frozen per world (ADR-021 §1), like `ticksPerDay`. */
  readonly daysPerSeason: number;
  readonly seasons: readonly string[];
  /** Frozen per world (ADR-022 §1). */
  readonly ticksPerWeatherPeriod: number;
  readonly seed: number;
  readonly weatherKindRegistry: { all(): readonly WeatherKindDefinition[] };
}

/** The current day and phase. Pure — no clock read, no generator (ADR-007 §1). */
export function projectTime(source: TimeProjectionSource): TimeView {
  const day = dayFor(source.tick, source.ticksPerDay);

  const season = seasonFor(day, source.daysPerSeason, source.seasons);

  const kind = weatherFor(
    source.seed,
    weatherPeriodFor(source.tick, source.ticksPerWeatherPeriod),
    season,
    source.weatherKindRegistry.all(),
  );

  return {
    day,
    phase: phaseFor(source.tick, source.ticksPerDay),
    season,
    weather: kind?.id,
    raining: (kind?.rainfall ?? 0) > 0,
  };
}

/**
 * Change test for the time slice.
 *
 * Both fields are compared even though `day` cannot move without `phase` also
 * moving. Relying on that would make this function correct only for a phase set
 * whose first phase starts at time-of-day zero — true today, and not a property
 * this comparison should silently depend on.
 */
export function timeEquals(a: TimeView, b: TimeView): boolean {
  // `raining` is deliberately absent: it is a function of `weather`, so it
  // cannot change without that changing, and comparing it would be comparing
  // the same fact twice. If a weather kind's rainfall ever became mutable this
  // would be wrong — and rainfall is content, which is frozen at startup.
  return a.day === b.day && a.phase === b.phase && a.season === b.season && a.weather === b.weather;
}
