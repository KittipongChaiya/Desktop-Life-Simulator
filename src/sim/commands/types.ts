/**
 * Command types. ADR-010.
 *
 * A command is PLAIN SERIALIZABLE DATA: a type tag plus primitive fields, never
 * a closure and never a reference into a store (ADR-010 §5). That is what makes
 * `seed + ordered command stream` a complete replay format for free, and it is
 * the one property a future session is most likely to break silently — a
 * `TileIndex` object or a callback in a payload will serialize and will not
 * reproduce.
 *
 * Fields are therefore RAW `number` and `string`, not branded IDs. A command
 * arriving from a replay file (later, a network peer) is untrusted input, so
 * branding it at the type level would be a lie the compiler cannot check.
 * Validation is the parse step that turns raw fields into branded values
 * (`CODE_STYLE.md` §1.2, `AI_RULES.md` §2.4).
 */

import type { BuildingId, ContentId, TileIndex, WorkerId } from '../../shared/ids';
import type { Result } from '../../shared/result';
import type { BuildingRegistry } from '../content/buildings';
import type { CropRegistry } from '../content/crops';
import type { ExpeditionRegistry } from '../content/expeditions';
import type { ItemRegistry } from '../content/items';
import type { RecipeRegistry } from '../content/recipes';
import type { ResourceNodeRegistry } from '../content/resource-nodes';
import type { RoleRegistry } from '../content/roles';
import type { TileKindRegistry } from '../content/tile-kinds';
import type { WeatherKindRegistry } from '../content/weather-kinds';
import type { IdAllocator } from '../entities/id-allocator';
import type { EventBus } from '../events/bus';
import type { BuildingStore } from '../world/building';
import type { Container } from '../world/container';
import type { ContractStats, ContractStore } from '../world/contracts';
import type { CropStore } from '../world/crop';
import type { EconomyState } from '../world/economy';
import type { ExpeditionStore } from '../world/expedition';
import type { FactoryStore } from '../world/factory';
import type { QuestLog } from '../world/quests';
import type { RouteStore } from '../world/route';
import type { TileGrid } from '../world/tile-grid';
import type { Wallet } from '../world/wallet';
import type { WorkerStore } from '../world/worker';

/**
 * Who issued a command.
 *
 * Recorded on every dispatch so a replay can attribute the stream, and so the
 * "worker AI got a privileged shortcut" failure mode (ADR-010 §6) is visible in
 * the data rather than hidden in a call path.
 */
export const CommandSource = {
  Player: 'player',
  Worker: 'worker',
  Automation: 'automation',
  Replay: 'replay',
} as const;

export type CommandSource = (typeof CommandSource)[keyof typeof CommandSource];

export interface TillTileCommand {
  readonly type: 'tillTile';
  readonly tile: number;
}

export interface PlantCropCommand {
  readonly type: 'plantCrop';
  readonly tile: number;
  readonly cropId: string;
}

export interface HarvestCropCommand {
  readonly type: 'harvestCrop';
  readonly tile: number;
}

/**
 * Hire a worker. Carries no fields: the worker spawns at the plot centre and its
 * cost is derived from the current headcount (§4.1), so the command stays a bare
 * intent that serializes and replays identically.
 */
export interface HireWorkerCommand {
  readonly type: 'hireWorker';
}

/**
 * Empty a worker's hold into storage. Worker-only, so it names the worker
 * explicitly (a player never deposits a worker's hold). The destination is a
 * storage building — chosen by the target-selection service (ADR-011) — or the
 * player inventory when no shed has room.
 */
export interface DepositWorkerCommand {
  readonly type: 'depositWorker';
  readonly worker: number;
  /** Storage building to deposit into, or null for the player inventory. */
  readonly storage: number | null;
}

/** Place a building on a tile. `GAME_DESIGN.md` §5.2. */
export interface PlaceBuildingCommand {
  readonly type: 'placeBuilding';
  readonly tile: number;
  readonly buildingId: string;
}

