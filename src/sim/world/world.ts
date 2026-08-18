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
  DEFAULT_DAYS_PER_SEASON,
  DEFAULT_TICKS_PER_DAY,
  DEFAULT_TICKS_PER_WEATHER_PERIOD,
} from '../../shared/constants';
import type { BuildingId, ContentId, TileIndex } from '../../shared/ids';
import { registerBuildingCommands } from '../commands/building-commands';
import { registerCommerceCommands } from '../commands/commerce-commands';
import { registerContractCommands } from '../commands/contract-commands';
import { registerCropCommands } from '../commands/crop-commands';
import {
  createCommandDispatcher,
  type CommandDispatcher,
  type CommandDispatcherOptions,
} from '../commands/dispatcher';
import { registerFactoryCommands } from '../commands/factory-commands';
import { registerHaulCommands } from '../commands/haul-commands';
import { registerScheduleCommands } from '../commands/schedule-commands';
import { registerSourceCommands } from '../commands/source-commands';
import { registerWorkerCommands } from '../commands/worker-commands';
import type { BuildingRegistry } from '../content/buildings';
import type { CropRegistry } from '../content/crops';
import { createInstalledRegistries, installedSources } from '../content/installed';
import type { ItemRegistry } from '../content/items';
import type { PhaseTintRegistry } from '../content/lighting';
import type { RecipeRegistry } from '../content/recipes';
import type { ResourceNodeRegistry } from '../content/resource-nodes';
import type { RoleRegistry } from '../content/roles';
import { seasonOrder, type SeasonRegistry } from '../content/seasons';
import type { ContentSource } from '../content/sources';
import type { TileKindRegistry } from '../content/tile-kinds';
import type { WeatherKindRegistry } from '../content/weather-kinds';
import { createIdAllocator, type IdAllocator } from '../entities/id-allocator';
import { createEventBus, type EventBus } from '../events/bus';
import { createRng, type Rng } from '../rng/rng';
import { createSnapshotState, type SnapshotState } from '../snapshot/state';
import { DAY_PHASES } from '../time/game-clock';

