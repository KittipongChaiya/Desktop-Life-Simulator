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

import type { BuildingId } from '../../shared/ids';
import { registerBuildingCommands } from '../commands/building-commands';
import { registerCommerceCommands } from '../commands/commerce-commands';
import { registerCropCommands } from '../commands/crop-commands';
import {
  createCommandDispatcher,
  type CommandDispatcher,
  type CommandDispatcherOptions,
} from '../commands/dispatcher';
import { registerWorkerCommands } from '../commands/worker-commands';
import {
  createBuildingRegistry,
  registerCoreBuildings,
  type BuildingRegistry,
} from '../content/buildings';
import { createCropRegistry, registerCoreCrops, type CropRegistry } from '../content/crops';
import { createItemRegistry, registerCoreItems, type ItemRegistry } from '../content/items';
import {
  createTileKindRegistry,
  registerCoreTileKinds,
  type TileKindRegistry,
} from '../content/tile-kinds';
import { createIdAllocator, type IdAllocator } from '../entities/id-allocator';
import { createEventBus, type EventBus } from '../events/bus';
import { createRng, type Rng } from '../rng/rng';
import { createSnapshotState, type SnapshotState } from '../snapshot/state';

import { createBuildingStore, type BuildingStore } from './building';
import { createContainer, type Container } from './container';
import { createCropStore, type CropStore } from './crop';
import { attachCropStats, createCropStats, type CropStats } from './crop-stats';
import { createEconomyState, type EconomyState } from './economy';
import { claimCenteredPlot, createTileGrid, type TileGrid } from './tile-grid';
import { createWallet, STARTING_COINS, type Wallet } from './wallet';
import { createWorkerStore, type WorkerStore } from './worker';

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

  /** Hired workers, keyed by id. Sparse. Driven by `workerSystem` (phase-04). */
  readonly workers: WorkerStore;

  /** Registered crop definitions. Instances reference these by id. */
  readonly cropRegistry: CropRegistry;

  /** Registered item definitions. Stacks reference these by id (ADR-011). */
  readonly itemRegistry: ItemRegistry;

  /**
   * The player's inventory — a container (ADR-011). The first owner of the one
   * resource model; worker holds and storage sheds are the same type.
   */
  readonly inventory: Container;

  /** Registered building definitions. Instances reference these by id. */
  readonly buildingRegistry: BuildingRegistry;

  /** Placed buildings, keyed by id. Sparse. Each blocks its tile's walkability. */
  readonly buildings: BuildingStore;

  /**
   * Containers owned by storing buildings — a side-table keyed by building id
   * (ADR-004 §4, ADR-011). Only buildings that store have an entry.
   */
  readonly buildingStorage: Map<BuildingId, Container>;

  /**
   * Cumulative crop activity. Maintained by an event SUBSCRIBER, not derived —
   * "ever harvested" cannot be recomputed from the current crop map (ADR-008).
   */
  readonly cropStats: CropStats;

  /**
   * The player's coins — a conserved integer resource in its container
   * (ADR-013). Written only through `addCoins`/`spendCoins`, from command
   * handlers only.
   */
  readonly wallet: Wallet;

  /**
   * Pricing state: per-item multipliers (sparse) and the land-expansion
   * counter. Depressed by sale commands; recovered by `economySystem` (§6.2).
   */
  readonly economy: EconomyState;

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

/** Base inventory slots, before any storage shed. GAME_DESIGN.md §7. */
const BASE_INVENTORY_SLOTS = 40;

/**
 * Optional dependencies supplied when the world is built.
 *
 * INJECTED AT CONSTRUCTION, never through a setter: a world's dependencies are
 * fixed the moment it exists, so no later caller can redirect them and no test
 * can observe a half-wired world.
 *
 * These carry SIMULATION types only. A rejection reports a `Command` and an
 * `AppError`; what a consumer does with that — a UI message, a log line, a
 * replay annotation — is the consumer's business. The world must not know a
 * view exists (`ARCHITECTURE.md` §2).
 */
export interface WorldOptions {
  /** Notified when an accepted command fails at execution (ADR-010 §7). */
  readonly onExecutionRejected?: CommandDispatcherOptions['onExecutionRejected'];
}

/**
 * Narrows world options to dispatcher options.
 *
 * Built explicitly rather than spread: `exactOptionalPropertyTypes` treats an
 * absent property and one set to `undefined` as different types, and the
 * dispatcher's is absent-or-present.
 */
function dispatcherOptions(options: WorldOptions): CommandDispatcherOptions {
  return options.onExecutionRejected === undefined
    ? {}
    : { onExecutionRejected: options.onExecutionRejected };
}

export function createWorld(seed: number, options: WorldOptions = {}): World {
  const tileKinds = createTileKindRegistry();
  registerCoreTileKinds(tileKinds);

  const cropRegistry = createCropRegistry();
  registerCoreCrops(cropRegistry);

  const itemRegistry = createItemRegistry();
  registerCoreItems(itemRegistry);

  const buildingRegistry = createBuildingRegistry();
  registerCoreBuildings(buildingRegistry);

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
    workers: createWorkerStore(),
    cropRegistry,
    itemRegistry,
    inventory: createContainer(BASE_INVENTORY_SLOTS),
    buildingRegistry,
    buildings: createBuildingStore(),
    buildingStorage: new Map(),
    cropStats,
    // The opening balance is the declared source `GAME_DESIGN.md` §6.4 names:
    // coins enter at world creation and thereafter only at sale boundaries.
    wallet: createWallet(STARTING_COINS),
    economy: createEconomyState(),
    events,
    // Reads `world` lazily. The closure runs at dispatch time, never during
    // construction, so the self-reference is sound — and it is what keeps the
    // dispatcher bound to exactly one world (ADR-010 §8).
    commands: createCommandDispatcher(() => world, dispatcherOptions(options)),
    ids: createIdAllocator(),
    snapshots: createSnapshotState(),
  };

  // Wire the consumer before any command can publish.
  attachCropStats(events, cropStats, () => world.tick);

  // Explicit registration, not discovery: the command set must not depend on
  // import order (ADR-010 §8).
  registerCropCommands(world.commands);
  registerWorkerCommands(world.commands);
  registerBuildingCommands(world.commands);
  registerCommerceCommands(world.commands);

  return world;
}
