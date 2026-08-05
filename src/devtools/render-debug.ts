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
  /** Whether the chunk overlay draws. */
  chunks(): boolean;
  setChunks(enabled: boolean): void;
}

export function createRenderDebug(): RenderDebug {
  let chunks = false;

  return {
    chunks: () => chunks,
    setChunks(enabled) {
      chunks = enabled;
    },
  };
}
