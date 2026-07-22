/**
 * Translates DOM events into player intent. Phase-03.6.
 *
 * The thinnest possible layer: it converts pointer and key events into calls on
 * `PlayerInput` and converts presentation state into a highlight. It holds no
 * rules and no game state.
 *
 * CLICK DETECTION IS SEPARATE FROM PANNING. `WorldView.attachInput` already
 * listens on the same element for drag-to-pan; these listeners are
 * complementary rather than competing — panning acts on movement, a click acts
 * on its absence. Keeping them apart means the render layer stays responsible
 * for the camera and this layer stays responsible for intent, instead of
 * threading intent callbacks through the renderer.
 *
 * A rejection box persists until the next action rather than fading on a timer.
 * That avoids a timer lifecycle to leak on teardown, and the proper transient
 * inline message arrives with the HUD in phase-05 (`GAME_DESIGN.md` §10.1).
 */

import { toIndex } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';
import type { HighlightState } from '../render/highlight';
import type { WorldView } from '../render/world-view';

import { Tool, toolForKey, type InteractionState, type PlayerInput } from './player-input';

/**
 * Movement in CSS pixels beyond which a press is a drag, not a click.
 *
 * Without slop, the pointer jitter in a real click cancels the action on a
 * trackpad.
 */
const CLICK_SLOP_PX = 4;

/** Highlight colour per tool. No red — it is reserved (`GAME_DESIGN.md` §10.1). */
const TOOL_TINT: Readonly<Record<Tool, number>> = {
  [Tool.Hoe]: 0xd9a066,
  [Tool.Seed]: 0x8fd694,
  [Tool.Hand]: 0xf5e6a8,
};

/** Tint used when no tool is held, so hover still reads as "nothing will happen". */
const IDLE_TINT = 0xbfbfbf;

/** Projects interaction state onto what the renderer draws. */
export function toHighlight(state: InteractionState): HighlightState {
  return {
    hovered: state.hovered,
    selected: state.selected,
    rejected: state.rejected,
    tint: state.tool === null ? IDLE_TINT : TOOL_TINT[state.tool],
  };
}

export interface PointerActionsOptions {
  readonly target: HTMLElement;
  readonly input: PlayerInput;
  /** The live view, or null while the overlay is collapsed and torn down. */
  readonly view: () => WorldView | null;
  /**
   * Selects a worker on a clicked tile. Returns true if one was selected, in
   * which case the click does NOT act on the tile — selecting a worker and
   * tilling under it are different intents.
   */
  readonly selectWorkerAt?: (tile: TileIndex) => boolean;
  /** Clears the worker selection. Bound to `Esc` alongside deselecting the tool. */
  readonly clearSelection?: () => void;
  /**
   * Building placement, when a building is armed. While active, hover drives
   * the build ghost instead of the tool highlight, a click places instead of
   * acting on the tile, and `Esc` cancels. Absent until phase-05d.
   */
  readonly placement?: {
    active(): boolean;
    hover(tile: TileIndex | null): void;
    place(tile: TileIndex): void;
    cancel(): void;
  };
}

/** Attaches click, hover, and tool-key handling. Returns teardown. */
export function attachPointerActions(options: PointerActionsOptions): () => void {
  let pressed = false;
  let dragged = false;
  let downX = 0;
  let downY = 0;

  /** Screen point to tile index, or null when outside the world or collapsed. */
  const tileUnder = (clientX: number, clientY: number) => {
    const position = options.view()?.tileAt(clientX, clientY) ?? null;
    if (position === null) return null;

    const index = toIndex(position.x, position.y);
    return index.ok ? index.value : null;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    // A press that starts over interactive UI (the HUD) is not a tile action;
    // arming it would fire a tool command on the tile behind the control.
    if (event.target instanceof Element && event.target.closest('[data-interactive]') !== null) {
      return;
    }
    pressed = true;
    dragged = false;
    downX = event.clientX;
    downY = event.clientY;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (pressed && !dragged) {
      const far =
        Math.abs(event.clientX - downX) > CLICK_SLOP_PX ||
        Math.abs(event.clientY - downY) > CLICK_SLOP_PX;
      if (far) dragged = true;
    }

    const tile = tileUnder(event.clientX, event.clientY);
    if (options.placement?.active() === true) {
      // While placing, the pointer drives the ghost; the tool highlight is
      // cleared so the two do not stack on one tile.
      options.placement.hover(tile);
      options.input.hover(null);
    } else {
      options.input.hover(tile);
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;

    const wasClick = pressed && !dragged;
    pressed = false;
    if (!wasClick) return;

    const tile = tileUnder(event.clientX, event.clientY);
    // Outside the world is not an action, and not an error.
    if (tile === null) return;

    // While placing, a click commits the building and nothing else — not a
    // tool action, not a worker selection.
    if (options.placement?.active() === true) {
      options.placement.place(tile);
      return;
    }

    // A worker under the click is selected instead of acting on the tile.
    if (options.selectWorkerAt?.(tile) === true) return;

    options.input.click(tile);
  };

  const onPointerCancel = (): void => {
    pressed = false;
  };

  const onPointerLeave = (): void => {
    options.input.hover(null);
    // Hide the ghost when the pointer leaves the world entirely.
    options.placement?.hover(null);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      options.placement?.cancel();
      options.input.selectTool(null);
      options.clearSelection?.();
      return;
    }

    const tool = toolForKey(event.key);
    if (tool !== null) options.input.selectTool(tool);
  };

  options.target.addEventListener('pointerdown', onPointerDown);
  options.target.addEventListener('pointermove', onPointerMove);
  options.target.addEventListener('pointerup', onPointerUp);
  options.target.addEventListener('pointercancel', onPointerCancel);
  options.target.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    options.target.removeEventListener('pointerdown', onPointerDown);
    options.target.removeEventListener('pointermove', onPointerMove);
    options.target.removeEventListener('pointerup', onPointerUp);
    options.target.removeEventListener('pointercancel', onPointerCancel);
    options.target.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('keydown', onKeyDown);
  };
}
