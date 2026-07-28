/**
 * Camera focus — the eased glide, and the rule that it never fights. Phase-07.5c.
 *
 * `fix/0.1/7.5.md` §Camera asks for smooth movement and optional focus when a
 * worker is selected or a building is placed, and then states the constraint
 * that governs all of it: **never interrupt player control.**
 *
 * Two rules come out of that, and they are what this module exists to enforce:
 *
 * 1. **A glide only happens when the target cannot already be seen.** Moving
 *    the camera to show something already on screen is pure disruption — the
 *    player was looking at it. `needsFocus` is that test.
 * 2. **Any input abandons the glide immediately**, mid-flight, with no
 *    easing-out and no queued resumption. A camera that keeps drifting after
 *    you grab it is worse than one that never moved.
 *
 * Pure maths and injected time, like the rest of `camera.ts` — the easing
 * curve and the abandonment semantics are testable without a GPU.
 */

import type { CameraLimits, CameraState } from './camera';

/**
 * Glide duration.
 *
 * Long enough to read as movement rather than a cut — a hard jump loses the
 * player's sense of where they were — and short enough that it is over before
 * it can annoy anyone. Deliberately shorter than the coin popup: the camera
 * moving is a bigger interruption than a number appearing.
 */
export const FOCUS_GLIDE_MS = 260;

/**
 * How far inside the viewport a target must sit to count as "already visible".
 *
 * A worker one pixel from the edge is technically on screen and practically
 * not, so the margin buys a tile and a half of comfort. Without it the camera
 * would refuse to move for exactly the cases that most need it.
 */
export const FOCUS_MARGIN_PX = 48;

/**
 * True when `worldX` is not comfortably inside the current view.
 *
 * Takes world pixels at zoom 1 and applies the camera's zoom itself, matching
 * how `camera.ts` treats focus points.
 */
export function needsFocus(
  worldX: number,
  camera: CameraState,
  limits: CameraLimits,
  margin: number = FOCUS_MARGIN_PX,
): boolean {
  const screenX = worldX * camera.zoom - camera.x;
  return screenX < margin || screenX > limits.viewportWidth - margin;
}

export interface CameraFocus {
  /**
   * Begins a glide from `fromX` to `toX` (both camera x, world pixels).
   * A glide already running is replaced — the newest request is the live one.
   */
  start(fromX: number, toX: number, nowMs: number): void;
  /**
   * The camera x for this frame, or null when nothing is gliding.
   *
   * The frame that reaches the end returns the target EXACTLY and then
   * finishes, so a glide can never leave the camera a fraction short of where
   * it promised to go.
   */
  sample(nowMs: number): number | null;
  /** The player took control. Abandons any glide, immediately. */
  cancel(): void;
  isGliding(): boolean;
}

/** Ease-out cubic: leaves quickly, settles gently. */
function ease(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function createCameraFocus(): CameraFocus {
  let glide: { readonly fromX: number; readonly toX: number; readonly startedAtMs: number } | null =
    null;

  return {
    start(fromX, toX, nowMs) {
      // A zero-length glide would hold an animation lease for 260 ms to move
      // nothing. Treated as already-arrived.
      if (fromX === toX) {
        glide = null;
        return;
      }
      glide = { fromX, toX, startedAtMs: nowMs };
    },

    sample(nowMs) {
      if (glide === null) return null;

      const progress = (nowMs - glide.startedAtMs) / FOCUS_GLIDE_MS;
      if (progress >= 1) {
        const { toX } = glide;
        glide = null;
        return toX;
      }

      return glide.fromX + (glide.toX - glide.fromX) * ease(Math.max(0, progress));
    },

    cancel() {
      glide = null;
    },

    isGliding: () => glide !== null,
  };
}
