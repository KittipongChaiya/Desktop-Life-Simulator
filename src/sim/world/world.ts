/**
 * The world — the single source of truth for game state.
 *
 * A struct of stores, not an object graph (ADR-004 §2). Entities are plain data
 * with no behavior; behavior lives in systems.
 *
 * PHASE-00 SCOPE: seed, tick counter, and RNG only. Tile grid, crops, workers,
 * buildings, inventory, wallet, intents, and events are added by phases 02-06,
 * each with its own store. Adding them here now would be scope inflation
 * (AI_RULES.md §3.2).
 */

import {
  createTileKindRegistry,
  registerCoreTileKinds,
  type TileKindRegistry,
} from '../content/tile-kinds';
import { createRng, type Rng } from '../rng/rng';
import { createSnapshotState, type SnapshotState } from '../snapshot/state';

import { claimCenteredPlot, createTileGrid, type TileGrid } from './tile-grid';

export interface World {
  /** The seed this world was created from. Never changes. */
  readonly seed: number;

  /**
   * Ticks elapsed since world creation.
   *
   * The simulation's ONLY notion of time. Wall-clock reads are unavailable in
   * `src/sim` by compile configuration (TECH_STACK.md §3.1).
   */
  tick: number;

  /** Seeded generator. The only randomness source. */
  readonly rng: Rng;

  /** Dense terrain data. ADR-004 §2. */
  readonly tiles: TileGrid;

  /** Registered tile kinds. Instances store the dense index, not the ID. */
  readonly tileKinds: TileKindRegistry;

  /**
   * Versioned projections for views. Written by `snapshotSystem` at the end of
   * each tick; never read by other systems (ADR-005 §2).
   */
  readonly snapshots: SnapshotState;
}

/** Starting owned plot, in tiles per side. GAME_DESIGN.md §2.1. */
const STARTING_PLOT_SIZE = 8;

export function createWorld(seed: number): World {
  const tileKinds = createTileKindRegistry();
  registerCoreTileKinds(tileKinds);

  const tiles = createTileGrid();
  // Every tile defaults to kind index 0, which is core:grass by registration
  // order — so an all-zero grid is a valid grass world with no fill pass.
  claimCenteredPlot(tiles, STARTING_PLOT_SIZE);

  return {
    seed,
    tick: 0,
    rng: createRng(seed),
    tiles,
    tileKinds,
    snapshots: createSnapshotState(),
  };
}
