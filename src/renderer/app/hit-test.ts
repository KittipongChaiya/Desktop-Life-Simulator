/**
 * Which mouse events the overlay keeps. Phase-07.5g.
 *
 * THE BUG THIS FIXES. Hit-testing previously asked one question — "is the
 * pointer over a `[data-interactive]` element?" — and passed the mouse through
 * whenever the answer was no. The world is not such an element, so the first
 * pointer movement over the farm made the window click-through, and every
 * subsequent click on a tile went to the desktop instead of the game. Tilling,
 * planting, and harvesting by clicking were impossible in the shipped app.
 *
 * Neither test layer could see it. Unit tests assert the handler's inputs;
 * Playwright synthesises events inside the renderer, where OS-level mouse
 * ignoring does not exist. It is only reproducible with a real mouse, which is
 * how it reached a player.
 *
 * THE RULE, stated once here rather than inferred from a DOM query:
 *
 * | State                          | Mouse |
 * | ------------------------------ | ----- |
 * | Over an interactive element    | KEPT  |
 * | Expanded, not in work mode     | KEPT  — the world is playable, and `GAME_DESIGN.md` §10.1 rule 3 requires planting to be one click away |
 * | Collapsed                      | passed through, except over the status bar |
 * | Work mode                      | passed through — the mode exists to stop the overlay interfering |
 *
 * The player keeps four ways to reach the desktop underneath an expanded
 * overlay, all of them deliberate: collapse (Space), quick hide (`F10`),
 * click-through mode (`Ctrl+Shift+C`), and work mode (`F11`). What they no
 * longer have is an overlay that silently swallows every click on its own
 * world — which was not a companion feature, it was a defect.
 */

export interface HitTestState {
  /** The pointer is over an element carrying `data-interactive`. */
  readonly overInteractiveElement: boolean;
  /** The overlay is collapsed to the status bar (ADR-001 §2). */
  readonly collapsed: boolean;
  /** Work mode is active (ADR-014). */
  readonly workMode: boolean;
}

/**
 * True when the overlay should KEEP the mouse rather than pass it through.
 *
 * Pure, so the rule above is a table of test cases rather than a claim about
 * behaviour nobody can reproduce without a mouse.
 */
export function shouldCaptureMouse(state: HitTestState): boolean {
  // A real control always wins, in every presence mode. In work mode nothing
  // is interactive anyway — the HUD is unmounted — so this cannot re-open a
  // surface the mode is meant to hide.
  if (state.overInteractiveElement) return true;

  // Work mode: the world is visible but explicitly not in the way.
  if (state.workMode) return false;

  // Collapsed: a status bar, not a game board. Everything outside the bar
  // itself belongs to whatever is behind the overlay.
  if (state.collapsed) return false;

  // Expanded: the world is the interface.
  return true;
}
