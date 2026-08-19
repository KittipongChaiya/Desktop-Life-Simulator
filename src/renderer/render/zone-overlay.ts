/**
 * The zone a worker is being given, drawn over the world. Phase-48 — ADR-024 §2.
 *
 * Painting a zone is a drag over tiles, so the player needs two things on
 * screen at once: what they have painted SO FAR, and what the rectangle
 * currently under the pointer would add. Without the first, a zone built from
 * several drags is invisible between them; without the second, a drag is a
 * guess.
 *
 * Drawn into `worldUi` (layer 6) beside the hover box and the build ghost,
 * which is what ADR-001 §Layers reserves that layer for, and which keeps a
 * thing that must track the camera at 60 Hz out of the DOM (ADR-005 §2).
 *
 * ONE `Graphics`, REDRAWN, exactly like `highlight.ts`. A zone can be a
 * hundred tiles and allocating per update would churn GPU buffers on every
 * pointer move; `clear()` and re-issue costs nothing at this size.
 */

import { Graphics, type Container } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import { toPosition } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';

/**
 * Selection green (`COLOR_PALETTE.md` §6) — the colour this game already uses
 * for "this is a valid choice". A zone is exactly that, so it should not
 * introduce a new one.
 */
const ZONE_COLOR = 0x7bc062;
/** Amber, for a drag that is REMOVING tiles. Never red: §5 reserves that. */
const ERASE_COLOR = 0xe0a93e;

const PAINTED_ALPHA = 0.28;
const PREVIEW_ALPHA = 0.45;
const STROKE_WIDTH = 2;

export interface ZoneOverlayState {
  /** Tiles painted so far, or empty when the mode is not armed. */
  readonly tiles: ReadonlySet<number>;
  /** The rectangle under the pointer right now, in tile coordinates. */
  readonly preview: {
    readonly fromX: number;
    readonly fromY: number;
    readonly toX: number;
    readonly toY: number;
    readonly erasing: boolean;
  } | null;
}

export interface ZoneOverlay {
  update(state: ZoneOverlayState): void;
  destroy(): void;
}

export function createZoneOverlay(layer: Container): ZoneOverlay {
  const graphics = new Graphics();
  layer.addChild(graphics);

  return {
    update(state) {
      graphics.clear();

      // The painted set: filled, no stroke. A hundred outlined tiles reads as
      // a grid of boxes, which is the opposite of what a zone is — one region.
      for (const tile of state.tiles) {
        // Tile indices come from the painting store as plain numbers, and a
        // zone may outlive the grid it was painted on — a tile that no longer
        // resolves is skipped rather than drawn at the origin.
        const position = toPosition(tile as TileIndex);
        if (!position.ok) continue;
        graphics.rect(
          position.value.x * TILE_SIZE,
          position.value.y * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
        );
      }
      if (state.tiles.size > 0) graphics.fill({ color: ZONE_COLOR, alpha: PAINTED_ALPHA });

      const preview = state.preview;
      if (preview === null) return;

      // The live rectangle: brighter, and outlined so its edge is legible over
      // whatever it covers. Drawn from either corner, because dragging up and
      // left means the same as down and right.
      const minX = Math.min(preview.fromX, preview.toX);
      const maxX = Math.max(preview.fromX, preview.toX);
      const minY = Math.min(preview.fromY, preview.toY);
      const maxY = Math.max(preview.fromY, preview.toY);
      const colour = preview.erasing ? ERASE_COLOR : ZONE_COLOR;

      graphics.rect(
        minX * TILE_SIZE,
        minY * TILE_SIZE,
        (maxX - minX + 1) * TILE_SIZE,
        (maxY - minY + 1) * TILE_SIZE,
      );
      graphics.fill({ color: colour, alpha: PREVIEW_ALPHA });
      graphics.rect(
        minX * TILE_SIZE,
        minY * TILE_SIZE,
        (maxX - minX + 1) * TILE_SIZE,
        (maxY - minY + 1) * TILE_SIZE,
      );
      graphics.stroke({ color: colour, width: STROKE_WIDTH, alpha: 1 });
    },

    destroy() {
      graphics.destroy();
    },
  };
}
