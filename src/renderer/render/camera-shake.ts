/**
 * Camera shake — the curve, with no Pixi in it. Phase-07.7g, ADR-017 §1.
 *
 * The brief asks for shake on a large harvest and on a building placement, with
 * duration, strength, and frequency configurable, and disabled by default.
 *
 * THE DEFAULT MATTERS MORE HERE THAN ANYWHERE ELSE IN THIS PHASE. Every other
 * effect happens inside the overlay's own bounds; a shake moves the whole
 * world under a window that sits at the bottom of someone's screen while they
 * work. `VISION.md` §2.1 makes not intruding the product's one hard constraint,
 * so this ships off, and the values below are deliberately small enough that a
 * player who turns it on is not punished for it.
 *
 * IT MUST RETURN EXACTLY TO ZERO. A shake that ends a fraction of a pixel off
 * leaves the camera permanently displaced, and every subsequent shake displaces
 * it further — a drift with no single frame to blame. The decay is therefore
 * multiplied by a term that reaches 0 at the end rather than merely approaching
 * it, and the tests assert the endpoint rather than trusting the maths.
 *
 * Offsets are DERIVED from the trigger, not rolled (ADR-017 §5): the same event
 * shakes the same way on a replay, and no simulation state is consumed.
 */

import { mix } from './presentation-rng';

/** What a shake looks like. Every field is a knob the brief asks to expose. */
export interface ShakeConfig {
  /** How long it runs, in real milliseconds. */
  readonly durationMs: number;
  /** Peak displacement in world pixels, at the very start. */
  readonly strengthPx: number;
  /** Oscillations per second. Higher reads as a rattle, lower as a sway. */
  readonly frequencyHz: number;
}

/**
 * The shipped values.
 *
 * Short, small, and quick: a 260 ms rattle of three pixels is felt rather than
 * watched. Anything longer starts to read as a fault in the window.
 */
export const DEFAULT_SHAKE: ShakeConfig = {
  durationMs: 260,
  strengthPx: 3,
  frequencyHz: 24,
};

/** A stronger one, for a placement — a heavier event than a harvest. */
export const PLACEMENT_SHAKE: ShakeConfig = {
  durationMs: 320,
  strengthPx: 4,
  frequencyHz: 20,
};

export interface ShakeOffset {
  readonly x: number;
  readonly y: number;
}

const NO_SHAKE: ShakeOffset = { x: 0, y: 0 };

/**
 * Camera displacement at a point in a shake.
 *
 * `seed` distinguishes one trigger from another so two shakes in a row do not
 * trace the same path; it is any integer the caller already has — a tile index
 * serves well.
 *
 * Returns exactly `{x: 0, y: 0}` before the start and at or after the end.
 */
export function shakeOffset(
  config: ShakeConfig,
  elapsedMs: number,
  seed: number,
  strength = 1,
): ShakeOffset {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return NO_SHAKE;
  if (elapsedMs >= config.durationMs || config.durationMs <= 0) return NO_SHAKE;

  // Short-circuited rather than computed and multiplied out: at zero strength
  // there is no shake, and letting the maths run would return `-0` on the
  // negative half of the wave — arithmetically harmless, but it makes the
  // "returns exactly zero" guarantee a matter of interpretation.
  const clampedStrength = Math.min(1, Math.max(0, strength));
  if (clampedStrength === 0) return NO_SHAKE;

  const t = elapsedMs / config.durationMs;
  // Linear decay to exactly zero. Squared would be prettier and would also
  // reach zero, but a shake this short reads better with a hard stop.
  const decay = 1 - t;
  const amplitude = config.strengthPx * decay * clampedStrength;

  const radians = (elapsedMs / 1000) * config.frequencyHz * Math.PI * 2;
  // A quarter-turn of phase between the axes, plus a derived per-seed offset,
  // so the motion is a rattle rather than a diagonal line.
  const phase = (mix(seed, 0) / 0x1_0000_0000) * Math.PI * 2;

  return {
    x: Math.sin(radians + phase) * amplitude,
    y: Math.cos(radians * 1.3 + phase) * amplitude * 0.6,
  };
}

/** True once a shake started at `startedAt` has finished. */
export function isShakeFinished(config: ShakeConfig, startedAt: number, nowMs: number): boolean {
  return nowMs - startedAt >= config.durationMs;
}

/**
 * How many harvests landing together count as "large".
 *
 * A single crop is the routine case and must never shake — a farm that jolts
 * every few seconds is unusable as a companion. This is the count that has to
 * arrive within `HARVEST_BURST_MS` before the camera reacts, which in practice
 * means a mature farm ripening together or an offline catch-up landing.
 */
export const LARGE_HARVEST_COUNT = 4;

/** The window harvests are counted over, in real milliseconds. */
export const HARVEST_BURST_MS = 700;
