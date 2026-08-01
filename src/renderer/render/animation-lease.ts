/**
 * The animation lease, as a binding rather than a habit. Phase-07.7b, ADR-017 §1.
 *
 * `DirtyGate.acquireAnimation()` is the mechanism that lets something animate
 * without breaking render-on-demand, and `dirty-gate.ts` names its own risk:
 * "the fragile half. Every increment MUST have a matching release — an effect
 * that starts animating and never stops is a permanent frame cost that looks
 * exactly like normal operation."
 *
 * Before this module, two call sites carried that bookkeeping by hand —
 * `effects.ts` and `camera-focus.ts`, each with its own `releaseAnimation ??=`
 * and its own place to forget the release. Phase-07.7 adds particles, floating
 * numbers, camera shake, worker fidgets, and ambient motion: five more chances
 * to get it wrong, in code whose failure mode is invisible.
 *
 * So the pattern becomes one object with one rule: **tell it whether anything
 * is alive, every frame, and it holds exactly the right number of leases.**
 * Transitions are its problem, not the caller's.
 */

import type { DirtyGate } from './dirty-gate';

export interface AnimationLease {
  /**
   * Reports whether this source currently has anything to animate.
   *
   * Safe to call every frame with the same value — it acquires only on the
   * transition into alive and releases only on the transition out.
   */
  sync(alive: boolean): void;
  /**
   * Drops any held lease. Idempotent.
   *
   * For teardown: collapsed mode destroys the renderer on every toggle
   * (ADR-001 §2), and a lease that outlived its view would be a permanent cost
   * on the next scene.
   */
  release(): void;
}

export function bindAnimationLease(gate: DirtyGate): AnimationLease {
  let release: (() => void) | null = null;

  const drop = (): void => {
    release?.();
    release = null;
  };

  return {
    sync(alive) {
      if (alive) {
        // `??=` rather than a plain assignment: acquiring per frame instead of
        // per transition is the exact leak this module exists to prevent.
        release ??= gate.acquireAnimation();
        return;
      }
      drop();
    },

    release: drop,
  };
}
