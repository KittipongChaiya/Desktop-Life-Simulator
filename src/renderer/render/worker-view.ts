/**
 * Worker rendering. Phase-04c.
 *
 * Reconciles a pool of Pixi sprites against the worker snapshot each frame:
 * creates sprites for new workers, interpolates their positions by `alpha`
 * (ADR-007 §5 — never writing back to the sim), animates them from the
 * generated `Animations` manifest, y-sorts them in the `entities` layer, and
 * culls those off-screen.
 *
 * The FRAGILE invariant is `animatingEntityCount` (ADR-001 §1, ASSETS.md §7.1):
 * a walking sprite holds one animation lease and MUST release it the instant it
 * stops walking, is culled, or is removed — otherwise render-on-demand decays
 * into a permanent per-frame cost. Every path that stops animation calls
 * `releaseHold`, and the gate's release is idempotent as a second guard.
 *
 * All maths lives in the pure `worker-render.ts`; this module is only the Pixi
 * adapter.
 */

import { Animations } from '@assets/manifest';
import { Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import type { WorkerView } from '../../sim/snapshot/workers-slice';

import type { DirtyGate } from './dirty-gate';
import {
  currentFrame,
  interpolatedPosition,
  isColumnCulled,
  selectAnimation,
  type AnimationDef,
} from './worker-render';

// The generated manifest is a plain record of animation definitions.
const ANIMATIONS = Animations as Readonly<Record<string, AnimationDef>>;

interface Tracked {
  readonly sprite: Sprite;
  /** The previous and current snapshots — the two states `alpha` interpolates. */
  prev: WorkerView;
  current: WorkerView;
  /** The live animation lease, or null when not animating. */
  release: (() => void) | null;
}

export interface WorkerUpdate {
  readonly workers: readonly WorkerView[];
  readonly alpha: number;
  readonly tick: number;
  readonly firstColumn: number;
  readonly lastColumn: number;
}

export interface WorkerRenderer {
  /** Reconciles sprites with the snapshot and positions them for this frame. */
  update(params: WorkerUpdate): void;
  /** Sprites currently pooled. Diagnostics and tests. */
  count(): number;
  destroy(): void;
}

export interface WorkerRendererOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
  readonly gate: DirtyGate;
}

export function createWorkerRenderer(options: WorkerRendererOptions): WorkerRenderer {
  const { layer, textureFor, gate } = options;
  const tracked = new Map<number, Tracked>();
  let lastWorkers: readonly WorkerView[] | null = null;

  const releaseHold = (entry: Tracked): void => {
    if (entry.release !== null) {
      entry.release();
      entry.release = null;
    }
  };

  const draw = (entry: Tracked, update: WorkerUpdate): void => {
    if (isColumnCulled(entry.current.tile, update.firstColumn, update.lastColumn)) {
      entry.sprite.visible = false;
      releaseHold(entry); // paused, not merely hidden (ASSETS.md §7.1)
      return;
    }
    entry.sprite.visible = true;

    const position = interpolatedPosition(entry.prev, entry.current, update.alpha);
    entry.sprite.x = position.x + TILE_SIZE / 2; // anchor is bottom-centre
    entry.sprite.y = position.y + TILE_SIZE;
    entry.sprite.zIndex = position.y; // lower on screen draws in front

    const def = ANIMATIONS[selectAnimation(entry.current.state, entry.current.facing)];
    if (def === undefined) return;
    entry.sprite.texture = textureFor(currentFrame(def, update.tick));

    const animating = def.frameTicks > 0 && def.frames.length > 1;
    if (animating && entry.release === null) entry.release = gate.acquireAnimation();
    else if (!animating) releaseHold(entry);
  };

  return {
    update(params) {
      const newSnapshot = params.workers !== lastWorkers;
      if (newSnapshot) gate.markDirty();

      const seen = new Set<number>();
      for (const view of params.workers) {
        seen.add(view.id);
        let entry = tracked.get(view.id);
        if (entry === undefined) {
          const sprite = new Sprite();
          sprite.anchor.set(0.5, 1);
          layer.addChild(sprite);
          entry = { sprite, prev: view, current: view, release: null };
          tracked.set(view.id, entry);
        } else if (newSnapshot) {
          entry.prev = entry.current;
          entry.current = view;
        }
        draw(entry, params);
      }

      // Remove sprites for workers that no longer exist (none in v0.1, but a
      // fired worker or a load would).
      for (const [id, entry] of tracked) {
        if (seen.has(id)) continue;
        releaseHold(entry);
        entry.sprite.destroy();
        tracked.delete(id);
        gate.markDirty();
      }

      lastWorkers = params.workers;
    },

    count: () => tracked.size,

    destroy() {
      for (const entry of tracked.values()) {
        releaseHold(entry);
        entry.sprite.destroy();
      }
      tracked.clear();
      lastWorkers = null;
    },
  };
}
