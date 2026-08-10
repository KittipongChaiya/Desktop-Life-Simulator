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
import type { ItemRegistry } from '../content/items';
import type { RoleRegistry } from '../content/roles';
import type { TileKindRegistry } from '../content/tile-kinds';
import type { WeatherKindRegistry } from '../content/weather-kinds';
import type { IdAllocator } from '../entities/id-allocator';
import type { EventBus } from '../events/bus';
import type { BuildingStore } from '../world/building';
import type { Container } from '../world/container';
import type { CropStore } from '../world/crop';
import type { EconomyState } from '../world/economy';
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
  | GrantCoinsCommand
  | ExpandLandCommand
  | SetSourceEnabledCommand;

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
