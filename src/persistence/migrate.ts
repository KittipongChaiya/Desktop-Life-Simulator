/**
 * The migration runner. Phase-07b — ADR-002 §3, ADR-015 §3.
 *
 * This is the ONE place `schemaVersion` is ever read (ADR-015 §2). Gameplay
 * code never sees a version; the runner routes a document from whatever
 * shipped version wrote it up to `CURRENT_SCHEMA_VERSION`, one pure link at a
 * time, and everything downstream handles exactly one shape.
 *
 * Guarantees, per ADR-015 §3:
 * - The chain is validated for shape at startup (`validateChain`) —
 *   contiguous, gap-free, `to === from + 1`, starting at 1 and ending at the
 *   current version. A malformed chain fails the build, not the player.
 * - Each link applies AT MOST ONCE: routing is by version, so no document
 *   passes the same link twice.
 * - NON-DESTRUCTIVE: links return new documents and never mutate their
 *   input; a failed chain leaves the caller holding the untouched original
 *   for the error path. The runner also verifies each link actually bumped
 *   its output — a link that lies about its version would loop or corrupt.
 * - Failures are typed data, never exceptions: a newer document is refused
 *   (`SaveFromNewerVersion` — partial loading destroys the newer session's
 *   fields), a version with no link is corrupt (never-shipped versions are
 *   indistinguishable from corruption, ADR-015 §4), and a throwing link
 *   converts to `MigrationFailed`.
 */

import { appError, ErrorCode } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

/**
 * A parsed-but-unvalidated document: JSON of an unknown (older) shape.
 * Only `schemaVersion` is assumed; structural validation runs AFTER the
 * chain, against the current schema.
 */
export interface UnknownSave {
  readonly schemaVersion: number;
  readonly [key: string]: unknown;
}

export interface Migration {
  readonly from: number;
  /** ALWAYS `from + 1` — linear, never skipping (ADR-002 §3). */
  readonly to: number;
  readonly describe: string;
  /** PURE and non-destructive: returns a new document, never mutates. */
  migrate(document: UnknownSave): UnknownSave;
}

export interface MigrationRun {
  readonly document: UnknownSave;
  /** One human-readable line per applied link, for the load log. */
  readonly applied: readonly string[];
}

/**
 * Rejects a malformed chain at startup. Throws rather than returning a
 * `Result` deliberately: a bad chain is a programming error shipped in the
 * build, not a runtime condition a player's file can cause.
 */
export function validateChain(migrations: readonly Migration[], currentVersion: number): void {
  if (migrations.length === 0) {
    if (currentVersion !== 1) {
      throw new Error(
        `an empty chain requires the current version to be 1, and it ends before current (${currentVersion})`,
      );
    }
    return;
  }

  for (const migration of migrations) {
    if (migration.to !== migration.from + 1) {
      throw new Error(
        `migration "${migration.describe}" goes ${migration.from} -> ${migration.to}; ` +
          'to must be from + 1',
      );
    }
  }

  const first = migrations[0];
  if (first !== undefined && first.from !== 1) {
    throw new Error(`the chain must start at version 1, got ${first.from}`);
  }

  for (let i = 1; i < migrations.length; i += 1) {
    const previous = migrations[i - 1];
    const current = migrations[i];
    if (previous === undefined || current === undefined) continue;
    if (current.from !== previous.to) {
      throw new Error(
        `chain gap: expected a migration from ${previous.to}, got one from ${current.from} ` +
          `("${current.describe}") — the chain must be contiguous`,
      );
    }
  }

  const last = migrations[migrations.length - 1];
  if (last !== undefined && last.to !== currentVersion) {
    throw new Error(
      `the chain ends at ${last.to} but the current version is ${currentVersion} — ` +
        'every version between a shipped save and current needs its link',
    );
  }
}

/** Routes a document from its version to `currentVersion` through the chain. */
export function runMigrations(
  document: UnknownSave,
  migrations: readonly Migration[],
  currentVersion: number,
): Result<MigrationRun> {
  const version = document.schemaVersion;

  if (version > currentVersion) {
    // REFUSE, never partially load: silently loading a newer save would drop
    // fields the player's later session created (SAVE_FORMAT.md §4.3).
    return err(
      appError(ErrorCode.SaveFromNewerVersion, 'save was written by a newer version', {
        saveVersion: version,
        currentVersion,
      }),
    );
  }

  const applied: string[] = [];
  let current = document;

  while (current.schemaVersion < currentVersion) {
    const at = current.schemaVersion;
    const link = migrations.find((migration) => migration.from === at);
    if (link === undefined) {
      // A shipped version always has its link (ADR-015 §2's burn rule), so a
      // version without one never shipped — indistinguishable from corruption.
      return err(
        appError(ErrorCode.SaveCorrupt, 'no migration exists for this save version', {
          saveVersion: at,
          currentVersion,
        }),
      );
    }

    let next: UnknownSave;
    try {
      next = link.migrate(current);
    } catch (thrown) {
      return err(
        appError(ErrorCode.MigrationFailed, 'a migration step threw', {
          step: `${link.from} -> ${link.to}`,
          describe: link.describe,
          reason: thrown instanceof Error ? thrown.message : String(thrown),
        }),
      );
    }

    if (next.schemaVersion !== link.to) {
      return err(
        appError(ErrorCode.MigrationFailed, 'a migration step did not produce its target version', {
          step: `${link.from} -> ${link.to}`,
          describe: link.describe,
          produced: next.schemaVersion,
        }),
      );
    }

    applied.push(`${link.from} -> ${link.to}: ${link.describe}`);
    current = next;
  }

  return ok({ document: current, applied });
}
