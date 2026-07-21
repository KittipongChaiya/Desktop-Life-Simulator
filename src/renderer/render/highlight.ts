/**
 * Tile highlights — hover, selection, and rejection feedback. Phase-03.6.
 *
 * Drawn into the `worldUi` layer (layer 6), which ADR-001 §Layers reserves for
 * "selection highlight, hover cursor, build ghost" and ADR-005 §2 keeps out of
 * React: a box that must track the camera at 60 Hz belongs in the scene graph,
 * not in the DOM.
 *
 * Layer 6 also survives the degraded Canvas2D backend (ADR-001 §Fallback covers
 * layers 0-3 and 6), so the player can still see what they are pointing at when
 * the GPU path is unavailable.
 *
 * ONE `Graphics` OBJECT, REDRAWN. Allocating per update would churn GPU buffers
 * on every pointer move; `clear()` and re-issue costs nothing at three boxes.
 */

import { Graphics, type Container } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import { toPosition } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';

/** Outline width in world pixels. Thin enough not to hide the tile beneath. */
const STROKE_WIDTH = 2;
const HOVER_ALPHA = 0.55;
const SELECTED_ALPHA = 0.9;
const REJECTED_ALPHA = 0.9;

/**
 * Rejection tint. Amber, not red: `GAME_DESIGN.md` §10.1 rule 6 reserves red
 * for genuine errors, and clicking the wrong tile is an ordinary thing players
 * do — nothing routine is ever alarming.
 */
const REJECTED_TINT = 0xffb347;

export interface HighlightState {
  readonly hovered: TileIndex | null;
  readonly selected: TileIndex | null;
  /** Tile whose command was just rejected. Cleared by the caller on a timer. */
  readonly rejected: TileIndex | null;
  /** Colour of the hover and selection boxes. Encodes the active tool. */
  readonly tint: number;
}

export interface Highlight {
  update(state: HighlightState): void;
  destroy(): void;
}

function drawTile(graphics: Graphics, tile: TileIndex | null, tint: number, alpha: number): void {
  if (tile === null) return;

  const position = toPosition(tile);
  // An out-of-range index draws nothing rather than throwing: highlights are
  // cosmetic, and a bad index must never take down a frame.
  if (!position.ok) return;

  graphics.rect(position.value.x * TILE_SIZE, position.value.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  graphics.stroke({ width: STROKE_WIDTH, color: tint, alpha });
}

export function createHighlight(layer: Container): Highlight {
  const graphics = new Graphics();
  layer.addChild(graphics);

  return {
    update(state) {
      graphics.clear();
      // Selection first, so a hover over the selected tile reads on top.
      drawTile(graphics, state.selected, state.tint, SELECTED_ALPHA);
      drawTile(graphics, state.hovered, state.tint, HOVER_ALPHA);
      drawTile(graphics, state.rejected, REJECTED_TINT, REJECTED_ALPHA);
    },

    destroy() {
      // Pixi holds GPU resources GC will not reclaim (CODE_STYLE.md §10).
      graphics.destroy();
    },
  };
}
