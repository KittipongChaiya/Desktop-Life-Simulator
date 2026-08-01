/**
 * Worker personality — the small things they do when nobody asked. Phase-07.7f.
 *
 * WHAT THE ART ALLOWS. The worker set is four idle poses, four walk cycles, and
 * one work swing. There is no stretch pose, no scratch pose, and no sitting
 * pose, so of the brief's five suggestions only two can be built honestly from
 * what exists:
 *
 * | Suggested    | Built | Why                                                  |
 * | ------------ | ----- | ---------------------------------------------------- |
 * | Look around  | yes   | the four idle facings already exist                  |
 * | Stretch      | yes   | reads as a vertical reach on any pose                |
 * | Celebrate    | yes   | a hop reads without a pose                           |
 * | Scratch head | no    | needs a pose; a jitter on the idle frame reads as a bug |
 * | Sit          | no    | needs a pose; a squashed stand reads as a squashed stand |
 *
 * The two omissions are not deferred work, they are an ART request: they cannot
 * be faked with a transform, and faking them would look like a rendering
 * defect rather than a personality.
 *
 * STATELESS BY CONSTRUCTION. A fidget is a pure function of the worker's id and
 * the tick — no timers, no stored schedule, nothing to leak or to desynchronise
 * on a reload. Time is divided into windows; within each, a worker's fidget and
 * its offset are DERIVED from the id and the window index (ADR-017 §5), so the
 * same farm fidgets identically on every launch and two workers never move in
 * lockstep.
 *
 * RECURRING, THEREFORE AMBIENT. Each fidget is short, but they keep coming for
 * as long as a worker is idle — so the caller gates them on the
 * decorative-creatures setting, exactly as it gates breathing (ADR-017 §2).
 */

import { derivedIndex, derivedUnit } from './presentation-rng';

export const Fidget = {
  /** Glances to another facing and back. Uses the idle poses that exist. */
  LookAround: 'look-around',
  /** A vertical reach — reads on any pose, so it needs none of its own. */
  Stretch: 'stretch',
} as const;

export type Fidget = (typeof Fidget)[keyof typeof Fidget];

const FIDGETS: readonly Fidget[] = [Fidget.LookAround, Fidget.LookAround, Fidget.Stretch];

/**
 * How often a worker might fidget, in ticks. 20 ticks per second, so ~12 s.
 *
 * Deliberately sparse. A worker that fidgets constantly reads as nervous
 * rather than alive, and every fidget costs frames while it runs.
 */
export const FIDGET_PERIOD_TICKS = 240;

/** How long one lasts. ~1.2 s — long enough to notice, short enough to ignore. */
export const FIDGET_DURATION_TICKS = 24;

/** A fidget in progress. */
export interface ActiveFidget {
  readonly kind: Fidget;
  /** 0 at the start, approaching 1 at the end. */
  readonly progress: number;
}

/**
 * What a worker is doing at a tick, or null when they are simply standing.
 *
 * Pure and stateless: the same id and tick always answer the same, which is
 * what lets this be called every frame with no bookkeeping anywhere.
 */
export function fidgetAt(workerId: number, tick: number): ActiveFidget | null {
  if (!Number.isFinite(tick) || tick < 0) return null;

  const window = Math.floor(tick / FIDGET_PERIOD_TICKS);
  const withinWindow = tick - window * FIDGET_PERIOD_TICKS;

  // Where in this window this worker's fidget falls. The span keeps it clear
  // of the window's end so a fidget never straddles two windows and changes
  // kind mid-motion.
  const latestStart = FIDGET_PERIOD_TICKS - FIDGET_DURATION_TICKS;
  const start = Math.floor(derivedUnit(workerId, window) * latestStart);

  if (withinWindow < start || withinWindow >= start + FIDGET_DURATION_TICKS) return null;

  const kind = FIDGETS[derivedIndex(FIDGETS.length, workerId, window + 7919)] ?? Fidget.LookAround;
  return { kind, progress: (withinWindow - start) / FIDGET_DURATION_TICKS };
}

/**
 * Vertical offset in pixels for a stretch, at a point in its progress.
 *
 * One smooth rise and fall, ending exactly where it started — a fidget that
 * left the sprite a pixel high would accumulate into a worker slowly rising
 * off the ground.
 */
export function stretchLift(progress: number, amplitude = 2): number {
  const t = Math.min(1, Math.max(0, progress));
  return Math.sin(t * Math.PI) * amplitude;
}

/**
 * How far through a look-around the worker is turned away.
 *
 * Turns for the middle half and faces front either side, so the glance has a
 * hold in it rather than sweeping continuously.
 */
export function isGlancing(progress: number): boolean {
  return progress > 0.25 && progress < 0.75;
}

/**
 * A celebratory hop's vertical offset, in pixels.
 *
 * Finite and event-driven — it fires when a worker finishes a task, not on a
 * schedule — so unlike the fidgets above it costs nothing at rest and is not
 * gated on the decorative-creatures setting.
 */
export function hopLift(progress: number, amplitude = 4): number {
  const t = Math.min(1, Math.max(0, progress));
  // Two quick bounces, the second smaller: one reads as a glitch, three as a dance.
  const decay = 1 - t;
  return Math.abs(Math.sin(t * Math.PI * 2)) * amplitude * decay;
}

/** How long the celebratory hop runs, in real milliseconds. */
export const HOP_DURATION_MS = 420;
