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

import { dayFor, phaseFor, seasonFor, type DayPhase } from '../time/game-clock';

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
}

/** The current day and phase. Pure — no clock read, no generator (ADR-007 §1). */
export function projectTime(source: TimeProjectionSource): TimeView {
  const day = dayFor(source.tick, source.ticksPerDay);

  return {
    day,
    phase: phaseFor(source.tick, source.ticksPerDay),
    season: seasonFor(day, source.daysPerSeason, source.seasons),
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
  return a.day === b.day && a.phase === b.phase && a.season === b.season;
}
