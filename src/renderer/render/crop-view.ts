/**
 * Crop rendering. Phase-07.6, animated in 07.7d.
 *
 * Reconciles a small sprite pool against the crops snapshot slice, which
 * republishes only when a crop appears, vanishes, or CHANGES STAGE — so the
 * reconcile runs four times per crop lifetime rather than per frame
 * (ADR-001 §1). Sprites live in the y-sorted `objects` layer, one tile each,
 * so crops, buildings, decor, and workers interleave correctly by depth.
 *
 * UNLIKE A BUILDING, A CROP'S SPRITE CHANGES. A shed placed is a shed forever,
 * so `building-view.ts` creates a sprite and never revisits its texture. A crop
 * passes through four stages on the same tile, so the pool reassigns the
 * texture when it moves — a create-and-forget copy of the building renderer
 * would draw every crop as a seed for the whole of its life.
 *
 * ANIMATION (07.7d) SPLITS THE UPDATE IN TWO. `update` reconciles against the
 * slice and runs only when it republishes; `animate` runs per frame and only
 * while something is actually moving, holding an animation lease for exactly
 * that long. A farm at rest reconciles nothing, animates nothing, and draws
 * nothing.
 *
 * A HARVESTED CROP OUTLIVES ITS OWN DATA. It is gone from the snapshot the
 * instant it is harvested, so to animate out at all its sprite has to be kept
 * after its entry disappears. Departing sprites move to their own map and are
 * destroyed when the curve ends — `crop-anim.ts` owns when that is, because a
 * mistake there is a leaked sprite rather than a visible glitch.
 */

import { Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';
import type { CropView } from '../../sim/snapshot/crops-slice';

import { bindAnimationLease, type AnimationLease } from './animation-lease';
import { animAlpha, animLift, animScale, CropAnim, isFinished, progressOf } from './crop-anim';
import type { DirtyGate } from './dirty-gate';

export interface CropRenderer {
  /** Reconciles against the slice. Cheap and change-gated. */
  update(crops: readonly CropView[]): void;
  /**
   * Advances any running animation. Called every frame; does nothing, and
   * holds no lease, when nothing is moving.
   */
  animate(nowMs: number): void;
  destroy(): void;
}

export interface CropRendererOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
  readonly gate: DirtyGate;
  /**
   * Scales every curve. 0 disables motion entirely and leaves crops at rest —
   * Reduced Motion, and the minimum intensity, both arrive as 0 here
   * (ADR-017 §7).
   */
  readonly intensity?: (() => number) | undefined;
  /** Called when a crop reaches a new stage, so the caller can add its own effect. */
  readonly onStageChange?: ((tile: number) => void) | undefined;
}

/** A living crop's sprite and whatever it is currently doing. */
interface Entry {
  readonly sprite: Sprite;
  /** Resting position, so a lift can be applied and removed cleanly. */
  readonly baseY: number;
  animation: CropAnim | null;
  startedAt: number;
}

export function createCropRenderer(options: CropRendererOptions): CropRenderer {
  const { layer, textureFor, gate, intensity, onStageChange } = options;

  const entries = new Map<number, Entry>();
  /** Sprites outliving their data, mid-departure. Keyed by tile. */
  const departing = new Map<number, Entry>();
  const lease: AnimationLease = bindAnimationLease(gate);
  let last: readonly CropView[] | null = null;

  const motionScale = (): number => {
    const value = intensity?.() ?? 1;
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  };

  /** Applies a curve to a sprite, damped by the intensity setting. */
  const apply = (entry: Entry, kind: CropAnim, progress: number): void => {
    const strength = motionScale();
    // Damping toward 1 rather than skipping: at any intensity the sprite still
    // ends where it belongs, so a setting change mid-animation cannot strand it.
    entry.sprite.scale.set(1 + (animScale(kind, progress) - 1) * strength);
    entry.sprite.alpha = 1 - (1 - animAlpha(kind, progress)) * strength;
    entry.sprite.y = entry.baseY - animLift(kind, progress) * TILE_SIZE * strength;
  };

  const rest = (entry: Entry): void => {
    entry.sprite.scale.set(1);
    entry.sprite.alpha = 1;
    entry.sprite.y = entry.baseY;
    entry.animation = null;
  };

  const begin = (entry: Entry, kind: CropAnim, nowMs: number): void => {
    entry.animation = kind;
    entry.startedAt = nowMs;
  };

  return {
    update(crops) {
      if (crops === last) return; // change-gated: nothing new to draw
      last = crops;
      gate.markDirty();

      const now = performance.now();
      const seen = new Set<number>();

      for (const view of crops) {
        seen.add(view.tile);
        const texture = textureFor(view.sprite);
        const existing = entries.get(view.tile);

        if (existing !== undefined) {
          // Same tile, same sprite object, new stage. Compared by texture
          // identity: one key resolves to one texture out of the sheet.
          if (existing.sprite.texture !== texture) {
            existing.sprite.texture = texture;
            begin(existing, CropAnim.Pulse, now);
            onStageChange?.(view.tile);
          }
          continue;
        }

        // A crop that is replanted while its predecessor is still departing
        // takes the tile back — the old sprite goes now rather than fading
        // over its replacement.
        const leaving = departing.get(view.tile);
        if (leaving !== undefined) {
          leaving.sprite.destroy();
          departing.delete(view.tile);
        }

        const row = Math.floor(view.tile / WORLD_WIDTH);
        const sprite = new Sprite(texture);
        // Anchored at the centre so scaling grows from the middle rather than
        // sliding the sprite off its tile.
        sprite.anchor.set(0.5);
        sprite.x = (view.tile - row * WORLD_WIDTH + 0.5) * TILE_SIZE;
        sprite.y = (row + 0.5) * TILE_SIZE;
        sprite.zIndex = row; // y-sorted in the objects layer
        layer.addChild(sprite);

        const entry: Entry = {
          sprite,
          baseY: sprite.y,
          animation: null,
          startedAt: now,
        };
        begin(entry, CropAnim.Spawn, now);
        entries.set(view.tile, entry);
      }

      // Harvested, or removed by a load. The sprite is kept and animated out.
      for (const [tile, entry] of entries) {
        if (seen.has(tile)) continue;
        begin(entry, CropAnim.Depart, now);
        departing.set(tile, entry);
        entries.delete(tile);
      }
    },

    animate(nowMs) {
      let moving = false;

      for (const entry of entries.values()) {
        const kind = entry.animation;
        if (kind === null) continue;

        if (isFinished(kind, entry.startedAt, nowMs)) {
          rest(entry);
          continue;
        }
        apply(entry, kind, progressOf(kind, entry.startedAt, nowMs));
        moving = true;
      }

      for (const [tile, entry] of departing) {
        if (isFinished(CropAnim.Depart, entry.startedAt, nowMs)) {
          // The sprite has outlived its data for exactly as long as the curve
          // runs. Anything longer would be a leak.
          entry.sprite.destroy();
          departing.delete(tile);
          continue;
        }
        apply(entry, CropAnim.Depart, progressOf(CropAnim.Depart, entry.startedAt, nowMs));
        moving = true;
      }

      lease.sync(moving);
    },

    destroy() {
      for (const entry of entries.values()) entry.sprite.destroy();
      entries.clear();
      for (const entry of departing.values()) entry.sprite.destroy();
      departing.clear();
      lease.release();
      last = null;
    },
  };
}
