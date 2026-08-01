/**
 * Feedback effects — the drawing half. Phase-07.5b.
 *
 * Draws into layer 4 (`effects`), which `layers.ts` reserved and left empty
 * precisely so this could arrive without a re-layering migration. All the
 * timing and expiry logic lives in `effect-state.ts`; this file is deliberately
 * thin, because it is the half that cannot be unit-tested (`TESTING.md` §4.1 —
 * asserting on GPU output produces brittle tests that verify nothing).
 *
 * ONE `Graphics` OBJECT, REDRAWN, matching `highlight.ts`: at a dozen effects
 * of a few primitives each, `clear()` and re-issue costs nothing and allocates
 * nothing per frame.
 *
 * THE ANIMATION LEASE IS THE DANGEROUS PART. While anything is alive the gate
 * must draw every frame; the instant nothing is, the lease must go. A lease
 * that leaks costs a frame every frame forever and looks exactly like normal
 * operation (ADR-001 §1). It is acquired on the first live effect and released
 * on the first empty update — and `destroy()` releases unconditionally.
 *
 * No new art: effects are palette-coloured primitives. A particle sheet would
 * be real art needing real direction (`ART_DIRECTION.md`), and this phase is
 * polish on what exists.
 */

import { Graphics, type Container } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import { toPosition } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';

import { bindAnimationLease, type AnimationLease } from './animation-lease';
import type { DirtyGate } from './dirty-gate';
import { createEffectQueue, EffectKind, type ActiveEffect, type EffectQueue } from './effect-state';

/**
 * Effect tints, from the shipped palette's existing roles.
 *
 * Straw for a harvest — the colour of the mature crop being taken. Off-white
 * for a confirmation, which must read on grass, soil, and buildings alike.
 * Neither is Reward Gold: that stays reserved for coins (`COLOR_PALETTE.md`).
 */
const BURST_TINT = 0xd9b871;
const RING_TINT = 0xf3ead9;

/** Particles per burst. Four reads as "something happened" without confetti. */
const BURST_PARTICLES = 4;
const PARTICLE_SIZE = 3;
/** How far a particle travels, in world pixels. Under half a tile. */
const BURST_TRAVEL = 11;
const RING_STROKE = 2;

export interface Effects {
  /** A harvest happened at this tile. */
  burst(tile: TileIndex, nowMs: number): void;
  /** Something was confirmed at this tile — a placement, a selection. */
  ring(tile: TileIndex, nowMs: number): void;
  /** Redraws, and manages the animation lease. Called once per frame. */
  update(nowMs: number): void;
  destroy(): void;
}

/** Tile centre in world pixels, or null for an index off the grid. */
function centreOf(tile: TileIndex): { x: number; y: number } | null {
  const position = toPosition(tile);
  // Cosmetic geometry must never take down a frame — the same rule the
  // highlight follows for a bad index.
  if (!position.ok) return null;
  return {
    x: position.value.x * TILE_SIZE + TILE_SIZE / 2,
    y: position.value.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

function drawBurst(graphics: Graphics, effect: ActiveEffect): void {
  const centre = centreOf(effect.tile);
  if (centre === null) return;

  // Ease-out: particles leave quickly and settle, which reads as an impulse
  // rather than a drift.
  const eased = 1 - (1 - effect.progress) ** 2;
  const alpha = 1 - effect.progress;

  for (let i = 0; i < BURST_PARTICLES; i += 1) {
    // Fixed diagonals rather than random offsets: an effect that looks
    // different every time it fires reads as noise, and randomness here would
    // also make the renderer non-reproducible for no gain.
    const angle = (Math.PI / 4) * (1 + 2 * i);
    const distance = eased * BURST_TRAVEL;
    graphics.rect(
      centre.x + Math.cos(angle) * distance - PARTICLE_SIZE / 2,
      // Lifts slightly as it travels — the only gravity this game implies.
      centre.y + Math.sin(angle) * distance - PARTICLE_SIZE / 2 - eased * 3,
      PARTICLE_SIZE,
      PARTICLE_SIZE,
    );
    graphics.fill({ color: BURST_TINT, alpha });
  }
}

function drawRing(graphics: Graphics, effect: ActiveEffect): void {
  const centre = centreOf(effect.tile);
  if (centre === null) return;

  // Expands outward from the tile and fades — a confirmation that gets out of
  // the way rather than one that lands on top of what it is confirming.
  const radius = TILE_SIZE * (0.3 + 0.35 * effect.progress);
  graphics.circle(centre.x, centre.y, radius);
  graphics.stroke({ width: RING_STROKE, color: RING_TINT, alpha: 1 - effect.progress });
}

export function createEffects(layer: Container, gate: DirtyGate): Effects {
  const graphics = new Graphics();
  layer.addChild(graphics);

  const queue: EffectQueue = createEffectQueue();
  // The bookkeeping this file used to carry by hand (07.7b). `sync` acquires
  // on the transition into alive and releases on the transition out, so there
  // is no longer a place here to forget the release.
  const lease: AnimationLease = bindAnimationLease(gate);
  let holding = false;

  return {
    burst(tile, nowMs) {
      queue.spawn(EffectKind.Burst, tile, nowMs);
      lease.sync(true);
      holding = true;
    },

    ring(tile, nowMs) {
      queue.spawn(EffectKind.Ring, tile, nowMs);
      lease.sync(true);
      holding = true;
    },

    update(nowMs) {
      const active = queue.activeAt(nowMs);

      if (active.length === 0) {
        // Nothing alive: stop drawing, and stop asking for frames. The release
        // marks the gate dirty once more so this cleared frame reaches screen.
        if (holding) graphics.clear();
        holding = false;
        lease.sync(false);
        return;
      }

      graphics.clear();
      for (const effect of active) {
        if (effect.kind === EffectKind.Burst) drawBurst(graphics, effect);
        else drawRing(graphics, effect);
      }
    },

    destroy() {
      // Unconditional: a view torn down mid-effect (collapsing the overlay
      // destroys the whole scene, ADR-001 §2) must not leave a lease behind on
      // a gate that outlives it.
      lease.release();
      holding = false;
      queue.clear();
      graphics.destroy();
    },
  };
}
