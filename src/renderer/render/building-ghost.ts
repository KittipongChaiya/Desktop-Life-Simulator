/**
 * The build ghost — a translucent preview of a building under the cursor.
 * Phase-05d.
 *
 * Drawn into the `worldUi` layer (layer 6), which ADR-001 §Layers reserves for
 * "selection highlight, hover cursor, build ghost" — this is the third of those
 * and the reason it must track the camera in the scene graph, not the DOM
 * (ADR-005 §2).
 *
 * ONE `Sprite`, REUSED. A build ghost is a single tile that moves with the
 * pointer; allocating per hover would churn GPU buffers. It is hidden rather
 * than removed when there is nothing to preview, so the common case (not
 * placing) costs nothing.
 *
 * The tint carries legality: green for a placement that would be accepted,
 * amber for one that would be rejected. Amber, never red — `GAME_DESIGN.md`
 * §10.1 reserves red for genuine errors, and hovering an occupied tile is an
 * ordinary thing players do.
 */

import { Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import { toPosition } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';

/** Legal-placement tint — a soft green. */
const VALID_TINT = 0x9effa0;
/** Illegal-placement tint — amber, not red (see module note). */
const INVALID_TINT = 0xffb347;
/** Translucent enough to read as a preview over the terrain beneath. */
const GHOST_ALPHA = 0.55;

export interface GhostState {
  readonly tile: TileIndex;
  /** Sprite key of the building being placed (ASSETS.md §5). */
  readonly sprite: string;
  /** Whether the placement would be accepted — drives the tint. */
  readonly valid: boolean;
}

export interface BuildingGhost {
  /** Draws the ghost, or hides it when passed null. */
  update(state: GhostState | null): void;
  destroy(): void;
}

export interface BuildingGhostOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
}

export function createBuildingGhost(options: BuildingGhostOptions): BuildingGhost {
  const { layer, textureFor } = options;

  const sprite = new Sprite();
  sprite.alpha = GHOST_ALPHA;
  sprite.visible = false;
  layer.addChild(sprite);

  // The texture is swapped only when the building changes, not every frame.
  let textureKey: string | null = null;

  return {
    update(state) {
      if (state === null) {
        sprite.visible = false;
        return;
      }

      const position = toPosition(state.tile);
      // A bad index hides the ghost rather than throwing: it is cosmetic, and
      // must never take down a frame.
      if (!position.ok) {
        sprite.visible = false;
        return;
      }

      if (state.sprite !== textureKey) {
        sprite.texture = textureFor(state.sprite);
        textureKey = state.sprite;
      }
      sprite.x = position.value.x * TILE_SIZE;
      sprite.y = position.value.y * TILE_SIZE;
      sprite.tint = state.valid ? VALID_TINT : INVALID_TINT;
      sprite.visible = true;
    },

    destroy() {
      // Pixi holds GPU resources GC will not reclaim (CODE_STYLE.md §10).
      sprite.destroy();
    },
  };
}
