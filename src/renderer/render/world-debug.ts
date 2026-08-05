/**
 * In-world debug overlays, composed. Phase-07.8j.
 *
 * ONE PORT, NOT ONE PER TOOL. 07.8i gave the world view a `chunkDebug` option
 * and measured what it cost: an option forwarded through `world-mount` survives
 * into the release bundle even when everything it points at folds away, because
 * a property copy is an expression and expressions do not fold. A second tool
 * would have bought a second copy of that. So the view knows about one debug
 * port, and which tools exist behind it is the composition root's business.
 *
 * It also gives 07.8l one place to hide every in-world debug drawing at once,
 * rather than a list of overlays to remember.
 *
 * Nothing here dirties the gate. Each overlay is redrawn inside the frame the
 * scene was already drawing (ADR-001, ADR-018 §8).
 */

import type { Container } from 'pixi.js';

import type { TileIndex } from '../../shared/ids';

import { createChunkDebug, type ChunkDebug } from './chunk-debug';
import { createPathDebug, type PathDebug } from './path-debug';

/** One worker's plan, as the overlay needs it. */
export interface DebugRoute {
  readonly path: readonly TileIndex[];
  readonly cursor: number;
}

export interface WorldDebugSources {
  readonly chunksEnabled: () => boolean;
  readonly routesEnabled: () => boolean;
  readonly heatmapEnabled: () => boolean;
  readonly routes: () => readonly DebugRoute[];
  readonly enterCost: (tile: TileIndex) => number;
  readonly visibleTiles: (firstColumn: number, lastColumn: number) => readonly TileIndex[];
}

export interface WorldDebugFrame {
  /** Chunks stale at this moment — sampled before the terrain update. */
  readonly stale: readonly number[];
  readonly firstColumn: number;
  readonly lastColumn: number;
}

export interface WorldDebug {
  update(frame: WorldDebugFrame): void;
  destroy(): void;
}

export function createWorldDebug(parent: Container, sources: WorldDebugSources): WorldDebug {
  const chunks: ChunkDebug = createChunkDebug(parent);
  const paths: PathDebug = createPathDebug(parent, {
    routes: sources.routes,
    enterCost: sources.enterCost,
    showRoutes: sources.routesEnabled,
    showHeatmap: sources.heatmapEnabled,
    visibleTiles: sources.visibleTiles,
  });

  return {
    update(frame) {
      chunks.setVisible(sources.chunksEnabled());
      chunks.update({ stale: frame.stale });
      paths.update({ firstColumn: frame.firstColumn, lastColumn: frame.lastColumn });
    },

    destroy() {
      chunks.destroy();
      paths.destroy();
    },
  };
}
