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

import { registerCropCommands } from '../commands/crop-commands';
import { createCommandDispatcher, type CommandDispatcher } from '../commands/dispatcher';
import { createCropRegistry, registerCoreCrops, type CropRegistry } from '../content/crops';
import {
  createTileKindRegistry,
  registerCoreTileKinds,
  type TileKindRegistry,
} from '../content/tile-kinds';
import { createIdAllocator, type IdAllocator } from '../entities/id-allocator';
import { createEventBus, type EventBus } from '../events/bus';
import { createRng, type Rng } from '../rng/rng';
import { createSnapshotState, type SnapshotState } from '../snapshot/state';

import { createCropStore, type CropStore } from './crop';
import { attachCropStats, createCropStats, type CropStats } from './crop-stats';
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

  /** Planted crops, keyed by tile. Sparse — most tiles have none. */
  readonly crops: CropStore;

  /** Registered crop definitions. Instances reference these by id. */
  readonly cropRegistry: CropRegistry;

  /**
   * Cumulative crop activity. Maintained by an event SUBSCRIBER, not derived —
   * "ever harvested" cannot be recomputed from the current crop map (ADR-008).
   */
  readonly cropStats: CropStats;

  /**
   * Typed event bus. Queue-and-flush; subscribers run in `postUpdate` only
   * (ADR-008).
   */
  readonly events: EventBus;

  /**
   * THE ONLY WRITE PATH INTO THIS WORLD (ADR-010 §1).
   *
   * Every store above is readable from anywhere and writable only from a
   * command handler. Per-world, never a module singleton, so two worlds can
   * coexist in one process (ADR-010 §8).
   */
  readonly commands: CommandDispatcher;

  /**
   * Entity ID allocation. An ID SERVICE, not an entity store — systems keep
   * their own typed stores (ADR-004).
   */
  readonly ids: IdAllocator;

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

  const cropRegistry = createCropRegistry();
  registerCoreCrops(cropRegistry);

  const tiles = createTileGrid();
  // Every tile defaults to kind index 0, which is core:grass by registration
  // order — so an all-zero grid is a valid grass world with no fill pass.
  claimCenteredPlot(tiles, STARTING_PLOT_SIZE);

  const events = createEventBus();
  const cropStats = createCropStats();

  const world: World = {
    seed,
    tick: 0,
    rng: createRng(seed),
    tiles,
    tileKinds,
    crops: createCropStore(),
    cropRegistry,
    cropStats,
    events,
    // Reads `world` lazily. The closure runs at dispatch time, never during
    // construction, so the self-reference is sound — and it is what keeps the
    // dispatcher bound to exactly one world (ADR-010 §8).
    commands: createCommandDispatcher(() => world),
    ids: createIdAllocator(),
    snapshots: createSnapshotState(),
  };

  // Wire the consumer before any command can publish.
  attachCropStats(events, cropStats, () => world.tick);

  // Explicit registration, not discovery: the command set must not depend on
  // import order (ADR-010 §8).
  registerCropCommands(world.commands);

  return world;
}