/**
 * Sell items from the player inventory at the market boundary (§6.2, ADR-013).
 * All-or-nothing: the whole quantity sells at the pre-sale multiplier's price,
 * then the multiplier decays once.
 */
export interface SellItemsCommand {
  readonly type: 'sellItems';
  readonly itemId: string;
  readonly quantity: number;
}

/**
 * Buy seeds for a crop at the fixed §3.1 price — the recurring sink that funds
 * the loop's entry edge (§6.4).
 */
export interface BuySeedsCommand {
  readonly type: 'buySeeds';
  readonly cropId: string;
  readonly quantity: number;
}

/**
 * Choose what a factory makes — or clear the choice with `null`.
 *
 * A command rather than inference (ADR-035 §5): a factory that read its input
 * buffer and decided would silently change product when a stray delivery
 * arrived. Changing it mid-craft cancels that craft and returns its inputs.
 */
export interface SetFactoryRecipeCommand {
  readonly type: 'setFactoryRecipe';
  readonly building: number;
  /** `null` clears the selection. */
  readonly recipeId: string | null;
}

/** Work a resource node in the wilds; its yield lands in the actor's hold. */
export interface GatherNodeCommand {
  readonly type: 'gatherNode';
  readonly worker: number;
  readonly tile: number;
}

/** Send a worker to a destination; supplies leave the farm (ADR-038 §5). */
export interface SendExpeditionCommand {
  readonly type: 'sendExpedition';
  readonly worker: number;
  readonly destination: string;
}

/**
 * Bring a worker home with their haul.
 *
 * Issued by `expeditionSystem`, never by the player — returning is not a
 * decision, it is a tick passing. It is still a COMMAND because a system has no
 * privileged write path either (ADR-010 §6), and the command refuses to run
 * early, so nothing can shorten a trip by dispatching it.
 */
export interface ReturnExpeditionCommand {
  readonly type: 'returnExpedition';
  readonly worker: number;
}

/** Declare a standing instruction to move one item between two buildings. */
export interface AddRouteCommand {
  readonly type: 'addRoute';
  readonly from: number;
  readonly to: number;
  readonly item: string;
}

/** Withdraw a route. Workers part-way through it are not interrupted. */
export interface RemoveRouteCommand {
  readonly type: 'removeRoute';
  readonly route: number;
}

/** A worker collects route goods at the source (ADR-011 section 6's near end). */
export interface HaulPickupCommand {
  readonly type: 'haulPickup';
  readonly worker: number;
  readonly route: number;
}

/** A worker delivers route goods at the destination (the far end). */
export interface HaulDeliverCommand {
  readonly type: 'haulDeliver';
  readonly worker: number;
  readonly route: number;
}

/**
 * Sell a placed building back for 50% of its cost (§5.2). A storing building
 * sells only once its container is empty — the refund never destroys goods
 * (ADR-011 §7).
 */
export interface SellBuildingCommand {
  readonly type: 'sellBuilding';
  readonly building: number;
}

/**
 * Credit the wallet directly — the declared DEV-ONLY source (ADR-013: money
 * enters only at declared sources; this one is declared here). Reached through
 * the devtools console's `money` command and the test suites; no gameplay
 * surface issues it.
 */
export interface GrantCoinsCommand {
  readonly type: 'grantCoins';
  readonly amount: number;
}

/**
 * Buy the next ring of land (§6.3). Carries no fields: the cost derives from
 * `expansionsPurchased`, exactly as `hireWorker` derives from headcount, so
 * the command serializes and replays identically.
 */
export interface ExpandLandCommand {
  readonly type: 'expandLand';
}

/**
 * Every command the simulation accepts.
 *
 * A new gameplay action is a new member here plus a registered handler — never
 * a new exported mutator (ADR-010 §Consequences).
 */
/**
 * Enable or disable a content source (phase-09g, ADR-019 §7).
 *
 * World state rather than a preference: two players with one seed and different
 * enabled sets have different worlds.
 */
export interface SetSourceEnabledCommand {
  readonly type: 'setSourceEnabled';
  readonly source: string;
  readonly enabled: boolean;
}