import { createBuildingStore, type BuildingStore } from './building';
import { createContainer, type Container } from './container';
import {
  createContractStats,
  createContractStore,
  type ContractStats,
  type ContractStore,
} from './contracts';
import { createCropStore, type CropStore } from './crop';
import { attachCropStats, createCropStats, type CropStats } from './crop-stats';
import { createEconomyState, plotSizeAfter, type EconomyState } from './economy';
import { createFactoryStore, type FactoryStore } from './factory';
import { createQuestLog, type QuestLog } from './quests';
import { createRouteStore, type RouteStore } from './route';
import { claimCenteredPlot, createTileGrid, type TileGrid } from './tile-grid';
import { foundTown } from './town';
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

  /**
   * Registered recipe definitions (ADR-035 §1). A factory stores the id of the
   * one it was set to run and looks the definition up here.
   *
   * Which recipes a building kind can run is a QUERY over this registry
   * (`recipesFor`), never a list on the building — that direction is what lets
   * a content pack add a recipe to the first-party mill without editing core.
   */
  readonly recipeRegistry: RecipeRegistry;

  /** Registered resource-node kinds (ADR-037 §5). `nodeAt` reads this. */
  readonly resourceNodeRegistry: ResourceNodeRegistry;
  /**
   * Phase → tint, for the lighting layer only.
   *
   * Carried here because this is where a world's registries live, NOT because
   * the simulation uses it: ADR-020 §4 forbids any simulation system reading
   * lighting, and nothing in `src/sim` does. A rule that wants "it is dark"
   * reads the phase.
   */
  readonly phaseTintRegistry: PhaseTintRegistry;

  /**
   * The seasons a content source registered.
   *
   * Distinct from `seasons`, which is this world's FROZEN order: the registry
   * is what is installed now, the list is what this world was built with. They
   * agree on a fresh world and may not on a loaded one, which is the point.
   */
  readonly seasonRegistry: SeasonRegistry;
  /** Registered roles — named constraint bundles (ADR-024 §2). */
  readonly roleRegistry: RoleRegistry;

  /** Placed buildings, keyed by id. Sparse. Each blocks its tile's walkability. */
  readonly buildings: BuildingStore;

  /**
   * Containers owned by storing buildings — a side-table keyed by building id
   * (ADR-004 §4, ADR-011). Only buildings that store have an entry.
   */
  readonly buildingStorage: Map<BuildingId, Container>;

  /**
   * Production state for buildings a recipe names — a side-table keyed by
   * building id (ADR-035 §2). Only factories have an entry.
   *
   * SEPARATE from `buildingStorage` on purpose, and not an oversight to be
   * tidied later: that map is general storage, and `selectStorageTarget` picks
   * the nearest building with space blind to kind. A mill's input buffer
   * living there would have workers fill it with whatever they were carrying,
   * leaving no slots for the wheat the recipe needs and no error anywhere to
   * explain why the mill stopped.
   */
  readonly factories: FactoryStore;

  /**
   * Standing logistics instructions (ADR-036 section 2). The player's, never
   * inferred: a system that guessed routes from recipes would move goods
   * nobody asked to move.
   */
  readonly routes: RouteStore;

  /**
   * When each wild tile's node was last worked (phase-27, ADR-037 §3).
   *
   * The ONLY stored part of the wilds. What stands on a tile is derived from a
   * hash of (seed, tile) and costs the save nothing; this map records the one
   * thing a hash cannot know. Sparse, and PRUNED once a node has regrown, so
   * it holds only recently-worked tiles and cannot grow without bound however
   * long a world runs.
   */
  readonly harvestedAt: Map<TileIndex, number>;

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
   * Last crop planted per tile — the seed bin's memory (06c, `GAME_DESIGN.md`
   * §5). Written on every successful plant whether or not a bin stands
   * (recording is free); worker task selection reads it only when one does.
   */
  readonly lastPlanted: Map<TileIndex, ContentId>;

  /**
   * Accepted contracts, terms frozen at acceptance (phase-20, ADR-032 §2).
   * Written only by the contract commands and the expiry step.
   */
  readonly contracts: ContractStore;

  /** Fulfilled/expired counters — event-maintained, not derivable (ADR-032 §6). */
  readonly contractStats: ContractStats;

  /**
   * Quest payout watermarks (phase-22, ADR-034 §4). Chain progress derives
   * from the counters; this records only what has already been paid.
   */
  readonly quests: QuestLog;

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

  /**
   * The content sources this world was built from, in load order.
   *
   * Recorded so a save can name what is missing when a source is gone
   * (ADR-026 §4). Nothing reads a source's provenance to decide anything —
   * that is ADR-026 §2, and `tests/provenance-blindness.test.ts` enforces it.
   */
  readonly sources: readonly ContentSource[];

  /**
   * Sources the player has switched off. World state, not a preference
   * (ADR-019 §7): two players with one seed and different sets have different
   * worlds.
   */
  readonly disabledSources: Set<string>;

  /**
   * This world's day length, in ticks. Frozen at creation (ADR-020 §2).
   *
   * Read by the calendar derivations, never written after construction: change
   * it on a live world and every past day renumbers underneath the player.
   */
  readonly ticksPerDay: number;

  /** This world's day phases, in order. Frozen at creation (ADR-020 §3). */
  readonly dayPhases: readonly string[];

  /**
   * The season's length in days, frozen at creation (ADR-021 §1).
   *
   * Same rule as `ticksPerDay`, one level up: change it on a live world and
   * every season the player has lived through renumbers.
   */
  readonly daysPerSeason: number;

  /**
   * This world's seasons, in the order they occur. Frozen at creation.
   *
   * Taken from the season registry once, so the year a world runs on is the
   * one it was created with — not the one today's installed content would
   * produce (ADR-021 §1).
   */
  readonly seasons: readonly string[];

  /**
   * The weather period's length in ticks, frozen at creation (ADR-022 §1).
   *
   * Persisted in v5 for the same reason as the day and season constants:
   * changing it re-derives every past period, which changes the rainfall
   * history phase-12b computes wetness from.
   */
  readonly ticksPerWeatherPeriod: number;

  /**
   * Weather kinds a content source registered.
   *
   * NOT frozen into the save, unlike `seasons`. A world's weather history is
   * recomputed from whatever kinds are installed, so adding a kind changes what
   * it rained last Tuesday. That is tolerable exactly because ADR-022 §5 makes
   * rain a convenience and never a requirement — and it is recorded rather than
   * assumed in `docs/phases/phase-12-weather-simulation.md`.
   */
  readonly weatherKindRegistry: WeatherKindRegistry;
}

