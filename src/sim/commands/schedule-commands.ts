/**
 * Schedule commands. Phase-14c — ADR-024 §4, ADR-010 §1.
 *
 * A schedule is simulation state, so changing one is a **command**: validated,
 * rejectable, queued, applied on a tick boundary, and in the replay stream
 * like any other player action. There is no exported mutator, because a second
 * write path is how determinism stops being checkable.
 *
 * Two commands, and the split is deliberate. A **role** is content — a named
 * bundle a source ships — so assigning one names an id the engine looks up. A
 * **zone** is a set of tile indices, which are facts about this farm and this
 * player's intent, so it is passed directly. Roles cannot carry zones for the
 * same reason (`roles.ts`).
 *
 * Every rejection is TYPED. "Nothing happened" is the worst answer a command
 * can give (ADR-010 §5), and a schedule that silently failed to apply is a
 * player watching a worker ignore an instruction.
 */

import { appError, ErrorCode } from '../../shared/errors';
import type { ContentId, TileIndex, WorkerId } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { isSatisfiableRole } from '../content/roles';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

/** Checks that a worker exists and a role is one the engine knows. */
export function validateAssignRole(
  world: CommandWorld,
  worker: WorkerId,
  role: ContentId,
): ValidationResult {
  if (!world.workers.has(worker)) {
    return err(appError(ErrorCode.InvalidIntent, 'no such worker', { worker }));
  }

  const definition = world.roleRegistry.get(role);
  if (!definition.ok) return err(definition.error);

  // Registration already refuses these, so reaching one here means content
  // changed under a save. Refused rather than applied, because the failure a
  // player would see is a worker that stopped for no visible reason.
  if (!isSatisfiableRole(definition.value)) {
    return err(appError(ErrorCode.InvalidIntent, 'role can never permit any work', { role }));
  }

  return ok();
}

/**
 * Replaces a worker's schedule with a role's.
 *
 * The zone is PRESERVED across the change: a role cannot express one, so
 * assigning a role must not silently clear where a player told a worker to
 * work. Everything a role can express, it replaces.
 */
export function assignRole(world: CommandWorld, worker: WorkerId, role: ContentId): Result<void> {
  const validation = validateAssignRole(world, worker, role);
  if (!validation.ok) return validation;

  const record = world.workers.get(worker);
  const definition = world.roleRegistry.get(role);
  if (record === undefined || !definition.ok) return ok(); // settled above

  const { taskKinds, shift, priority } = definition.value;
  record.schedule = {
    ...(record.schedule.zone === undefined ? {} : { zone: record.schedule.zone }),
    ...(taskKinds === undefined ? {} : { taskKinds }),
    ...(shift === undefined ? {} : { shift }),
    ...(priority === undefined ? {} : { priority }),
  };

  return ok();
}

/** Checks a worker exists before its zone is set. */
export function validateSetWorkerZone(world: CommandWorld, worker: WorkerId): ValidationResult {
  if (!world.workers.has(worker)) {
    return err(appError(ErrorCode.InvalidIntent, 'no such worker', { worker }));
  }
  return ok();
}

/**
 * Sets or clears a worker's zone.
 *
 * An EMPTY tile list clears the zone rather than confining the worker to
 * nowhere. That is the one place absent-versus-empty is resolved in the
 * player's favour: a UI that hands back an empty selection means "no zone",
 * and reading it as "work nowhere" would idle a worker on a mis-click.
 */
export function setWorkerZone(
  world: CommandWorld,
  worker: WorkerId,
  tiles: readonly TileIndex[],
): Result<void> {
  const validation = validateSetWorkerZone(world, worker);
  if (!validation.ok) return validation;

  const record = world.workers.get(worker);
  if (record === undefined) return ok();

  // Rebuilt WITHOUT the zone key, rather than destructured past it: an
  // unused binding is a lint error, and `delete` on a copy would mutate an
  // object the caller may still hold.
  const rest = Object.fromEntries(
    Object.entries(record.schedule).filter(([field]) => field !== 'zone'),
  ) as typeof record.schedule;

  record.schedule = tiles.length === 0 ? rest : { ...rest, zone: new Set(tiles) };

  return ok();
}

export function registerScheduleCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('assignRole', {
    validate: (world, command) => validateAssignRole(world, command.worker, command.role),
    execute: (context, command) => assignRole(context.world, command.worker, command.role),
  });

  dispatcher.register('setWorkerZone', {
    validate: (world, command) => validateSetWorkerZone(world, command.worker),
    execute: (context, command) => setWorkerZone(context.world, command.worker, command.tiles),
  });
}
