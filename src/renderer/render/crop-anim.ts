/**
 * Crop animation curves — the maths, with no Pixi in it. Phase-07.7d.
 *
 * Three moments in a crop's life get motion, and only three. Each is FINITE
 * and each is triggered by something that already happened, so a farm at rest
 * holds no animation lease and draws no frames (ADR-017 §1).
 *
 * | Moment  | Trigger                        | Reads as        |
 * | ------- | ------------------------------ | --------------- |
 * | Spawn   | a crop appears in the slice    | pressed in      |
 * | Pulse   | its stage sprite changed       | it grew         |
 * | Depart  | it leaves the slice            | taken           |
 *
 * `Depart` is the awkward one and the reason this module exists separately: a
 * harvested crop is gone from the snapshot the instant it is harvested, so the
 * sprite has to OUTLIVE its own data to animate out at all. The view keeps it
 * for exactly `CROP_ANIM_MS.depart` and then destroys it. Everything about
 * when that ends is here, where it can be tested, rather than in the view
 * where a mistake becomes a leaked sprite.
 */

export const CropAnim = {
  /** A crop was planted: it presses in from small, with a slight overshoot. */
  Spawn: 'spawn',
  /** A growth stage was reached: one swell, back to rest. */
  Pulse: 'pulse',
  /** Harvested: it lifts and fades as it goes. */
  Depart: 'depart',
} as const;

export type CropAnim = (typeof CropAnim)[keyof typeof CropAnim];

/**
 * How long each runs, in real milliseconds.
 *
 * All short. These are acknowledgements the player catches while doing
 * something else (`GAME_DESIGN.md` §10.1 rule 4), not animations to be watched
 * — and `depart` in particular delays nothing, because the simulation has
 * already moved on.
 */
export const CROP_ANIM_MS: Readonly<Record<CropAnim, number>> = {
  [CropAnim.Spawn]: 280,
  [CropAnim.Pulse]: 240,
  [CropAnim.Depart]: 300,
};

/** How far past resting size the spawn overshoots, and the pulse swells. */
const SPAWN_OVERSHOOT = 1.12;
const PULSE_SWELL = 1.18;
/** How far a departing crop lifts, as a fraction of a tile. */
export const DEPART_LIFT = 0.35;

/** Smooth start and stop. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Fast start, settling — the shape of something arriving under its own weight. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Clamps a raw progress into [0, 1]; a frame can land late. */
export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 1;
  return Math.min(1, Math.max(0, progress));
}

/**
 * Scale multiplier at a point in an animation. 1 is resting size.
 *
 * Every curve BEGINS AND ENDS AT 1 except spawn, which begins small — so a
 * sprite whose animation is cancelled mid-way, or whose frame lands late, is
 * left at its resting size rather than frozen mid-swell.
 */
export function animScale(kind: CropAnim, progress: number): number {
  const t = clampProgress(progress);

  if (kind === CropAnim.Spawn) {
    // Up past resting, then settle back onto it.
    const eased = easeOut(t);
    const overshoot = Math.sin(t * Math.PI) * (SPAWN_OVERSHOOT - 1);
    return 0.4 + eased * 0.6 + overshoot;
  }

  if (kind === CropAnim.Pulse) {
    // One half-sine: out and back, ending exactly where it started.
    return 1 + Math.sin(t * Math.PI) * (PULSE_SWELL - 1);
  }

  // Depart: swells slightly as it lifts away.
  return 1 + easeInOut(t) * 0.25;
}

/** Opacity at a point in an animation. Only `depart` fades. */
export function animAlpha(kind: CropAnim, progress: number): number {
  if (kind !== CropAnim.Depart) return 1;
  // Holds briefly, then goes — a crop that starts fading immediately reads as
  // a rendering glitch rather than as being picked.
  const t = clampProgress(progress);
  return t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
}

/** Vertical offset in tile-fractions. Only `depart` moves. */
export function animLift(kind: CropAnim, progress: number): number {
  if (kind !== CropAnim.Depart) return 0;
  return easeOut(clampProgress(progress)) * DEPART_LIFT;
}

/** True once an animation started at `startedAt` has finished. */
export function isFinished(kind: CropAnim, startedAt: number, nowMs: number): boolean {
  return nowMs - startedAt >= CROP_ANIM_MS[kind];
}

/** Progress through an animation started at `startedAt`, clamped to [0, 1]. */
export function progressOf(kind: CropAnim, startedAt: number, nowMs: number): number {
  return clampProgress((nowMs - startedAt) / CROP_ANIM_MS[kind]);
}