/** Base inventory slots, before any storage shed. GAME_DESIGN.md §7. */
export const BASE_INVENTORY_SLOTS = 40;

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
  /**
   * Sources the player has switched off, restored from the save (ADR-019 §7).
   *
   * Absent means nothing is disabled, which is what a v1 save migrates to and
   * what a fresh world starts as.
   */
  readonly disabledSources?: readonly string[];
  /**
   * The day's length, restored from a save. Absent means a NEW world, which
   * takes the current default and freezes it (ADR-020 §2).
   */
  readonly ticksPerDay?: number;
  /** The day's phases, restored from a save. Absent means the current set. */
  readonly dayPhases?: readonly string[];
  /** The season's length, restored from a save. Absent takes the default. */
  readonly daysPerSeason?: number;
  /** The season order, restored from a save. Absent takes the registry's. */
  readonly seasons?: readonly string[];
  /** The weather period's length, restored from a save. */
  readonly ticksPerWeatherPeriod?: number;
  /**
   * `false` defers the town (ADR-030 §3). HYDRATION's flag, nobody else's: a
   * loaded world must restore its saved state first and found the town only if
   * the save predates one — construction founding it here would allocate
   * building ids the document is about to reuse. Absent means a new world,
   * which gets its town immediately.
   */
  readonly foundTown?: boolean;
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
  // Content comes from the installed sources, through the public API — the
  // engine no longer knows which content exists (ADR-019 §2, ADR-026 §2).
  // `plugins/core/` installs itself when imported; the composition root and the
  // test runner do that, and phase-09's loader will do it per discovered source.
  const {
    resourceNodes: resourceNodeRegistry,
    crops: cropRegistry,
    items: itemRegistry,
    buildings: buildingRegistry,
    recipes: recipeRegistry,
    tileKinds,
    phaseTints: phaseTintRegistry,
    seasons: seasonRegistry,
    roles: roleRegistry,
    weatherKinds: weatherKindRegistry,
  } = createInstalledRegistries();

  const tiles = createTileGrid();
  // Every tile defaults to kind index 0, which is core:grass by registration
  // order — so an all-zero grid is a valid grass world with no fill pass.
  // The 8×8 start is `plotSizeAfter(0)` — the same formula `expandLand` grows.
  claimCenteredPlot(tiles, plotSizeAfter(0));

  const events = createEventBus();
  const cropStats = createCropStats();

  const world: World = {
    seed,
    sources: installedSources(),
    ticksPerDay: options.ticksPerDay ?? DEFAULT_TICKS_PER_DAY,
    dayPhases: options.dayPhases ?? [...DAY_PHASES],
    daysPerSeason: options.daysPerSeason ?? DEFAULT_DAYS_PER_SEASON,
    seasons: options.seasons ?? seasonOrder(seasonRegistry),
    ticksPerWeatherPeriod: options.ticksPerWeatherPeriod ?? DEFAULT_TICKS_PER_WEATHER_PERIOD,
    disabledSources: new Set(options.disabledSources ?? []),
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
    recipeRegistry,
    resourceNodeRegistry,
    phaseTintRegistry,
    seasonRegistry,
    roleRegistry,
    weatherKindRegistry,
    buildings: createBuildingStore(),
    buildingStorage: new Map(),
    factories: createFactoryStore(),
    routes: createRouteStore(),
    harvestedAt: new Map(),
    cropStats,
    // The opening balance is the declared source `GAME_DESIGN.md` §6.4 names:
    // coins enter at world creation and thereafter only at sale boundaries.
    wallet: createWallet(STARTING_COINS),
    economy: createEconomyState(),
    lastPlanted: new Map(),
    contracts: createContractStore(),
    contractStats: createContractStats(),
    quests: createQuestLog(),
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
  registerSourceCommands(world.commands);
  registerScheduleCommands(world.commands);
  registerBuildingCommands(world.commands);
  registerCommerceCommands(world.commands);
  registerContractCommands(world.commands);
  registerFactoryCommands(world.commands);
  registerHaulCommands(world.commands);

  // The village stands before the first tick (ADR-030 §3). Hydration defers
  // it — see `WorldOptions.foundTown` — and re-founds after restoring.
  if (options.foundTown !== false) foundTown(world);

  return world;
}
