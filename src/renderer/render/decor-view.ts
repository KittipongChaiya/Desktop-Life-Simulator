/**
 * Ground decoration — the drawing half. Phase-07.5e.
 *
 * Sprites in the y-sorted `objects` layer, one tile each, placed and depth-
 * ordered exactly as buildings are (`building-view.ts`): a worker walking
 * below a tree draws in front of it, one walking above draws behind. That
 * consistency is the whole reason decor shares the layer rather than getting
 * its own — a separate layer could not interleave with buildings and workers,
 * and props would float in a plane of their own.
 *
 * STATIC BY CONSTRUCTION. Props are built once per plan and never touched
 * again, so they cost nothing per frame and hold no animation lease. The plan
 * is only rebuilt when tile ownership changes — a land expansion — which is a
 * handful of times in a whole session.
 *
 * `planDecor` guarantees these tiles are unowned, unblocked grass. Nothing
 * here re-checks that, and nothing here may: the simulation does not know
 * decor exists, so a prop can never be asked about, walked into, or saved.
 */

import { Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';

import type { DecorItem } from './decor';

export interface DecorRenderer {
  /** Replaces every prop with `items`. Cheap to call; rare in practice. */
  set(items: readonly DecorItem[]): void;
  destroy(): void;
}

export interface DecorRendererOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
}

export function createDecorRenderer(options: DecorRendererOptions): DecorRenderer {
  let sprites: Sprite[] = [];

  const clear = (): void => {
    for (const sprite of sprites) sprite.destroy();
    sprites = [];
  };

  return {
    set(items) {
      // Rebuilt wholesale rather than diffed. A plan changes only on a land
      // expansion, and a few hundred sprites is nothing next to the diffing
      // machinery an incremental update would need to earn its keep.
      clear();

      for (const item of items) {
        const sprite = new Sprite(options.textureFor(item.sprite));
        const y = Math.floor(item.tile / WORLD_WIDTH);
        sprite.x = (item.tile - y * WORLD_WIDTH) * TILE_SIZE;
        sprite.y = y * TILE_SIZE;
        // The same y-sort key buildings use, so props, buildings, and workers
        // share one consistent depth order.
        sprite.zIndex = y;
        options.layer.addChild(sprite);
        sprites.push(sprite);
      }
    },

    destroy: clear,
  };
}
