/**
 * Enabling and disabling content sources. Phase-09g — ADR-019 §7.
 *
 * **Enablement is world state, not a preference.** ADR-014 §4 draws the line:
 * opacity changes what the player SEES and lives in `settings.json`; disabling
 * a source changes what the world DOES, and two players with one seed and
 * different enabled sets have different worlds. So it is in the save, and it
 * changes through a command like every other world mutation (ADR-010 §1) —
 * which is also what makes it replayable, rejectable, and visible in the
 * command stream rather than a checkbox writing to a store.
 *
 * Disabling does not delete anything. The source's content stops being
 * registered on the next load, and its entities are quarantined by the ordinary
 * §5.3 path — the same route an uninstalled plugin takes, because to the save
 * they are the same event (ADR-026 §3). Re-enabling restores them. That is why
 * this command touches one set and nothing else.
 */

import { appError, ErrorCode } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld } from './types';

/**
 * A source may be disabled, but the engine's own content may not.
 *
 * `core` is not a plugin: disabling it would leave a world with no crops, no
 * items and no tile kinds, which is not a state the simulation can reach by any
 * other route and not one a player can recover from in the UI that disabled it.
 */
export const UNDISABLEABLE_SOURCES: readonly string[] = ['core'];

export function validateSetSourceEnabled(
  world: CommandWorld,
  source: string,
  enabled: boolean,
): Result<void> {
  if (typeof source !== 'string' || source.length === 0) {
    return err(
      appError(ErrorCode.InvalidIntent, 'malformed source id', { source: String(source) }),
    );
  }

  if (!enabled && UNDISABLEABLE_SOURCES.includes(source)) {
    return err(
      appError(ErrorCode.InvalidIntent, 'this content source cannot be disabled', { source }),
    );
  }

  // A source the world has never heard of is refused rather than silently
  // recorded: a typo would otherwise persist into the save as a disabled set
  // referencing nothing, and survive every future load.
  const known = world.sources.some((installed) => installed.id === source);
  if (!known) {
    return err(appError(ErrorCode.UnknownContent, 'no such content source', { source }));
  }

  return ok();
}

export function setSourceEnabled(
  world: CommandWorld,
  source: string,
  enabled: boolean,
): Result<void> {
  const validation = validateSetSourceEnabled(world, source, enabled);
  if (!validation.ok) return validation;

  if (enabled) world.disabledSources.delete(source);
  else world.disabledSources.add(source);

  return ok();
}

export function registerSourceCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('setSourceEnabled', {
    validate: (world, command) => validateSetSourceEnabled(world, command.source, command.enabled),
    execute: (context, command) => setSourceEnabled(context.world, command.source, command.enabled),
  });
}