/**
 * Accept a notice-board offer (phase-20, ADR-032 §2). Carries only the
 * offer's derivation identity; execution re-derives the terms and freezes
 * them into the contract store.
 */
export interface AcceptContractCommand {
  readonly type: 'acceptContract';
  readonly offerId: number;
}

/** Deliver an accepted contract in full: goods leave, the frozen reward lands. */
export interface DeliverContractCommand {
  readonly type: 'deliverContract';
  readonly offerId: number;
}

/** Assign a registered role to a worker (phase-14c, ADR-024 §2). */
export interface AssignRoleCommand {
  readonly type: 'assignRole';
  readonly worker: WorkerId;
  readonly role: ContentId;
}

/** Set or clear a worker's work zone. An empty list clears it. */
export interface SetWorkerZoneCommand {
  readonly type: 'setWorkerZone';
  readonly worker: WorkerId;
  readonly tiles: readonly TileIndex[];
}

export type Command =
  | AssignRoleCommand
  | SetWorkerZoneCommand
  | TillTileCommand
  | PlantCropCommand
  | HarvestCropCommand
  | HireWorkerCommand
  | DepositWorkerCommand
  | PlaceBuildingCommand
  | SellItemsCommand
  | BuySeedsCommand
  | SellBuildingCommand
  | SetFactoryRecipeCommand
  | AddRouteCommand
  | RemoveRouteCommand
  | HaulPickupCommand
  | HaulDeliverCommand
  | GatherNodeCommand
  | SendExpeditionCommand
  | ReturnExpeditionCommand
  | GrantCoinsCommand
  | ExpandLandCommand
  | SetSourceEnabledCommand
  | AcceptContractCommand
  | DeliverContractCommand;

export type CommandType = Command['type'];

/** Narrows the union to the command matching a type tag. */
export type CommandOf<T extends CommandType> = Extract<Command, { readonly type: T }>;

/**
 * The writable surface of the world that commands may touch.
 *
 * A STRUCTURAL VIEW rather than `World` itself, for the same reason `TileQuery`
 * is one: `world.ts` must import the command layer to wire the dispatcher, so
 * the command layer importing `World` back would be an import cycle
 * (`CODE_STYLE.md` §7.4). `World` satisfies this shape structurally.
 *
 * It doubles as documentation of ADR-010 §1: this is the entire set of stores a
 * command handler is permitted to write.
 */
export interface CommandWorld {
  readonly tick: number;
  /** Installed content sources, for validating an enablement change (09g). */
  readonly sources: readonly { readonly id: string }[];
  /** Sources switched off. The only thing `setSourceEnabled` writes. */
  readonly disabledSources: Set<string>;
  readonly tiles: TileGrid;
  /** Tile-kind definitions, for the walkability check when placing a building. */
  readonly tileKinds: TileKindRegistry;
  readonly crops: CropStore;
  readonly cropRegistry: CropRegistry;
  readonly events: EventBus;
  /** Hired workers. Written by `hireWorker` (phase-04). */
  readonly workers: WorkerStore;
  /** Deterministic id allocation for spawns (ADR-004). */
  readonly ids: IdAllocator;
  /** The player inventory — a harvest's default destination (ADR-011). */
  readonly inventory: Container;
  /** Item definitions, for stack sizes when depositing yields (ADR-011). */
  readonly itemRegistry: ItemRegistry;
  /** Placed buildings. Written by `placeBuilding` (phase-05). */
  readonly buildings: BuildingStore;
  /** Containers owned by storing buildings (ADR-011). */
  readonly buildingStorage: Map<BuildingId, Container>;
  /** Recipe definitions — which building kinds are factories (ADR-035 §1). */
  readonly recipeRegistry: RecipeRegistry;
  /** Production state for factories. Written by placement and by the recipe command. */
  readonly factories: FactoryStore;
  /** Standing logistics instructions (ADR-036 section 2). Written by route commands. */
  readonly routes: RouteStore;
  /** Registered wild node kinds (ADR-037 section 5). */
  readonly resourceNodeRegistry: ResourceNodeRegistry;
  /** When each wild node was last worked (ADR-037 section 3). */
  readonly harvestedAt: Map<TileIndex, number>;
  /** Registered expedition destinations (ADR-038 section 1). */
  readonly expeditionRegistry: ExpeditionRegistry;
  /** Workers currently away, keyed by worker (ADR-038 section 3). */
  readonly expeditions: ExpeditionStore;
  /** Building definitions, for placement validation and storage size. */
  readonly buildingRegistry: BuildingRegistry;
  /** The player's coins. Written by commerce commands only (phase-06). */
  readonly wallet: Wallet;
  /** Pricing state — multipliers and the expansion counter (phase-06). */
  readonly economy: EconomyState;
  /**
   * Last crop planted per tile — the seed bin's memory (06c). Written by
   * `plantCrop`; read by worker task selection when a seed bin stands.
   */
  readonly lastPlanted: Map<TileIndex, ContentId>;

