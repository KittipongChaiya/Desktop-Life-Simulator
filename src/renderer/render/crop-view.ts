/**
 * Crop rendering.
 *
 * Reconciles a small sprite pool against the crops snapshot slice, which
 * republishes only when a crop appears, vanishes, or CHANGES STAGE — so this
 * runs four times per crop lifetime rather than per frame (ADR-001 §1).
 * Sprites live in the y-sorted `objects` layer, one tile each, so crops,
 * buildings, decor, and workers interleave correctly by depth.
 *
 * UNLIKE A BUILDING, A CROP'S SPRITE CHANGES. A shed placed is a shed forever,
 * so `building-view.ts` creates a sprite and never revisits its texture. A crop
 * passes through four stages on the same tile, so the pool reassigns the
 * texture when it moves — a create-and-forget copy of the building renderer
 * would draw every crop as a seed for the whole of its life.
 */

import { Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';
import type { CropView } from '../../sim/snapshot/crops-slice';

import type { DirtyGate } from './dirty-gate';

export interface CropRenderer {
  update(crops: readonly CropView[]): void;
  destroy(): void;
}

export interface CropRendererOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
  readonly gate: DirtyGate;
}

export function createCropRenderer(options: CropRendererOptions): CropRenderer {
  const { layer, textureFor, gate } = options;
  /** Keyed by TILE — where a crop grows IS its identity; crops carry no id. */
  const sprites = new Map<number, Sprite>();
  let last: readonly CropView[] | null = null;

  return {
    update(crops) {
      if (crops === last) return; // change-gated: nothing new to draw
      last = crops;
      gate.markDirty();

      const seen = new Set<number>();
      for (const view of crops) {
        seen.add(view.tile);
        const texture = textureFor(view.sprite);

        const existing = sprites.get(view.tile);
        if (existing !== undefined) {
          // Same tile, same sprite object, new stage. Compared by texture
          // identity: one key resolves to one texture out of the sheet.
          if (existing.texture !== texture) existing.texture = texture;
          continue;
        }

        const sprite = new Sprite(texture);
        const y = Math.floor(view.tile / WORLD_WIDTH);
        sprite.x = (view.tile - y * WORLD_WIDTH) * TILE_SIZE;
        sprite.y = y * TILE_SIZE;
        sprite.zIndex = y; // y-sorted in the objects layer
        layer.addChild(sprite);
        sprites.set(view.tile, sprite);
      }

      // Harvested, or removed by a load. The sprite goes with the crop.
      for (const [tile, sprite] of sprites) {
        if (seen.has(tile)) continue;
        sprite.destroy();
        sprites.delete(tile);
      }
    },

    destroy() {
      for (const sprite of sprites.values()) sprite.destroy();
      sprites.clear();
      last = null;
    },
  };
}
