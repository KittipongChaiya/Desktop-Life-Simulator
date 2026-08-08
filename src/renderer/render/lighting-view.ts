/**
 * The day/night tint. Phase-10c — ADR-020 §3, §4; ADR-001 layer 5.
 *
 * Layer 5 was reserved by ADR-001 in phase-02 and left empty on purpose ever
 * since. This claims it, and the claim is the cheap part — what matters is that
 * it does so without costing a frame at idle.
 *
 * ## Why a step, not a gradient
 *
 * The obvious lighting model interpolates continuously toward sunset, and it is
 * the one thing this renderer cannot afford: a tint always slightly different
 * from last frame requests frames forever, on a window `VISION.md` §2.1 says
 * sits at the bottom of the player's screen for eight hours. ADR-020 §3 answers
 * it by publishing four quantized phases, so the tint has four values a day and
 * animates only between them.
 *
 * **Every transition is finite** (ADR-017 §1). It runs for
 * `PHASE_TRANSITION_MS`, holds one animation lease for exactly that long, and
 * releases it — so the steady state between phase changes is zero frames by
 * construction rather than by care. The lease is bound through
 * `bindAnimationLease` rather than tracked by hand, for the reason that module
 * exists: a lease acquired and never released looks exactly like normal
 * operation.
 *
 * ## The colours are content, not constants
 *
 * `plugins/core` registers them through the public plugin API, so restyling the
 * day is a data edit (ADR-020 §4). A phase with no registered tint paints
 * nothing rather than a guessed default.
 *
 * The arithmetic and the transition's lifetime live in `lighting-state.ts`,
 * where they can be tested without a GPU. What is left here is the binding.
 */

import { Graphics, type Container } from 'pixi.js';

import { tintFor, type PhaseTintRegistry } from '../../sim/content/lighting';
import type { TimeView } from '../../sim/snapshot/time-slice';

import { bindAnimationLease, type AnimationLease } from './animation-lease';
import type { DirtyGate } from './dirty-gate';
import { CLEAR, createTintTransition, tintsEqual, type Tint } from './lighting-state';

/**
 * How long a phase change takes to paint.
 *
 * Long enough to read as a change of light rather than a flicker, short enough
 * that the lease is gone before a player looks up. Four of these a day is this
 * layer's entire animation budget.
 */
export const PHASE_TRANSITION_MS = 900;

export interface LightingRendererOptions {
  readonly layer: Container;
  readonly registry: PhaseTintRegistry;
  readonly gate: DirtyGate;
  /** Viewport size in CSS pixels; the overlay covers all of it. */
  readonly width: number;
  readonly height: number;
  /**
   * Motion scale, 0–1. At zero the tint snaps instead of transitioning —
   * reduced motion must mean no fade, not a slower one.
   */
  readonly intensity?: (() => number) | undefined;
}

export interface LightingRenderer {
  /** Reconciles against the `time` slice. Change-gated; cheap every frame. */
  update(time: TimeView): void;
  /** Advances a running transition. Holds a lease only while one is running. */
  animate(nowMs: number): void;
  /** Resizes the overlay to a new viewport. */
  resize(width: number, height: number): void;
  destroy(): void;
}

export function createLightingRenderer(options: LightingRendererOptions): LightingRenderer {
  const overlay = new Graphics();
  // The tint must never intercept a click. It covers the entire world, so
  // leaving it interactive would put every tile out of reach — a bug that looks
  // like the game ignoring the player.
  overlay.eventMode = 'none';
  overlay.interactiveChildren = false;
  options.layer.addChild(overlay);

  const lease: AnimationLease = bindAnimationLease(options.gate);
  const transition = createTintTransition(PHASE_TRANSITION_MS);

  let width = options.width;
  let height = options.height;
  let painted: Tint = CLEAR;
  let phase: string | null = null;

  const paint = (tint: Tint): void => {
    painted = tint;
    overlay.clear();
    if (tint.alpha <= 0) return;
    overlay.rect(0, 0, width, height).fill({ color: tint.color, alpha: tint.alpha });
  };

  return {
    update(time) {
      if (time.phase === phase) return; // change-gated: the usual case

      // A world resuming at night must BE dark, not fade to dark while the
      // player watches. Only the first tint of a session snaps.
      const snap = phase === null || (options.intensity?.() ?? 1) <= 0;
      phase = time.phase;

      const registered = tintFor(options.registry, time.phase);
      transition.to(
        registered ? { color: registered.color, alpha: registered.alpha } : CLEAR,
        snap,
      );
      options.gate.markDirty();
    },

    animate(nowMs) {
      const { tint, running } = transition.sample(nowMs);

      if (!tintsEqual(tint, painted)) {
        paint(tint);
        options.gate.markDirty();
      }

      lease.sync(running);
    },

    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      paint(painted);
      options.gate.markDirty();
    },

    destroy() {
      lease.release();
      overlay.destroy();
    },
  };
}
