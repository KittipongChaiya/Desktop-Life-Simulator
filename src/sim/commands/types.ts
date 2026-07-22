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

import type { Result } from '../../shared/result';
import type { CropRegistry } from '../content/crops';
import type { ItemRegistry } from '../content/items';
import type { IdAllocator } from '../entities/id-allocator';
import type { EventBus } from '../events/bus';
import type { Container } from '../world/container';
import type { CropStore } from '../world/crop';
import type { TileGrid } from '../world/tile-grid';
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
 * explicitly (a player never deposits a worker's hold). In v0.1 the destination
 * is the player inventory; a storage shed becomes the target in phase-06.
 */
export interface DepositWorkerCommand {
  readonly type: 'depositWorker';
  readonly worker: number;
}

/**
 * Every command the simulation accepts.
 *
 * A new gameplay action is a new member here plus a registered handler — never
 * a new exported mutator (ADR-010 §Consequences).
 */
export type Command =
  | TillTileCommand
  | PlantCropCommand
  | HarvestCropCommand
  | HireWorkerCommand
  | DepositWorkerCommand;

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
  readonly tiles: TileGrid;
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
