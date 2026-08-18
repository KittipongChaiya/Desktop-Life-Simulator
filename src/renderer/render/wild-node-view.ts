/**
 * The wilds' nodes — the drawing half. Phase-27 — ADR-037.
 *
 * Sprites in the y-sorted `objects` layer, one tile each, exactly as decor and
 * buildings are: a worker walking below a tree draws in front of it. Sharing
 * that layer is the point — a separate layer could not interleave with the
 * worker who is standing there chopping.
 *
 * ## Built once, then only ever restyled
 *
 * Node POSITIONS are a hash of the seed and never move, so the sprite set is
 * created once from `planWildNodes` and never rebuilt. What changes is whether
 * each one has been worked, which arrives as the `wilds` slice — a list of
 * tiles, change-gated by identity like every other view (`crop-view.ts`).
 *
 * ## A worked node is dimmed and small, not hidden
 *
 * Two states, no in-between, and the reason is ADR-017 §12. Scaling a stump
 * smoothly back to a tree over a fifteen-minute regrow would be lovely and
 * would also write to four hundred sprites on every frame of it, holding the
 * frame loop open on a window that sits on the player's desktop for eight
 * hours. Two states change only when the slice does — twice per node per cycle.
 *
 * Hiding a worked node outright was the other candidate and it is worse: an
 * empty tile says *there was never anything here*, so a player who felled a
 * stand would believe they had exhausted it permanently. A faded, shrunken one
 * says *coming back*, which is what regrowth is.
 */

import { Sprite, type Container, type Texture } from 'pixi.js';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';

import type { DirtyGate } from './dirty-gate';
import { SWAYS, swayPhase, swayRotation } from './sway';
import type { WildNodeView } from './wild-nodes';

/** Opacity of a node that has been worked and has not come back. */
const WORKED_ALPHA = 0.45;

/** Scale of a worked node — small enough to read as regrowth at a glance. */
const WORKED_SCALE = 0.55;

export interface WildNodeRenderer {
  /** Builds the sprite for every node. Called once per world. */
  set(nodes: readonly WildNodeView[]): void;
  /**
   * Applies the `wilds` slice: the tiles whose node is currently worked.
   *
   * Change-gated on the slice's identity, so a still wilderness costs one
   * reference comparison per frame and nothing else.
   */
  setWorked(worked: readonly number[]): void;
  /**
   * Leans the plants, if the caller says ambient motion may run right now.
   *
   * UNBOUNDED motion (ADR-017 §2) — the caller owns all four conditions and
   * the lease; this only draws. Worked nodes do not lean: a felled stand
   * swaying in the wind would be a stump pretending to be a tree.
   */
  sway(nowMs: number, enabled: boolean): void;
  destroy(): void;
}

export interface WildNodeRendererOptions {
  readonly layer: Container;
  readonly textureFor: (spriteKey: string) => Texture;
  readonly gate: DirtyGate;
}

interface Entry {
  readonly sprite: Sprite;
  readonly phase: number;
  readonly sways: boolean;
  worked: boolean;
}

export function createWildNodeRenderer(options: WildNodeRendererOptions): WildNodeRenderer {
  let entries = new Map<number, Entry>();
  /** The last slice applied, by identity — the change gate. */
  let lastWorked: readonly number[] | null = null;
  /** True while anything is leaning, so upright is restored exactly once. */
  let leaning = false;

  const clear = (): void => {
    for (const entry of entries.values()) entry.sprite.destroy();
    entries = new Map();
    lastWorked = null;
    leaning = false;
  };

  const restyle = (entry: Entry, worked: boolean): void => {
    if (entry.worked === worked) return;
    entry.worked = worked;
    entry.sprite.alpha = worked ? WORKED_ALPHA : 1;
    entry.sprite.scale.set(worked ? WORKED_SCALE : 1);
    // A worked node stops leaning immediately rather than waiting for the next
    // sway pass, which may never come — ambient motion is off by default.
    if (worked) entry.sprite.rotation = 0;
  };

  return {
    set(nodes) {
      clear();

      for (const node of nodes) {
        const sprite = new Sprite(options.textureFor(node.sprite));
        const y = Math.floor(node.tile / WORLD_WIDTH);
        sprite.x = (node.tile - y * WORLD_WIDTH) * TILE_SIZE;
        sprite.y = y * TILE_SIZE;
        // The same y-sort key buildings, decor, and workers use, so everything
        // in the objects layer shares one consistent depth order.
        sprite.zIndex = y;
        // Anchored at the bottom centre for every node, not just the swaying
        // ones: a worked node shrinks, and a top-left anchor would shrink it
        // toward the corner of its tile instead of settling onto the ground.
        sprite.anchor.set(0.5, 1);
        sprite.x += TILE_SIZE / 2;
        sprite.y += TILE_SIZE;
        options.layer.addChild(sprite);

        entries.set(node.tile, {
          sprite,
          phase: swayPhase(node.tile),
          sways: SWAYS.has(node.sprite),
          worked: false,
        });
      }
    },

    setWorked(worked) {
      if (worked === lastWorked) return; // change-gated: nothing new to draw
      lastWorked = worked;

      options.gate.markDirty();

      const workedTiles = new Set(worked);
      for (const [tile, entry] of entries) restyle(entry, workedTiles.has(tile));
    },

    sway(nowMs, enabled) {
      if (!enabled) {
        // Restore upright exactly once, then cost nothing until re-enabled.
        if (!leaning) return;
        for (const entry of entries.values()) entry.sprite.rotation = 0;
        leaning = false;
        return;
      }

      leaning = true;
      for (const entry of entries.values()) {
        if (!entry.sways || entry.worked) continue;
        entry.sprite.rotation = swayRotation(nowMs, entry.phase);
      }
    },

    destroy: clear,
  };
}
