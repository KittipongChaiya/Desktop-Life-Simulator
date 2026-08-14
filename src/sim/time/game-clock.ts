/**
 * The authoritative simulation time source.
 *
 * `world.tick` is the only notion of time the simulation has (ADR-007 §1) —
 * wall-clock reads are unavailable inside `src/sim` by compile configuration.
 * This module owns the conversion between ticks and human time so that
 * derivation lives in exactly one place.
 *
 * Before this existed, `tick / TICKS_PER_SECOND` was computed independently in
 * the snapshot projection and in the devtools console. Two copies is not a
 * crisis; four would be, and offline progress (phase-07) plus seasons (v0.2)
 * both add consumers.
 *
 * PURE. No wall-clock, no RNG, no I/O. Rendering timing is deliberately NOT
 * routed through here: the render loop measures real elapsed milliseconds to
 * drive interpolation (ADR-007 §5), which is a presentation concern and must
 * stay independent of simulation time.
 *
 * ── Extension points ────────────────────────────────────────────────────────
 * Future phases extend this module rather than reimplementing conversion:
 *
 *   • Game days      — a day needs a defined length in ticks, which is a design
 *                      decision belonging to the system that introduces
 *                      day/night (v0.2). Add `ticksPerDay` and derive from it.
 *   • Seasons        — build on game days once those exist (v0.2).
 *   • Offline catch-up — phase-07 converts a wall-clock gap into a tick delta.
 *                      That conversion belongs here; the CAP and the per-system
 *                      accuracy contracts belong in `src/persistence`
 *                      (SAVE_FORMAT.md §6).
 *
 * These are recorded in `docs/phases/phase-01.6-hardening.md` rather than as
 * TODOs in code. Adding fields now would mean inventing semantics — the length
 * of a day, the boundary of a season — before the systems that give them
 * meaning exist.
 */

import { TICK_MS, TICKS_PER_SECOND } from '../../shared/constants';

/** Converts a tick count to fractional seconds. */
export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}

/**
 * Converts a tick count to whole elapsed seconds.
 *
 * Separate from `ticksToSeconds` because callers that display or compare
 * elapsed time want a value that changes once per second, not every tick —
 * the property the status slice relies on to avoid republishing at tick rate
 * (ADR-005 §2).
 */
export function ticksToWholeSeconds(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_SECOND);
}

/** Converts a tick count to milliseconds of simulated time. */
export function ticksToMs(ticks: number): number {
  return ticks * TICK_MS;
}

/**
 * Converts elapsed milliseconds to whole ticks, discarding the remainder.
 *
 * Rounds DOWN deliberately: over-crediting time is the failure mode that
 * matters (SAVE_FORMAT.md §6.4), so a partial tick is never counted.
 */
export function msToTicks(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return Math.floor(milliseconds / TICK_MS);
}

/** Converts seconds to ticks. Used when authoring content durations. */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** A read-only view of simulation time, bound to a source of truth. */
export interface GameClock {
  /** Ticks elapsed since world creation. */
  readonly tick: number;
  /** Whole seconds elapsed. Changes once per second. */
  readonly elapsedSeconds: number;
  /** Fractional seconds elapsed. */
  readonly elapsedSecondsExact: number;
  /** Milliseconds of simulated time elapsed. */
  readonly elapsedMs: number;
}

/**
 * Reads simulation time from a tick source.
 *
 * Takes a getter rather than a `World` so the clock has no dependency on the
 * world's shape, and so callers outside the simulation (the devtools console)
 * can bind it to whatever exposes a tick.
 */
export function readClock(getTick: () => number): GameClock {
  const tick = getTick();
  return {
    tick,
    elapsedSeconds: ticksToWholeSeconds(tick),
    elapsedSecondsExact: ticksToSeconds(tick),
    elapsedMs: ticksToMs(tick),
  };
}

