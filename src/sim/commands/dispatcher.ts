/**
 * The command dispatcher. ADR-010.
 *
 * THE ONLY WRITE PATH INTO THE SIMULATION. Player input, worker AI, automation,
 * and replay all arrive here and are treated identically; none of them gets a
 * shortcut, because the moment one does, replay stops reproducing (§6).
 *
 *   dispatch  →  validate (pure)  →  queue          [immediate, no mutation]
 *   drain     →  re-validate      →  execute        [preUpdate, next tick]
 *             →  publish                            [flushed in postUpdate]
 *
 * NO GLOBAL STATE, NO RUNTIME DISCOVERY (§8). Handlers are registered
 * explicitly into an instance created per world, exactly as systems register
 * into the scheduler. Discovery would make the command set depend on import
 * order; a module singleton would stop two worlds coexisting in one process.
 */

import { appError, ErrorCode, type AppError } from '../../shared/errors';
import { err, ok } from '../../shared/result';

import { createCommandQueue } from './queue';
import type {
  Command,
  CommandContext,
  CommandDefinition,
  CommandMetadata,
  CommandOf,
  CommandResult,
  CommandSource,
  CommandType,
  CommandWorld,
  ValidationResult,
} from './types';

export interface DispatchOptions {
  /**
   * Who is issuing this command. REQUIRED — there is no default, because a
   * wrong default would silently attribute a worker's action to the player and
   * make a replay lie about its own provenance.
   */
  readonly source: CommandSource;
  /**
   * Optional de-duplication key. A second command carrying a key already
   * pending is rejected. Opt-in rather than automatic: two identical commands
   * in one tick are sometimes legitimate (selling two of an item), so
   * collapsing them by default would be wrong.
   */
  readonly key?: string;
}

export interface CommandDispatcherOptions {
  /**
   * Called when a command that was accepted at dispatch fails at execution.
   *
   * Execution-time rejection is ordinary — two workers racing for one crop —
   * but it must never vanish silently (`AI_RULES.md` §2.2). Mirrors the event
   * bus's `onHandlerError`.
   */
  readonly onExecutionRejected?: (
    command: Command,
    error: AppError,
    metadata: CommandMetadata,
  ) => void;
}

export interface CommandDispatcher {
  /** Registers a handler. Throws on a duplicate type — a startup-time bug. */
  register<T extends CommandType>(type: T, definition: CommandDefinition<T>): void;
  /**
   * Validates and queues a command.
   *
   * Returns immediately: `ok` means ACCEPTED AND QUEUED, never applied. The
   * world is not touched and no event is published (ADR-010 §2).
   */
  dispatch(command: Command, options: DispatchOptions): CommandResult;
  /** Executes every queued command in dispatch order. Returns the count drained. */
  drain(): number;
  /** Commands accepted but not yet executed. */
  pending(): number;
}

/**
 * A registered definition, erased to the full command union.
 *
 * A heterogeneous map cannot preserve the per-type narrowing that registration
 * has, so `register` wraps each definition in closures that re-narrow. The cast
 * inside them is sound by construction: the map is KEYED BY THE TYPE TAG and
 * looked up with `command.type`, so a definition can only ever be handed the
 * command shape it was registered for. It is an invariant the compiler cannot
 * express through a `Map`, not an assertion about unvalidated data
 * (`CODE_STYLE.md` §1.2).
 */
interface RegisteredCommand {
  readonly validate: (world: CommandWorld, command: Command) => ValidationResult;
  readonly execute: (context: CommandContext, command: Command) => ValidationResult;
}

export function createCommandDispatcher(
  readWorld: () => CommandWorld,
  options: CommandDispatcherOptions = {},
): CommandDispatcher {
  const definitions = new Map<CommandType, RegisteredCommand>();
  const queue = createCommandQueue();

  // Deterministic: a counter, never a clock or a random id. Two runs of the
  // same command stream produce the same ids (ADR-010 §4).
  let nextId = 1;

  return {
    register<T extends CommandType>(type: T, definition: CommandDefinition<T>): void {
      if (definitions.has(type)) {
        throw new Error(`command "${type}" already has a registered handler`);
      }
      definitions.set(type, {
        validate: (world, command) => definition.validate(world, command as CommandOf<T>),
        execute: (context, command) => definition.execute(context, command as CommandOf<T>),
      });
    },

    dispatch(command, dispatchOptions) {
      const definition = definitions.get(command.type);
      if (definition === undefined) {
        return err(
          appError(ErrorCode.InvalidIntent, 'no handler is registered for this command', {
            type: command.type,
          }),
        );
      }

      const { key } = dispatchOptions;
      if (key !== undefined && queue.has(key)) {
        return err(
          appError(ErrorCode.DuplicateCommand, 'an identical command is already queued', { key }),
        );
      }

      const world = readWorld();
      const validation = definition.validate(world, command);
      if (!validation.ok) return err(validation.error);

      const metadata: CommandMetadata = {
        id: nextId,
        source: dispatchOptions.source,
        dispatchedTick: world.tick,
      };
      // Incremented only on acceptance, so ids count real commands rather than
      // attempts — a rejected dispatch leaves no trace anywhere.
      nextId += 1;

      queue.enqueue(key === undefined ? { command, metadata } : { command, metadata, key });
      return ok(metadata);
    },

    drain() {
      const batch = queue.drain();
      if (batch.length === 0) return 0;

      const world = readWorld();
      for (const entry of batch) {
        const definition = definitions.get(entry.command.type);
        // Unreachable: dispatch rejects unregistered types, and registration
        // never removes. Handled rather than asserted so one impossible entry
        // could not abort the tick for every command behind it.
        if (definition === undefined) continue;

        const context: CommandContext = { world, metadata: entry.metadata };
        const outcome = execute(definition, context, entry.command);
        if (!outcome.ok) {
          options.onExecutionRejected?.(entry.command, outcome.error, entry.metadata);
        }
      }

      return batch.length;
    },

    pending: () => queue.size,
  };
}

/**
 * Runs a handler, converting a thrown error into a rejection.
 *
 * Handlers may throw only on programming errors. Catching here means one bad
 * handler rejects its own command instead of aborting the tick for every
 * command behind it in the queue (ADR-010 §7).
 */
function execute(
  definition: RegisteredCommand,
  context: CommandContext,
  command: Command,
): ValidationResult {
  try {
    return definition.execute(context, command);
  } catch (error) {
    return err(
      appError(ErrorCode.InvalidIntent, 'command handler threw', {
        type: command.type,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
