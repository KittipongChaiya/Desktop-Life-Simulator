/**
 * Resident rendering. Phase-19 — ADR-031 §4.
 *
 * The worker view's shape with everything a resident does not have removed:
 * no selection, no task states, no fidgets, no hop. A resident is either
 * walking (the costume's walk cycle, holding one animation lease) or standing
 * (a static idle frame, holding nothing). At night the slice is empty, every
 * sprite is removed, and the view costs exactly zero — the sleeping town
 * draws nothing, which is ADR-001 §1 kept by construction.
 *
 * The FRAGILE invariant is the same as the worker view's: a walking sprite's
 * lease MUST be released the moment it stops, is culled, or is removed.
 */

import { Animations } from '@assets/manifest';
import { Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import type { ResidentView } from '../../sim/snapshot/residents-slice';
import { Direction } from '../../sim/snapshot/workers-slice';

import type { DirtyGate } from './dirty-gate';
import {
  currentFrame,
  easedApproach,
  interpolatedPosition,
  isColumnCulled,
  type AnimationDef,
} from './worker-render';

const ANIMATIONS = Animations as Readonly<Record<string, AnimationDef>>;

const DIRECTION_SUFFIX: Readonly<Record<Direction, string>> = {
  [Direction.North]: 'n',
  [Direction.South]: 's',
  [Direction.East]: 'e',
  [Direction.West]: 'w',
};

/** The animation name for a resident: `villager_a_walk_s`, `villager_b_idle_n`… */
export function residentAnimation(view: ResidentView): string {
  const walking = view.tile !== view.toTile;
  return `${view.costume}_${walking ? 'walk' : 'idle'}_${DIRECTION_SUFFIX[view.facing]}`;
}

interface Tracked {
  readonly sprite: Sprite;
  prev: ResidentView;
  current: ResidentView;
  release: (() => void) | null;
}

export interface ResidentUpdate {
  readonly residents: readonly ResidentView[];
  readonly alpha: number;
  readonly tick: number;
  readonly firstColumn: number;
  readonly lastColumn: number;
}

export interface ResidentRenderer {
  update(params: ResidentUpdate): void;
  /** Sprites currently pooled. Diagnostics and tests. */
  count(): number;
  destroy(): void;
}

export interface ResidentRendererOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
  readonly gate: DirtyGate;
}

export function createResidentRenderer(options: ResidentRendererOptions): ResidentRenderer {
  const { layer, textureFor, gate } = options;
  const tracked = new Map<string, Tracked>();
  let lastResidents: readonly ResidentView[] | null = null;

  const releaseHold = (entry: Tracked): void => {
    if (entry.release !== null) {
      entry.release();
      entry.release = null;
    }
  };

  const draw = (entry: Tracked, update: ResidentUpdate): void => {
    if (isColumnCulled(entry.current.tile, update.firstColumn, update.lastColumn)) {
      entry.sprite.visible = false;
      releaseHold(entry); // paused, not merely hidden (ASSETS.md §7.1)
      return;
    }
    entry.sprite.visible = true;

    const position = interpolatedPosition(entry.prev, entry.current, easedApproach(update.alpha));
    entry.sprite.x = position.x + TILE_SIZE / 2; // anchor is bottom-centre
    entry.sprite.y = position.y + TILE_SIZE;
    entry.sprite.zIndex = position.y; // lower on screen draws in front

    const def = ANIMATIONS[residentAnimation(entry.current)];
    if (def === undefined) return;
    entry.sprite.texture = textureFor(currentFrame(def, update.tick));

    const animating = def.frameTicks > 0 && def.frames.length > 1;
    if (animating && entry.release === null) entry.release = gate.acquireAnimation();
    else if (!animating) releaseHold(entry);
  };

  return {
    update(params) {
      const newSnapshot = params.residents !== lastResidents;
      if (newSnapshot) gate.markDirty();

      const seen = new Set<string>();
      for (const view of params.residents) {
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

      // A resident who went indoors leaves the slice; the sprite goes with
      // them, lease first.
      for (const [id, entry] of tracked) {
        if (seen.has(id)) continue;
        releaseHold(entry);
        entry.sprite.destroy();
        tracked.delete(id);
        gate.markDirty();
      }

      lastResidents = params.residents;
    },

    count: () => tracked.size,

    destroy() {
      for (const entry of tracked.values()) {
        releaseHold(entry);
        entry.sprite.destroy();
      }
      tracked.clear();
      lastResidents = null;
    },
  };
}
