/**
 * Render-debug toggles. Phase-07.8i.
 *
 * A mutable flag the render layer READS and the tooling WRITES, held here so it
 * survives the scene being destroyed and rebuilt — collapsed mode does exactly
 * that on every toggle (ADR-003 §4), and an overlay that silently switched
 * itself off when the window collapsed would look like a broken overlay.
 *
 * It is a plain holder, not a store: the panel that sets it also renders the
 * only thing that reflects it, so nothing needs to be notified. The world view
 * reads it once per frame through a closure, which is the same shape as
 * `selectedWorkerId` and the ADR-017 motion readers already use.
 */

export interface RenderDebug {
  /**
   * Whether ALL in-world debug drawing is suppressed for a screenshot (07.8l).
   *
   * Suppression sits in front of every reader below rather than beside them,
   * so screenshot mode HIDES rather than FORGETS: the overlays keep whatever
   * state they had, and leaving the mode restores exactly what was on. A
   * screenshot mode that switched things off would be a "close everything"
   * button wearing the wrong name.
   */
  screenshot(): boolean;
  setScreenshot(active: boolean): void;
  /** Whether the chunk overlay draws (07.8i). */
  chunks(): boolean;
  setChunks(enabled: boolean): void;
  /** Whether worker routes draw (07.8j). */
  routes(): boolean;
  /** Whether the enter-cost heatmap draws (07.8j). */
  heatmap(): boolean;
  /**
   * Advances pathfinding debug: off → routes → routes and heatmap → off.
   *
   * A cycle rather than two keys, because the function keys are nearly spent
   * and because the heatmap is the expensive half — reaching it should take a
   * deliberate second press rather than being one keystroke from idle.
   */
  cyclePathfinding(): void;
}

export function createRenderDebug(): RenderDebug {
  let chunks = false;
  /** 0 off, 1 routes, 2 routes and heatmap. */
  let pathfinding = 0;
  let screenshot = false;

  return {
    screenshot: () => screenshot,
    setScreenshot(active) {
      screenshot = active;
    },

    chunks: () => !screenshot && chunks,
    setChunks(enabled) {
      chunks = enabled;
    },

    routes: () => !screenshot && pathfinding > 0,
    heatmap: () => !screenshot && pathfinding > 1,
    cyclePathfinding() {
      pathfinding = (pathfinding + 1) % 3;
    },
  };
}
