/**
 * The save store — disk I/O for saves, main process only. Phase-07c —
 * `SAVE_FORMAT.md` §1, §7; ADR-002 §2; ADR-003 §3.
 *
 * SAVES ARE NOT PREFERENCES: `settings.ts` may use a plain write because a
 * preference is cheap to lose; a save is the product, so every write here is
 * the exact six-step atomic sequence, and at no point after serialization
 * does a single failure leave zero valid saves on disk.
 *
 * The directory is a parameter, not `app.getPath` — this module is pure Node
 * (no `electron` import), so the sequence is testable against real temp
 * directories, including the crash-interruption tests criterion 4 demands.
 * `index.ts` supplies the real `userData/saves` path.
 */

import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

import { CURRENT_SCHEMA_VERSION } from '../persistence/schema';
import type { SavesOnDisk } from '../shared/ipc/contract';

/** Autosave copies retained in `backups/` (`SAVE_FORMAT.md` §1). */
/** Autosave copies kept in `backups/`. Pre-migration backups are not among them. */
export const BACKUPS_KEPT = 3;

const SLOT = 'slot-0.json';
const SLOT_BAK = 'slot-0.json.bak';
const SLOT_TMP = 'slot-0.json.tmp';

/**
 * The §7.1 steps, in order. Exported for the crash-safety tests, which
 * REALLY perform the sequence and stop after each step — interrupting actual
 * filesystem operations, not mocking failures (phase doc §Notes).
 */
export const WRITE_STEPS = [
  'write-tmp', // step 2 — the serialized text lands in slot-0.json.tmp
  'fsync-tmp', // step 3 — durability barrier
  'rename-bak', // step 4 — previous good save preserved
  'rename-slot', // step 5 — atomic on NTFS
  'fsync-dir', // step 6 — best-effort on Windows (see below)
] as const;

export type WriteStep = (typeof WRITE_STEPS)[number];

/**
 * The save file a player would go looking for.
 *
 * Exported so the failure notification can name it (07e, §7.3 "notify with
 * the path") without the renderer ever constructing a filesystem path.
 */
export function slotPath(savesDir: string): string {
  return join(savesDir, SLOT);
}

/**
 * Writes a serialized save document atomically (§7.1).
 *
 * Step 1 (serialize in memory) is the caller's — this function receives the
 * finished text, so a serialization failure has already touched no file.
 * After the sequence, the new save is copied into `backups/slot-0-<tick>.json`
 * and the oldest beyond three are pruned (step 7).
 *
 * `haltAfter` is the crash-safety test seam: the sequence stops dead after
 * the named step, exactly as a crash there would.
 */
export function atomicWriteSave(
  savesDir: string,
  text: string,
  tick: number,
  haltAfter?: WriteStep,
): void {
  mkdirSync(savesDir, { recursive: true });
  const tmp = join(savesDir, SLOT_TMP);
  const slot = join(savesDir, SLOT);
  const bak = join(savesDir, SLOT_BAK);

  // Step 2: write the temp file...
  // Step 3: ...and fsync it — the durability barrier. One descriptor for
  // both, so the data we fsync is exactly the data we wrote.
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, text);
    if (haltAfter === 'write-tmp') return;
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (haltAfter === 'fsync-tmp') return;

  // Step 4: preserve the previous good save. Absent on the first save.
  if (existsSync(slot)) renameSync(slot, bak);
  if (haltAfter === 'rename-bak') return;

  // Step 5: the atomic publish (rename within one NTFS volume).
  renameSync(tmp, slot);
  if (haltAfter === 'rename-slot') return;

  // Step 6: fsync the containing directory so the renames are durable.
  // BEST-EFFORT ON WINDOWS: directory handles cannot be fsynced there
  // (EPERM/EISDIR); NTFS journals rename metadata, which is why §7.1 step 5
  // is already atomic. Attempted anyway for the platforms that support it.
  try {
    const dirFd = openSync(savesDir, 'r');
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    // Windows: see above. Never a failure the player pays for.
  }
  if (haltAfter === 'fsync-dir') return;

  // Step 7: rotate a copy into backups/ and prune to the newest three.
  const backups = join(savesDir, 'backups');
  mkdirSync(backups, { recursive: true });
  copyFileSync(slot, join(backups, `slot-0-${String(tick)}.json`));
  pruneBackups(backups);
}

