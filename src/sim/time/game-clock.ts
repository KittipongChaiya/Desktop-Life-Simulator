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
