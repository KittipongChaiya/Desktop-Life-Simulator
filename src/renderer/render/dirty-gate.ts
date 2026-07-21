/**
 * Render-on-demand gate. ADR-001 §1 — the constraint PixiJS was accepted under.
 *
 *     render this frame  ⟺  sceneDirty OR animatingEntityCount > 0
 *
 * The overlay is visible for eight hours and CHANGING for maybe ten minutes of
 * that (PERFORMANCE.md §3). Drawing every frame regardless would be a permanent
 * CPU cost for zero visual benefit — precisely what makes a desktop widget
 * unwelcome, and what VISION.md §2.1 forbids.
 *
 * Built BEFORE the first sprite, deliberately. ADR-001 §Consequences: retrofit
 * it and it decays, because by then every draw path assumes it can just draw.
 *
 * `animatingEntityCount` is the fragile half. Every increment MUST have a
 * matching release — an effect that starts animating and never stops is a
 * permanent frame cost that looks exactly like normal operation. `release()`
 * is idempotent and refuses to go negative so a double-release cannot silently
 * mask a missing one elsewhere.
 */

export interface DirtyGate {
  /** Marks the scene as needing one redraw. */
  markDirty(): void;
  /**
   * Registers a continuously-animating source. Returns its release function.
   * Calling the result twice is a no-op, not a double-decrement.
   */
  acquireAnimation(): () => void;
  /** True when a frame must be drawn. */
  shouldRender(): boolean;
  /** Clears the dirty flag. Called immediately after a draw. */
  clearDirty(): void;
  /** Number of live animation holders. Surfaced as a devtools metric. */
  animationCount(): number;
  /** True if a redraw is pending. Diagnostics only. */
  isDirty(): boolean;
}

export function createDirtyGate(): DirtyGate {
  let dirty = true; // first frame must draw
  let animations = 0;

  return {
    markDirty() {
      dirty = true;
    },

    acquireAnimation() {
      animations += 1;
      let released = false;

      return () => {
        if (released) return;
        released = true;
        animations -= 1;
        // A release always changes what is on screen: the final frame of the
        // animation still needs drawing.
        dirty = true;
      };
    },

    shouldRender: () => dirty || animations > 0,
    clearDirty() {
      dirty = false;
    },
    animationCount: () => animations,
    isDirty: () => dirty,
  };
}