  /**
   * The calendar's frozen inputs, for the out-of-season plant rejection
   * (ADR-021 §2). Read, never written — the season is derived from the tick.
   */
  readonly ticksPerDay: number;
  readonly daysPerSeason: number;
  readonly seasons: readonly string[];
  /** Registered roles, for `assignRole` (phase-14c). */
  readonly roleRegistry: RoleRegistry;

  /**
   * What weather-modulated growth reads (ADR-022 §4). `World` satisfies this
   * structurally, so no caller changed — the fields were already there.
   */
  readonly seed: number;
  readonly ticksPerWeatherPeriod: number;
  readonly weatherKindRegistry: WeatherKindRegistry;

  /** Accepted contracts. Written by the contract commands and the expiry step (ADR-032). */
  readonly contracts: ContractStore;
  /** Fulfilled/expired counters — event-maintained (ADR-032 §6). */
  readonly contractStats: ContractStats;
  /** Quest payout watermarks — written only by the quest step (ADR-034 §4). */
  readonly quests: QuestLog;
}

/**
 * The outcome of a validation pass. Carries no value — validation answers
 * "may this proceed", never "what happened".
 */
export type ValidationResult = Result<void>;

/**
 * Provenance recorded at dispatch. Serializable, and derived from no clock —
 * `dispatchedTick` reads `world.tick`, the simulation's only notion of time
 * (ADR-010 §4).
 */
export interface CommandMetadata {
  /** Monotonic per dispatcher, assigned only to ACCEPTED commands. */
  readonly id: number;
  readonly source: CommandSource;
  readonly dispatchedTick: number;
  /**
   * The specific entity that issued the command, when one applies — a worker's
   * id for a worker-sourced action. Lets a worker's harvest deposit into ITS
   * hold; a player action has no actor and defaults to the player inventory.
   * Provenance data, an extension of `source` (ADR-010 §4).
   */
  readonly actor?: number;
}

/**
 * The outcome of `dispatch`.
 *
 * `ok` means ACCEPTED AND QUEUED — not executed. Execution happens in
 * `preUpdate` of the next tick and may still fail (ADR-010 §3).
 */
export type CommandResult = Result<CommandMetadata>;

/** What a handler receives at execution time. */
export interface CommandContext {
  readonly world: CommandWorld;
  readonly metadata: CommandMetadata;
}

/**
 * A registered command's two halves.
 *
 * `validate` is PURE and must not mutate — it runs at dispatch to give the
 * caller immediate feedback. `execute` re-validates, because the world can
 * change between dispatch and execution (ADR-010 §3).
 */
export interface CommandDefinition<T extends CommandType> {
  readonly validate: (world: CommandWorld, command: CommandOf<T>) => ValidationResult;
  readonly execute: (context: CommandContext, command: CommandOf<T>) => ValidationResult;
}

/** A command accepted at dispatch and awaiting its tick boundary. */
export interface QueuedCommand {
  readonly command: Command;
  readonly metadata: CommandMetadata;
  /** Caller-supplied de-duplication key, if any. See `CommandQueue`. */
  readonly key?: string;
}
