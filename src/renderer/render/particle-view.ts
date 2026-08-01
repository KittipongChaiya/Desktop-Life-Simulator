/**
 * Particles — the Pixi half. Phase-07.7d, ADR-017 §4.
 *
 * Draws the pool from `particle-pool.ts`, which 07.7b built and left without a
 * renderer on purpose: a pool with nothing to display it is untestable in the
 * only way that matters, and art with nothing to draw it looks like progress
 * while changing nothing.
 *
 * POOLED SPRITES, NOT `Graphics`. `effects.ts` redraws its burst and ring into
 * a `Graphics` every frame, which rebuilds geometry every frame — acceptable
 * for two shapes, not for a hundred and ninety specks. Every particle here is
 * one pre-allocated `Sprite` over Pixi's built-in white texture, tinted and
 * scaled per kind. Nothing is created after construction; a frame at full
 * density sets numbers on existing objects and no more.
 */

import { Container, Sprite, Texture } from 'pixi.js';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';

import { bindAnimationLease, type AnimationLease } from './animation-lease';
import type { DirtyGate } from './dirty-gate';
import { EffectKind } from './effect-state';
import type { ParticlePool, ParticleView } from './particle-pool';

/** Colour per kind, from the palette the world is painted in. */
const KIND_TINT: Readonly<Record<EffectKind, number>> = {
  [EffectKind.Burst]: 0xe0c260, // Straw — the harvest colour
  [EffectKind.Ring]: 0xe8e0d4, // Parchment
  [EffectKind.Dust]: 0x96704a, // Wood Base — turned earth
  [EffectKind.Leaves]: 0x5aa34e, // Grass Base
  [EffectKind.Sparkle]: 0xa5d97e, // Leaf Highlight — new growth
  [EffectKind.CoinBurst]: 0xf2c24c, // Reward Gold, the currency accent
  [EffectKind.Splash]: 0x6bb0d0, // Water Light
};

/** Size at birth, in pixels, per kind. Dust is the smallest; it fires most. */
const KIND_SIZE: Readonly<Record<EffectKind, number>> = {
  [EffectKind.Burst]: 3,
  [EffectKind.Ring]: 2,
  [EffectKind.Dust]: 2,
  [EffectKind.Leaves]: 3,
  [EffectKind.Sparkle]: 2,
  [EffectKind.CoinBurst]: 3,
  [EffectKind.Splash]: 2,
};

/** How far a particle travels from its origin over its life, in tile-widths. */
const TRAVEL = 0.5;

export interface ParticleRenderer {
  /** Draws the pool at `nowMs`, holding a lease only while it has content. */
  update(nowMs: number): void;
  destroy(): void;
}

export interface ParticleRendererOptions {
  readonly layer: Container;
  readonly pool: ParticlePool;
  readonly gate: DirtyGate;
}

export function createParticleRenderer(options: ParticleRendererOptions): ParticleRenderer {
  const { layer, pool, gate } = options;

  const root = new Container();
  layer.addChild(root);

  // One sprite per pool slot, made once and reused forever.
  const sprites: Sprite[] = Array.from({ length: pool.capacity }, () => {
    const sprite = new Sprite(Texture.WHITE);
    sprite.anchor.set(0.5);
    sprite.visible = false;
    root.addChild(sprite);
    return sprite;
  });

  const lease: AnimationLease = bindAnimationLease(gate);

  const place = (sprite: Sprite, view: ParticleView): void => {
    const row = Math.floor(view.tile / WORLD_WIDTH);
    const column = view.tile - row * WORLD_WIDTH;

    // Out from the tile centre along the particle's own scatter direction, and
    // upward — everything here is thrown, not dropped.
    const travel = view.progress * TRAVEL;
    sprite.x = (column + 0.5 + view.offsetX * (1 + travel)) * TILE_SIZE;
    sprite.y = (row + 0.5 + view.offsetY * (1 + travel) - travel * 0.6) * TILE_SIZE;

    const size = KIND_SIZE[view.kind];
    // Shrinks as it goes, so the end of a particle's life is its smallest and
    // faintest moment rather than an abrupt disappearance.
    sprite.width = size * (1 - view.progress * 0.6);
    sprite.height = sprite.width;
    sprite.tint = KIND_TINT[view.kind];
    sprite.alpha = 1 - view.progress;
    sprite.zIndex = row + 1;
    sprite.visible = true;
  };

  return {
    update(nowMs) {
      const active = pool.activeAt(nowMs);
      lease.sync(active.length > 0);

      let used = 0;
      for (const view of active) {
        const sprite = sprites[used];
        if (sprite === undefined) break;
        place(sprite, view);
        used += 1;
      }

      // Whatever this pass did not use is hidden, never destroyed. Sprites are
      // filled from index 0 upward, so the first hidden one ends the run.
      for (let i = used; i < sprites.length; i += 1) {
        const sprite = sprites[i];
        if (sprite === undefined || !sprite.visible) break;
        sprite.visible = false;
      }
    },

    destroy() {
      // Before the layer that parents them goes; a lease outliving its view is
      // a permanent frame cost on the next scene (ADR-001 §2).
      lease.release();
      pool.clear();
      root.destroy({ children: true });
    },
  };
}
