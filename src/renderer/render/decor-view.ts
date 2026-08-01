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
import { derivedUnit } from './presentation-rng';

/**
 * Sprites that sway. Rocks do not, which is the whole of the rule.
 *
 * Keyed by sprite rather than by a kind enum because `decor.ts` describes its
 * items by sprite key and nothing else — inventing a parallel taxonomy here
 * would be a second source of truth for the same fact.
 */
const SWAYS: ReadonlySet<string> = new Set([
  'buildings:flower',
  'buildings:bush',
  'buildings:tree',
]);

/** Peak lean, in radians. Small: this is a breeze, not a storm. */
const SWAY_RADIANS = 0.035;

/** Milliseconds per full sway cycle. Slow enough to read as wind. */
const SWAY_PERIOD_MS = 3400;

export interface DecorRenderer {
  /** Replaces every prop with `items`. Cheap to call; rare in practice. */
  set(items: readonly DecorItem[]): void;
  /**
   * Leans the plants, if the caller says ambient motion may run right now.
   *
   * UNBOUNDED motion (ADR-017 §2): it never finishes, so the caller owns all
   * four conditions and this only draws. Passing `false` restores every sprite
   * to upright exactly once and then costs nothing.
   */
  sway(nowMs: number, enabled: boolean): void;
  destroy(): void;
}

export interface DecorRendererOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
}

export function createDecorRenderer(options: DecorRendererOptions): DecorRenderer {
  let sprites: Sprite[] = [];
  /** Sway-eligible sprites and their phase offsets, parallel to `sprites`. */
  let swaying: { sprite: Sprite; phase: number }[] = [];
  /** True while anything is leaning, so upright is restored exactly once. */
  let leaning = false;

  const clear = (): void => {
    for (const sprite of sprites) sprite.destroy();
    sprites = [];
    swaying = [];
    leaning = false;
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

        if (SWAYS.has(item.sprite)) {
          // Anchored at the bottom centre so a lean pivots at the roots
          // rather than sliding the whole plant sideways.
          sprite.anchor.set(0.5, 1);
          sprite.x += TILE_SIZE / 2;
          sprite.y += TILE_SIZE;
          // Phase DERIVED from the tile (ADR-017 §5), so a hedgerow ripples
          // instead of pulsing as one block, identically on every launch.
          swaying.push({ sprite, phase: derivedUnit(item.tile, 0) * Math.PI * 2 });
        }
      }
    },

    sway(nowMs, enabled) {
      if (!enabled) {
        // Restore upright exactly once, then cost nothing until re-enabled.
        // Without the guard this would write a rotation to every plant on
        // every frame of a still world — the defect it exists to avoid.
        if (!leaning) return;
        for (const entry of swaying) entry.sprite.rotation = 0;
        leaning = false;
        return;
      }

      leaning = true;
      const radians = (nowMs / SWAY_PERIOD_MS) * Math.PI * 2;
      for (const entry of swaying) {
        entry.sprite.rotation = Math.sin(radians + entry.phase) * SWAY_RADIANS;
      }
    },

    destroy: clear,
  };
}
