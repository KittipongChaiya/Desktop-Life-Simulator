/**
 * Building rendering. Phase-05d.
 *
 * Buildings are static: a placement is rare and a shed never moves, so this
 * reconciles a small sprite pool against the buildings snapshot slice and marks
 * the gate dirty only when the set changes — no per-frame work (ADR-001 §1).
 * Sprites live in the y-sorted `objects` layer, one tile each.
 */

import { Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';
import type { BuildingView } from '../../sim/snapshot/buildings-slice';

import type { DirtyGate } from './dirty-gate';

export interface BuildingRenderer {
  update(buildings: readonly BuildingView[]): void;
  destroy(): void;
}

export interface BuildingRendererOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
  readonly gate: DirtyGate;
}

export function createBuildingRenderer(options: BuildingRendererOptions): BuildingRenderer {
  const { layer, textureFor, gate } = options;
  const sprites = new Map<number, Sprite>();
  let last: readonly BuildingView[] | null = null;

  return {
    update(buildings) {
      if (buildings === last) return; // change-gated: nothing new to draw
      last = buildings;
      gate.markDirty();

      const seen = new Set<number>();
      for (const view of buildings) {
        seen.add(view.id);
        let sprite = sprites.get(view.id);
        if (sprite === undefined) {
          sprite = new Sprite(textureFor(view.sprite));
          const y = Math.floor(view.tile / WORLD_WIDTH);
          sprite.x = (view.tile - y * WORLD_WIDTH) * TILE_SIZE;
          sprite.y = y * TILE_SIZE;
          sprite.zIndex = y; // y-sorted in the objects layer
          layer.addChild(sprite);
          sprites.set(view.id, sprite);
        }
      }

      for (const [id, sprite] of sprites) {
        if (seen.has(id)) continue;
        sprite.destroy();
        sprites.delete(id);
      }
    },

    destroy() {
      for (const sprite of sprites.values()) sprite.destroy();
      sprites.clear();
      last = null;
    },
  };
}
