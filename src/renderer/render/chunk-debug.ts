/**
 * Chunk debug overlay. Phase-07.8i, ADR-018 §8.
 *
 * Draws the terrain cache's own bookkeeping into the world: chunk borders, the
 * chunks that are stale right now, and how many times each has been redrawn.
 * This is the first debug tool that draws into the SCENE rather than the DOM,
 * so two rules apply that no panel so far has had to think about.
 *
 * IT NEVER ASKS FOR A FRAME. The overlay is updated from inside the existing
 * draw path and marks nothing dirty. If a chunk goes stale the terrain cache
 * has already marked the gate dirty for its own reasons (`world-view.ts`), so
 * the overlay is redrawn with the frame that was happening anyway. An overlay
 * that dirtied the gate to keep its own numbers fresh would hold the render
 * loop awake forever — the exact defect ADR-001 exists to refuse, in the one
 * build where it would look like the tool working.
 *
 * REDRAW COUNTS ARE COUNTED HERE, not in the tracker. The tracker is production
 * code on the terrain path, and a per-chunk tally there would ship. The count
 * is instead taken from the stale set sampled immediately BEFORE
 * `TerrainRenderer.update` runs: every chunk in that set is about to be
 * redrawn, so counting them is exact rather than inferred.
 *
 * The Pixi half mirrors `highlight.ts` — one `Graphics`, cleared and re-issued,
 * plus one `Text` per chunk created once. Sixteen chunks, so both are cheap.
 *
 * TWO FOLDING RULES THIS MILESTONE PAID FOR, recorded here because this file
 * does not ship and the call sites cannot afford the comment:
 *
 * - A condition must be the FLAG ALONE. `FEATURE_DEBUG && options.x !== undefined`
 *   does not fold — a property access may be a getter, so the bundler keeps the
 *   whole expression even though `false &&` has already decided it. Written as
 *   `FEATURE_DEBUG ? … : {}` it folds to `...{}` and disappears.
 * - COMMENTS IN SURVIVING CODE ARE BYTES. This bundle is not minified: it ships
 *   formatted source with original identifiers and comments intact. Prose next
 *   to a line that survives is prose in the release build.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';

import { CHUNK_COUNT, CHUNK_SIZE, chunkOrigin } from './terrain-chunks';

/** Chunk border colour. Cyan: used by no gameplay art, so it reads as tooling. */
const BORDER_TINT = 0x39d0ff;
const STALE_TINT = 0xffb347;
const BORDER_WIDTH = 1;
const BORDER_ALPHA = 0.5;
const STALE_ALPHA = 0.18;

/** World-pixel bounds of a chunk. */
export function chunkBounds(chunk: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const origin = chunkOrigin(chunk);
  return {
    x: origin.x * TILE_SIZE,
    y: origin.y * TILE_SIZE,
    width: CHUNK_SIZE * TILE_SIZE,
    height: CHUNK_SIZE * TILE_SIZE,
  };
}

/**
 * Adds one redraw to every chunk in `stale`.
 *
 * Pure, and returns a new array: the counts are read while being displayed, and
 * a tally mutated underneath a render is how a debug number becomes a lie.
 */
export function accumulateRedraws(
  counts: readonly number[],
  stale: readonly number[],
): readonly number[] {
  if (stale.length === 0) return counts;

  const next = [...counts];
  for (const chunk of stale) {
    if (chunk < 0 || chunk >= next.length) continue;
    next[chunk] = (next[chunk] ?? 0) + 1;
  }
  return next;
}

/** The label drawn on a chunk: its index, and how often it has been redrawn. */
export function chunkLabel(chunk: number, redraws: number): string {
  return `#${String(chunk)} ×${String(redraws)}`;
}

export interface ChunkDebugState {
  /** Chunks that are stale at this moment — about to be redrawn. */
  readonly stale: readonly number[];
}

export interface ChunkDebug {
  /** Redraws the overlay. Called from the existing draw path only. */
  update(state: ChunkDebugState): void;
  /** Per-chunk redraw tally, for anything that wants to read it. */
  counts(): readonly number[];
  setVisible(visible: boolean): void;
  destroy(): void;
}

export function createChunkDebug(parent: Container): ChunkDebug {
  const root = new Container();
  root.label = 'chunk-debug';
  root.visible = false;
  parent.addChild(root);

  const graphics = new Graphics();
  root.addChild(graphics);

  const style = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: BORDER_TINT });
  const labels: Text[] = [];
  for (let chunk = 0; chunk < CHUNK_COUNT; chunk += 1) {
    const bounds = chunkBounds(chunk);
    const text = new Text({ text: '', style });
    text.x = bounds.x + 2;
    text.y = bounds.y + 2;
    root.addChild(text);
    labels.push(text);
  }

  let counts: readonly number[] = new Array<number>(CHUNK_COUNT).fill(0);

  return {
    update(state) {
      counts = accumulateRedraws(counts, state.stale);
      if (!root.visible) return;

      const staleSet = new Set(state.stale);
      graphics.clear();

      for (let chunk = 0; chunk < CHUNK_COUNT; chunk += 1) {
        const bounds = chunkBounds(chunk);

        // Stale chunks are filled, not merely outlined: "which of these is
        // about to cost me a redraw" has to be answerable at a glance.
        if (staleSet.has(chunk)) {
          graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
          graphics.fill({ color: STALE_TINT, alpha: STALE_ALPHA });
        }

        graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        graphics.stroke({ width: BORDER_WIDTH, color: BORDER_TINT, alpha: BORDER_ALPHA });

        const label = labels[chunk];
        if (label !== undefined) label.text = chunkLabel(chunk, counts[chunk] ?? 0);
      }
    },

    counts: () => counts,

    setVisible(visible) {
      root.visible = visible;
    },

    destroy() {
      // Pixi holds GPU resources GC will not reclaim (CODE_STYLE.md §10), and
      // collapsed mode destroys the whole scene on every toggle.
      root.destroy({ children: true });
    },
  };
}