/**
 * Moves every save artifact aside so the next launch starts a new farm.
 * ADR-045 §2 — the "Start New Game" path.
 *
 * **MOVES. Never deletes.** A player who ends their farm and regrets it has
 * it sitting in `saves/archive/<stamp>/`, recoverable by moving one file
 * back. Nothing this application does removes a world from a player's disk,
 * which is the whole of ADR-045's argument for why a deliberate reset is not
 * the outcome `SAVE_FORMAT.md` §4 forbids.
 *
 * Three things travel, and the third is the one that is easy to miss:
 *
 * 1. `slot-0.json` and `slot-0.json.bak` — the farm.
 * 2. `slot-0.json.tmp`, if a crash left one. It is not a save, but leaving a
 *    stray temp file next to a brand-new farm is how a later diagnosis goes
 *    wrong.
 * 3. **The whole `backups/` directory**, including the pre-migration copies
 *    ADR-027 §2 keeps indefinitely. Those exist to let an older build read
 *    the farm after a rollback, so they belong WITH the farm they describe —
 *    and leaving them would break the new game's backup rotation outright:
 *    `pruneBackups` keeps the highest ticks, a new game starts at tick 0, so
 *    the old farm's copies would outrank every backup the new farm ever
 *    wrote and it would accumulate none.
 *
 * The stamp makes repeated resets stack rather than collide. It is passed in
 * rather than read from the clock here, because this module is pure Node and
 * its tests are exact.
 *
 * @returns the archive directory, or `null` when there was nothing to move —
 *   which is not a failure. Resetting a farm that does not exist is a no-op,
 *   and the caller reloads either way.
 */
export function archiveSaves(savesDir: string, stamp: string): string | null {
  const backups = join(savesDir, 'backups');

  const loose = [SLOT, SLOT_BAK, SLOT_TMP].filter((name) => existsSync(join(savesDir, name)));
  const hasBackups = existsSync(backups);
  if (loose.length === 0 && !hasBackups) return null;

  const destination = join(savesDir, 'archive', stamp);
  mkdirSync(destination, { recursive: true });

  for (const name of loose) {
    renameSync(join(savesDir, name), join(destination, name));
  }
  if (hasBackups) renameSync(backups, join(destination, 'backups'));

  return destination;
}

/**
 * Copies the untouched save aside before a migration chain runs. ADR-027 §2.
 *
 * **One file per schema version, written once, never overwritten.** A second
 * migration from the same version must not clobber the first copy — the whole
 * point is that the ORIGINAL survives, and re-copying an already-migrated file
 * over it would destroy exactly the artifact this exists to keep.
 *
 * Kept indefinitely and exempt from the three-most-recent pruning. That is not
 * a special case in `pruneBackups`: it filters on `slot-0-<tick>.json`, and
 * this name cannot match, so the exemption is structural rather than a rule
 * someone has to remember. `preMigrationBackupPath` and the prune filter are
 * pinned against each other in the tests.
 *
 * Why indefinitely: ADR-025 §2 makes this the ONLY artifact an older build can
 * read after a rollback across a schema bump, because `.bak` sits at the same
 * version as the save and is refused with it. At the reference farm's 38,730
 * bytes, a player who has moved 1 → 6 holds under 200 KB.
 *
 * @returns true if a backup was written, false if one already existed.
 */
export function writePreMigrationBackup(
  savesDir: string,
  fromVersion: number,
  original: string,
): boolean {
  const backups = join(savesDir, 'backups');
  mkdirSync(backups, { recursive: true });

  const destination = join(backups, preMigrationBackupName(fromVersion));
  if (existsSync(destination)) return false;

  writeFileSync(destination, original, 'utf8');
  return true;
}

