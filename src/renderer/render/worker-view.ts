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
import { Graphics, Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import type { WorkerView } from '../../sim/snapshot/workers-slice';
import { WorkerState } from '../../sim/world/worker';

import type { DirtyGate } from './dirty-gate';
import {
  currentFrame,
  easedApproach,
  idleBob,
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
  /** Overlay layer for the selection box (above terrain, like tile highlights). */
  readonly worldUi: Container;
  readonly textureFor: (spriteKey: string) => Texture;
  readonly gate: DirtyGate;
  /**
   * Whether idle workers breathe (ADR-017 §2, gated on decorative creatures).
   *
   * Absent means no — breathing never ends, so it holds the frame loop open
   * for as long as a worker is idle and on screen.
   */
  readonly breathing?: (() => boolean) | undefined;
  /** The selected worker id, or null. Read each frame so the box follows it. */
  readonly selectedId: () => number | null;
}

/** Selection box outline — white, thin, drawn over the selected worker's tile. */
const SELECTION_COLOR = 0xffffff;
const SELECTION_WIDTH = 2;
const SELECTION_ALPHA = 0.9;

export function createWorkerRenderer(options: WorkerRendererOptions): WorkerRenderer {
  const { layer, worldUi, textureFor, gate, selectedId, breathing } = options;
  const tracked = new Map<number, Tracked>();
  const selectionBox = new Graphics();
  worldUi.addChild(selectionBox);
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

    // Eased BETWEEN snapshots only (07.7e). The simulation still steps at a
    // constant rate; this shapes where the sprite is drawn on the way, never
    // when it arrives (ADR-007 §5).
    const position = interpolatedPosition(entry.prev, entry.current, easedApproach(update.alpha));
    entry.sprite.x = position.x + TILE_SIZE / 2; // anchor is bottom-centre

    // Breathing, when the player has opted into living things moving on their
    // own. UNBOUNDED motion (ADR-017 §2): it never finishes, so it is off by
    // default and gated here rather than assumed.
    const bob =
      entry.current.state === WorkerState.Idle && breathing?.() === true
        ? idleBob(update.tick, entry.current.id)
        : 0;

    entry.sprite.y = position.y + TILE_SIZE + bob;
    entry.sprite.zIndex = position.y; // lower on screen draws in front

    const def = ANIMATIONS[selectAnimation(entry.current.state, entry.current.facing)];
    if (def === undefined) return;
    entry.sprite.texture = textureFor(currentFrame(def, update.tick));

    // A breathing worker is animating too — without this the bob would be
    // computed and never drawn, because nothing would ask for the frame.
    const animating = (def.frameTicks > 0 && def.frames.length > 1) || bob !== 0;
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

      // The selection box tracks the selected worker's interpolated tile. Redrawn
      // each frame so it follows a moving worker; markDirty on a selection change
      // (wired at the composition root) makes a static selection redraw once.
      selectionBox.clear();
      const selected = selectedId();
      const chosen = selected === null ? undefined : tracked.get(selected);
      if (chosen !== undefined && chosen.sprite.visible) {
        selectionBox
          .rect(chosen.sprite.x - TILE_SIZE / 2, chosen.sprite.y - TILE_SIZE, TILE_SIZE, TILE_SIZE)
          .stroke({ width: SELECTION_WIDTH, color: SELECTION_COLOR, alpha: SELECTION_ALPHA });
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
      selectionBox.destroy();
      lastWorkers = null;
    },
  };
}
