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
  rmSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

import type { SavesOnDisk } from '../shared/ipc/contract';

/** Autosave copies retained in `backups/` (`SAVE_FORMAT.md` §1). */
const BACKUPS_KEPT = 3;

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

  return {
    primary: slotExists ? parseOrNull(slot) : null,
    backup: bakExists ? parseOrNull(bak) : null,
    missing: !slotExists && !bakExists,
  };
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