/** The filename a pre-migration backup takes for a given schema version. */
export function preMigrationBackupName(fromVersion: number): string {
  return `slot-0-v${String(fromVersion)}-premigration.json`;
}

/** Keeps the newest `BACKUPS_KEPT` autosave copies, by tick in the filename. */
function pruneBackups(backupsDir: string): void {
  const entries = readdirSync(backupsDir)
    .filter((name) => /^slot-0-\d+\.json$/.test(name))
    .sort((a, b) => tickOf(a) - tickOf(b));
  while (entries.length > BACKUPS_KEPT) {
    const oldest = entries.shift();
    if (oldest === undefined) break;
    rmSync(join(backupsDir, oldest), { force: true });
  }
}

function tickOf(name: string): number {
  return Number(/^slot-0-(\d+)\.json$/.exec(name)?.[1] ?? 0);
}

/**
 * Reads and parses both save files, never throwing on their content.
 *
 * Main's job ends at bytes → parsed JSON with `.bak` routing (the
 * `SavesOnDisk` transport type lives in the IPC contract); migration,
 * validation, and hydration run in the renderer (`ARCHITECTURE.md` §4.3).
 */
export function readSavesForLoad(savesDir: string): SavesOnDisk {
  const slot = join(savesDir, SLOT);
  const bak = join(savesDir, SLOT_BAK);
  const slotExists = existsSync(slot);
  const bakExists = existsSync(bak);

  const primary = slotExists ? parseOrNull(slot) : null;

  // ADR-027 §2: copy the ORIGINAL aside before anything migrates it. Here
  // rather than in the load pipeline because this is the last place the
  // untouched bytes exist — `src/persistence` receives a parsed document and
  // never sees a file. Best-effort: a save that cannot be backed up still
  // loads, since refusing to open a farm because a spare copy failed would be
  // the larger harm.
  const version = schemaVersionOf(primary);
  if (version !== null && version < CURRENT_SCHEMA_VERSION) {
    try {
      writePreMigrationBackup(savesDir, version, readFileSync(slot, 'utf8'));
    } catch {
      // Logged by the caller's load report; never fatal.
    }
  }

  return {
    primary,
    backup: bakExists ? parseOrNull(bak) : null,
    missing: !slotExists && !bakExists,
  };
}

/**
 * The schema version of the save on disk, or `null`. Phase-15 — ADR-025 §2.
 *
 * The one number the rollback guard needs from this side: `decideOffer`
 * compares it against the schema the offered build declares, and refuses a
 * build that could not read the farm.
 *
 * **It reads and nothing else.** `readSavesForLoad` copies the original aside
 * when it sees an older schema (ADR-027 §2), which is right for a load and
 * wrong here — this question is asked in the background, possibly hours after
 * launch, and ADR-025 §4 says the updater never touches the save directory:
 * _"not moved, not migrated, not backed up by the updater, not cleaned."_ A
 * read that quietly wrote a file would break that on the most ordinary path
 * there is.
 *
 * A missing save, an unparseable one, and one declaring no version all answer
 * `null`, which `decideRollback` reads as "allowed": there is no farm to
 * orphan, and refusing would strand an install that has not started one.
 */
export function readSaveSchemaVersion(savesDir: string): number | null {
  const slot = join(savesDir, SLOT);
  if (!existsSync(slot)) return null;
  return schemaVersionOf(parseOrNull(slot));
}

/** The schema version of a parsed document, or null if it declares none. */
function schemaVersionOf(document: unknown): number | null {
  if (typeof document !== 'object' || document === null) return null;
  const version = (document as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) ? version : null;
}

function parseOrNull(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // Unparseable is a routing outcome here, not an exception — the pipeline
    // decides what a null means (fall back, or report clearly).
    return null;
  }
}
