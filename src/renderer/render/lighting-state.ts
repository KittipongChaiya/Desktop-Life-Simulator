/**
 * The tint transition, with no Pixi in it. Phase-10c — ADR-020 §3, ADR-017 §1.
 *
 * Split from `lighting-view.ts` for the reason `crop-anim.ts` is split from
 * `crop-view.ts`: the part that can be wrong is the arithmetic and the
 * lifetime, and neither needs a GPU to test. What is left in the view is
 * "make a rectangle this colour", which a screenshot test can see and a unit
 * test cannot meaningfully assert.
 *
 * **`running` is the whole contract.** It is what the view hands to its
 * animation lease, so a transition that never reports `false` is a permanent
 * frame cost and the end of render-on-demand (ADR-001 §1). Every test in this
 * module's suite that matters is really about when `running` goes false.
 */

/** A flat colour wash. `alpha` of zero paints nothing at all. */
export interface Tint {
  /** Packed `0xRRGGBB`. */
  readonly color: number;
  /** Coverage, 0–1. */
  readonly alpha: number;
}

/** The absence of a tint — what an unlit world looks like. */
export const CLEAR: Tint = { color: 0xffffff, alpha: 0 };

const channel = (color: number, shift: number): number => (color >> shift) & 0xff;

/** True when two tints would paint identically. */
export function tintsEqual(a: Tint, b: Tint): boolean {
  return a.color === b.color && a.alpha === b.alpha;
}

/**
 * Straight per-channel interpolation.
 *
 * Not perceptually uniform, and deliberately not: a wash between two nearby
 * washes has nowhere interesting to go, and a colour-space conversion per frame
 * would cost more than the effect is worth.
 */
export function lerpTint(from: Tint, to: Tint, t: number): Tint {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const mix = (shift: number): number => {
    const start = channel(from.color, shift);
    return Math.round(start + (channel(to.color, shift) - start) * clamped);
  };

  return {
    color: (mix(16) << 16) | (mix(8) << 8) | mix(0),
    alpha: from.alpha + (to.alpha - from.alpha) * clamped,
  };
}

export interface TintSample {
  /** What to paint now. */
  readonly tint: Tint;
  /** Whether another frame is needed — drives the animation lease. */
  readonly running: boolean;
}

export interface TintTransition {
  /**
   * Aims at a new tint.
   *
   * `snap` jumps straight to it: used for the first tint of a session, and
   * whenever motion is switched off. A reduced-motion setting must mean no
   * fade, not a slow one.
   */
  to(next: Tint, snap: boolean): void;
  /** The tint at this instant, and whether the transition is still live. */
  sample(nowMs: number): TintSample;
}

/**
 * A finite transition between tints.
 *
 * The clock starts on the first `sample` after a `to`, not on the `to` itself:
 * `to` is called from a simulation-driven update, and the gap to the next frame
 * is arbitrary. Starting the clock at the update would let a transition arrive
 * already half-finished, or finish before a frame ever drew it.
 */
export function createTintTransition(durationMs: number): TintTransition {
  let from: Tint = CLEAR;
  let to: Tint = CLEAR;
  let startedAt: number | null = null;
  /** The last tint actually handed out — where a re-aim starts from. */
  let last: Tint = CLEAR;

  return {
    to(next, snap) {
      if (snap) {
        from = next;
        to = next;
        last = next;
        startedAt = null;
        return;
      }

      // Re-aims from the last tint HANDED OUT, not from the previous target:
      // a phase change landing mid-fade must continue from what is on screen,
      // or the light jumps backwards before moving forwards.
      from = last;
      to = next;
      startedAt = null;
    },

    sample(nowMs) {
      if (tintsEqual(from, to)) {
        last = to;
        return { tint: to, running: false };
      }

      startedAt ??= nowMs;
      const t = (nowMs - startedAt) / durationMs;

      if (t >= 1) {
        from = to;
        last = to;
        startedAt = null;
        return { tint: to, running: false };
      }

      last = lerpTint(from, to, t);
      return { tint: last, running: true };
    },
  };
}