// ---------------------------------------------------------------------------
// The calendar. Phase-10a — ADR-020.
//
// Derived from `world.tick` and nothing else: no mutable state, no entry in
// `TICK_SYSTEMS`, no catch-up. Advancing the tick IS advancing the clock, for
// the same reason there is no `growthSystem` — a derivation has nothing for a
// system to do (ADR-009 §2).
//
// What falls out for free is the whole argument: no new save field, offline
// time exact because advancing past a gap is the catch-up, no accuracy contract
// because there is no approximation to bound, and determinism untouched because
// a derivation reads no clock and no generator.
// ---------------------------------------------------------------------------

/**
 * The named phases of a day, in order.
 *
 * QUANTIZED STATES, never a fraction of a day — the same move `CropStage`
 * makes, for the same reason (ADR-020 §3). A four-phase day dirties the
 * lighting layer four times per day; a continuous one would dirty it 1,728,000
 * times, and render-on-demand (ADR-001 §1) would be a memory.
 *
 * Order is the day's order, and it is load-bearing: `phaseFor` walks these
 * boundaries in sequence, and the renderer reads the index to pick a tint.
 */
export const DayPhase = {
  Dawn: 'dawn',
  Day: 'day',
  Dusk: 'dusk',
  Night: 'night',
} as const;

export type DayPhase = (typeof DayPhase)[keyof typeof DayPhase];

/** Every phase, in the order a day passes through them. */
export const DAY_PHASES: readonly DayPhase[] = [
  DayPhase.Dawn,
  DayPhase.Day,
  DayPhase.Dusk,
  DayPhase.Night,
];

/**
 * Where each phase begins, as a fraction of the day.
 *
 * Fractions rather than tick counts so the set survives a different
 * `ticksPerDay` — the phase boundaries are a shape, and the day's length is a
 * world constant (ADR-020 §2).
 *
 * INDEX 0 IS NOT READ. `phaseFor` walks backwards and falls through to the
 * first phase, so "no tick belongs to no phase" is structural rather than a
 * rule about this data — there is no value here that could open a gap. It is
 * written as 0 because that is what it means, and a mutation changing it
 * correctly fails nothing.
 */
const PHASE_STARTS: readonly number[] = [0, 0.25, 0.7, 0.8];

/** The day a tick falls in, counting from zero. */
export function dayFor(tick: number, ticksPerDay: number): number {
  return Math.floor(tick / ticksPerDay);
}

/** Ticks elapsed within the current day. */
export function timeOfDayFor(tick: number, ticksPerDay: number): number {
  return ((tick % ticksPerDay) + ticksPerDay) % ticksPerDay;
}

/**
 * The phase a tick falls in.
 *
 * Walks the boundaries from the last backwards, so every instant belongs to
 * exactly one phase and the final phase runs to the end of the day. A tick can
 * never fall between two phases, which is what makes the "covers every phase
 * exactly once per day, in order, with no gap" acceptance provable rather than
 * asserted.
 */
export function phaseFor(tick: number, ticksPerDay: number): DayPhase {
  const fraction = timeOfDayFor(tick, ticksPerDay) / ticksPerDay;

  for (let index = PHASE_STARTS.length - 1; index > 0; index -= 1) {
    if (fraction >= (PHASE_STARTS[index] ?? 0)) return DAY_PHASES[index] ?? DayPhase.Dawn;
  }

  return DAY_PHASES[0] ?? DayPhase.Dawn;
}

/** The tick a phase begins on, within a day. Used to test boundaries exactly. */
export function phaseStartTick(phase: DayPhase, ticksPerDay: number): number {
  const index = DAY_PHASES.indexOf(phase);
  return Math.floor((PHASE_STARTS[index] ?? 0) * ticksPerDay);
}

/**
 * The season a day falls in, as an index into the world's ordered season list.
 *
 * The engine owns the CYCLE; the names are content (ADR-021 §1, §Alternatives
 * D), which is why this takes a count rather than a season table. A content
 * source shipping a two-season world changes nothing here.
 *
 * Returns 0 for a degenerate list rather than dividing by zero. A world with no
 * seasons is not reachable through the public API — `core` registers four and
 * cannot be disabled — but a total function is cheaper than a proof.
 */
