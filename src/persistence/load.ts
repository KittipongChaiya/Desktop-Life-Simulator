/**
 * The load pipeline. Phase-07c — `SAVE_FORMAT.md` §4.3 steps 2–5, ADR-015 §7.
 *
 * PURE: main hands over the parsed JSON of `slot-0.json` and its `.bak`
 * (`save-store.ts`); this function routes each candidate through
 * migration → structural validation → semantic repair → hydration and
 * returns a live world with its session state — or a typed error the UI can
 * present. Running in the renderer keeps disk out of it and the world in it
 * (`ARCHITECTURE.md` §4.3).
 *
 * The `.bak` fallback covers every RECOVERABLE failure — unparseable
 * structure, a failed migration, a corrupt document. The one deliberate
 * exception: a save from a NEWER version refuses outright and never falls
 * back (ADR-015 §4) — quietly loading the older backup would silently
 * discard the newer session's world, which is worse than stopping.
 */

import { appError, ErrorCode } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import type { WorldOptions, World } from '../sim/world/world';

import { hydrateWorld } from './deserialize';
import { runMigrations, type UnknownSave } from './migrate';
import { MIGRATIONS } from './migrations/index';
import { CURRENT_SCHEMA_VERSION, type SaveMeta, type SaveQuarantine } from './schema';
import { coreContent, parseSaveDocument, repairSaveDocument, type Repair } from './validate';

export interface LoadedWorld {
  readonly world: World;
  /** The loaded header — `createdAtUnixMs` and `saveCount` continue the session. */
  readonly meta: SaveMeta;
  /** Held not-active data, carried by the session and written back on save. */
  readonly quarantine: SaveQuarantine;
  /** §5.2 repairs applied, for the load log. Non-empty is worth investigating. */
  readonly repairs: readonly Repair[];
  /** Migration links applied, for the load log. */
  readonly migrationsApplied: readonly string[];
  /** True when the primary failed and `.bak` carried the load. */
  readonly usedBackup: boolean;
}

/** One candidate through the full §4.3 pipeline. */
function loadCandidate(
  parsed: unknown,
  options: WorldOptions,
): Result<Omit<LoadedWorld, 'usedBackup'>> {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { schemaVersion?: unknown }).schemaVersion !== 'number'
  ) {
    return err(appError(ErrorCode.SaveCorrupt, 'not a save document'));
  }

  const migrated = runMigrations(parsed as UnknownSave, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  if (!migrated.ok) return migrated;

  const structural = parseSaveDocument(migrated.value.document);
  if (!structural.ok) return structural;

  const { document, repairs } = repairSaveDocument(structural.value, coreContent());

  try {
    const world = hydrateWorld(document, options);
    return ok({
      world,
      meta: document.meta,
      quarantine: document.quarantine,
      repairs,
      migrationsApplied: migrated.value.applied,
    });
  } catch (thrown) {
    // Validation makes this near-impossible; if a document still defeats
    // hydration, it is a corrupt-save outcome, never a crash (ADR-015 §7).
    return err(
      appError(ErrorCode.SaveCorrupt, 'hydration failed', {
        reason: thrown instanceof Error ? thrown.message : String(thrown),
      }),
    );
  }
}

/**
 * Loads the world from the parsed primary document, falling back to the
 * parsed backup. `missing` (neither file existed) is the CALLER's branch —
 * the only case where a new game is correct.
 */
export function loadWorld(
  primary: unknown,
  backup: unknown,
  options: WorldOptions = {},
): Result<LoadedWorld> {
  const fromPrimary = primary === null ? null : loadCandidate(primary, options);
  if (fromPrimary?.ok === true) return ok({ ...fromPrimary.value, usedBackup: false });

  // The refusal case never falls back (see module header).
  if (fromPrimary !== null && fromPrimary.error.code === ErrorCode.SaveFromNewerVersion) {
    return fromPrimary;
  }

  const fromBackup = backup === null ? null : loadCandidate(backup, options);
  if (fromBackup?.ok === true) return ok({ ...fromBackup.value, usedBackup: true });

  if (fromBackup !== null && fromBackup.error.code === ErrorCode.SaveFromNewerVersion) {
    return fromBackup;
  }

  // Both unusable: a clear, typed error — NEVER a silent new game over a
  // farm that existed (SAVE_FORMAT.md §4.3 step 1).
  return err(
    appError(ErrorCode.SaveCorrupt, 'no loadable save', {
      primary: fromPrimary === null ? 'absent' : fromPrimary.error.message,
      backup: fromBackup === null ? 'absent' : fromBackup.error.message,
    }),
  );
}