export function seasonIndexFor(day: number, daysPerSeason: number, seasonCount: number): number {
  if (seasonCount <= 0 || daysPerSeason <= 0) return 0;

  const elapsed = Math.floor(day / daysPerSeason);
  // Wraps, so the cycle repeats forever without a year counter to store.
  return ((elapsed % seasonCount) + seasonCount) % seasonCount;
}

/**
 * The season a day falls in, or `undefined` if the world has no seasons.
 *
 * `undefined` rather than a fallback name: a missing season means no content
 * supplied one, and inventing "spring" would put a season in a world that
 * declared none — the same reasoning as `tintFor`.
 */
export function seasonFor(
  day: number,
  daysPerSeason: number,
  seasons: readonly string[],
): string | undefined {
  return seasons[seasonIndexFor(day, daysPerSeason, seasons.length)];
}

/**
 * Every season a day range touches, as indices. Phase-11b — ADR-021 §5.
 *
 * Offline catch-up needs to know whether a crop was plantable for the WHOLE of
 * a gap, not merely at one end of it. A gap of arbitrary length can touch at
 * most one full year, so the result is bounded by the season count no matter
 * how long the player was away.
 *
 * Inclusive of both ends: a gap that begins on the last day of autumn and ends
 * on the first day of winter touched both.
 */
/**
 * Every day phase a tick range touches, in `DAY_PHASES` order.
 *
 * The phase counterpart to `seasonsBetween`, and it exists for the same
 * reason: a span is not an instant. Catch-up covers up to eight hours, so
 * asking which phase it is — singular — and applying that answer to the whole
 * window credits a shift that ended hours ago (ADR-024 §4).
 *
 * Ordered rather than set-ordered because a caller may fold over it and the
 * simulation must not depend on insertion order (the 100k-tick determinism
 * acceptance is exactly where that would surface).
 *
 * A world with no clock answers with every phase, which is the conservative
 * direction: a caller requiring permission throughout then requires it
 * unconditionally, and nothing divides by zero.
 */
export function phasesBetween(
  startTick: number,
  endTick: number,
  ticksPerDay: number,
): readonly DayPhase[] {
  if (ticksPerDay <= 0) return DAY_PHASES;

  const from = Math.min(startTick, endTick);
  const to = Math.max(startTick, endTick);

  // A window of a whole day touches everything; short-circuit so the loop
  // below can never run longer than two days however long the gap was.
  if (to - from >= ticksPerDay) return DAY_PHASES;

  const touched = new Set<DayPhase>([phaseFor(from, ticksPerDay), phaseFor(to, ticksPerDay)]);

  const firstDay = Math.floor(from / ticksPerDay);
  const lastDay = Math.floor(to / ticksPerDay);
  for (let day = firstDay; day <= lastDay; day += 1) {
    for (const fraction of PHASE_STARTS) {
      const boundary = day * ticksPerDay + Math.ceil(fraction * ticksPerDay);
      if (boundary > from && boundary <= to) touched.add(phaseFor(boundary, ticksPerDay));
    }
  }

  return DAY_PHASES.filter((phase) => touched.has(phase));
}

export function seasonsBetween(
  startDay: number,
  endDay: number,
  daysPerSeason: number,
  seasonCount: number,
): readonly number[] {
  if (seasonCount <= 0 || daysPerSeason <= 0) return [];

  const firstBlock = Math.floor(Math.min(startDay, endDay) / daysPerSeason);
  const lastBlock = Math.floor(Math.max(startDay, endDay) / daysPerSeason);

  // A range spanning a whole year touches everything; short-circuit so the
  // loop below can never run longer than one year however long the gap was.
  if (lastBlock - firstBlock + 1 >= seasonCount) {
    return Array.from({ length: seasonCount }, (_, index) => index);
  }

  const touched = new Set<number>();
  for (let block = firstBlock; block <= lastBlock; block += 1) {
    touched.add(((block % seasonCount) + seasonCount) % seasonCount);
  }
  return [...touched].sort((a, b) => a - b);
}
