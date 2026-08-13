/**
 * The save store — disk atomicity. Phase-07c — `SAVE_FORMAT.md` §7,
 * acceptance criteria 3, 4, 5, 6 (the disk halves).
 *
 * Crash safety is tested by ACTUALLY PERFORMING the write sequence against a
 * real directory and stopping after each step (phase doc §Notes: real
 * filesystem operations, not mocked failures). The invariant under test is
 * §7.1's: at no point after serialization does a single failure leave zero
 * valid saves on disk — an existing good save survives every partial write.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  atomicWriteSave,
  BACKUPS_KEPT,
  preMigrationBackupName,
  readSaveSchemaVersion,
  readSavesForLoad,
  writePreMigrationBackup,
  WRITE_STEPS,
  type WriteStep,
} from './save-store';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dls-saves-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const doc = (tick: number): string => JSON.stringify({ schemaVersion: 1, tick });

describe('atomicWriteSave / readSavesForLoad', () => {
  it('round-trips a save', () => {
    atomicWriteSave(dir, doc(100), 100);
    const saves = readSavesForLoad(dir);
    expect(saves.missing).toBe(false);
    expect(saves.primary).toEqual({ schemaVersion: 1, tick: 100 });
    expect(saves.backup).toBeNull();
  });

  it('reports missing when no save has ever been written', () => {
    expect(readSavesForLoad(dir).missing).toBe(true);
  });

  it('rotates the previous good save into .bak on every write', () => {
    atomicWriteSave(dir, doc(100), 100);
    atomicWriteSave(dir, doc(200), 200);
    const saves = readSavesForLoad(dir);
    expect(saves.primary).toEqual({ schemaVersion: 1, tick: 200 });
    expect(saves.backup).toEqual({ schemaVersion: 1, tick: 100 });
  });

  it('keeps the three most recent backups, oldest pruned (§7.1 step 7)', () => {
    for (const tick of [100, 200, 300, 400, 500]) atomicWriteSave(dir, doc(tick), tick);
    const backups = readdirSync(join(dir, 'backups')).sort();
    expect(backups).toEqual(['slot-0-300.json', 'slot-0-400.json', 'slot-0-500.json']);
  });

  it('never leaves a .tmp behind after a completed write', () => {
    atomicWriteSave(dir, doc(100), 100);
    expect(existsSync(join(dir, 'slot-0.json.tmp'))).toBe(false);
  });

  describe('crash safety — interrupting after each real step (criterion 4)', () => {
    it.each(WRITE_STEPS.map((step) => [step]))(
      'an existing good save survives a crash after step %s',
      (step: WriteStep) => {
        atomicWriteSave(dir, doc(100), 100); // the save that must survive

        atomicWriteSave(dir, doc(200), 200, step); // crash here

        const saves = readSavesForLoad(dir);
        expect(saves.missing).toBe(false);
        // ≥ 1 loadable save, and it is one of the two real states — never a
        // torn hybrid.
        const loadable = [saves.primary, saves.backup].filter((s) => s !== null);
        expect(loadable.length).toBeGreaterThanOrEqual(1);
        for (const save of loadable) {
          expect([100, 200]).toContain((save as { tick: number }).tick);
        }
      },
    );

    it('a crash on the very first save leaves a clean missing state, not corruption', () => {
      atomicWriteSave(dir, doc(100), 100, 'write-tmp');
      const saves = readSavesForLoad(dir);
      // No save ever existed; nothing was lost. Missing → new game is correct.
      expect(saves.missing).toBe(true);
    });
  });

  describe('corruption (criteria 5, 6 — the disk half)', () => {
    it.each([
      ['truncated', '{"schemaVersion":1,"wor'],
      ['empty', ''],
      ['malformed', 'not json at all'],
      ['wrong-type', '[1,2,3]'.slice(0, 2)], // "[1" — also truncated JSON
    ])('a %s slot file falls back to the parseable .bak', (_name, garbage) => {
      atomicWriteSave(dir, doc(100), 100);
      atomicWriteSave(dir, doc(200), 200);
      writeFileSync(join(dir, 'slot-0.json'), garbage, 'utf8');

      const saves = readSavesForLoad(dir);
      expect(saves.missing).toBe(false);
      expect(saves.primary).toBeNull(); // unparseable — reported, not thrown
      expect(saves.backup).toEqual({ schemaVersion: 1, tick: 100 });
    });

    it('both files corrupt is reported as present-but-unreadable — never as a new game', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'slot-0.json'), '###', 'utf8');
      writeFileSync(join(dir, 'slot-0.json.bak'), '###', 'utf8');
      const saves = readSavesForLoad(dir);
      expect(saves.missing).toBe(false); // files EXIST — missing would silently start over
      expect(saves.primary).toBeNull();
      expect(saves.backup).toBeNull();
    });
  });
});

/**
 * Write failures — phase-07e, acceptance criterion 20 and `SAVE_FORMAT.md`
 * §7.3: a failed save never crashes the game and never damages the existing
 * save.
 *
 * Every case here is a REAL filesystem refusal, produced by putting something
 * genuinely in the way, not by mocking `fs` — the phase doc's rule for the
 * crash-safety tests applies just as much to the failure ones. What each
 * asserts is the same pair: the call throws (so main can report it), and the
 * good save already on disk is byte-for-byte untouched.
 *
 * DISK FULL is deliberately not simulated. ENOSPC arrives from the same
 * `writeSync`/`renameSync` calls these cases already make throw, lands in the
 * same `catch` in `index.ts`, and cannot be forced without filling a real
 * volume. Claiming a mocked ENOSPC as coverage would be claiming a test of
 * Node's error plumbing as a test of ours.
 */
describe('write failures leave the existing save intact (criterion 20)', () => {
  /** A known-good save on disk, plus a reader that proves it survived. */
  function goodSaveOnDisk(): () => unknown {
    atomicWriteSave(dir, doc(100), 100);
    return () => readSavesForLoad(dir).primary;
  }

  it('the temp file cannot be opened (step 2)', () => {
    const survived = goodSaveOnDisk();
    // A directory where the temp file must go: openSync refuses outright.
    mkdirSync(join(dir, 'slot-0.json.tmp'), { recursive: true });

    expect(() => atomicWriteSave(dir, doc(200), 200)).toThrow();
    expect(survived()).toEqual({ schemaVersion: 1, tick: 100 });
  });

  it('the .bak rotation is refused (step 4)', () => {
    const survived = goodSaveOnDisk();
    // A directory where the backup must go: renameSync onto it is EPERM.
    mkdirSync(join(dir, 'slot-0.json.bak'), { recursive: true });

    expect(() => atomicWriteSave(dir, doc(200), 200)).toThrow();
    // The slot is still the good save — the rotation failed BEFORE the
    // publish, which is exactly why §7.1 orders it that way.
    expect(survived()).toEqual({ schemaVersion: 1, tick: 100 });
  });

  it('the saves directory cannot exist at all (permission-denied shape)', () => {
    // A FILE where the directory must be: mkdirSync fails with the same
    // class of refusal a locked-down profile directory produces, before any
    // save file is touched.
    const blocked = join(dir, 'blocked');
    writeFileSync(blocked, 'not a directory', 'utf8');

    expect(() => atomicWriteSave(join(blocked, 'saves'), doc(200), 200)).toThrow();
    // And the real saves directory, elsewhere, is untouched by the attempt.
    expect(readSavesForLoad(dir).missing).toBe(true);
  });

  it('a failed write never leaves a torn slot behind', () => {
    const survived = goodSaveOnDisk();
    mkdirSync(join(dir, 'slot-0.json.bak'), { recursive: true });

    try {
      atomicWriteSave(dir, doc(200), 200);
    } catch {
      // The point of the test is what is on disk afterwards.
    }

    const saves = readSavesForLoad(dir);
    expect(saves.missing).toBe(false);
    expect(survived()).toEqual({ schemaVersion: 1, tick: 100 });
  });
});

// ---------------------------------------------------------------------------
// Phase-09b — ADR-027 §2. The pre-migration backup.
//
// v0.2 lands five schema versions, and ADR-025 §2 found that rolling back
// across one orphans a save: `.bak` sits at the SAME version as the save and is
// refused with it, so the pre-migration copy is the only artifact an older
// build can read. Losing it turns a rollback into data loss.
// ---------------------------------------------------------------------------

describe('writePreMigrationBackup (ADR-027 §2)', () => {
  const original = '{"schemaVersion":1,"world":{}}';

  it('copies the untouched save aside, under a name that states its version', () => {
    expect(writePreMigrationBackup(dir, 1, original)).toBe(true);
    const written = join(dir, 'backups', preMigrationBackupName(1));
    expect(readFileSync(written, 'utf8')).toBe(original);
  });

  it('creates the backups directory when it does not exist yet', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'dls-premigration-'));
    try {
      expect(writePreMigrationBackup(fresh, 1, original)).toBe(true);
      expect(existsSync(join(fresh, 'backups', preMigrationBackupName(1)))).toBe(true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('NEVER overwrites an existing backup for the same version', () => {
    // The original is the artifact. A second migration from v1 re-copying an
    // already-migrated file over it would destroy the only thing an older
    // build can read.
    writePreMigrationBackup(dir, 1, original);
    expect(writePreMigrationBackup(dir, 1, '{"schemaVersion":1,"world":{"tampered":true}}')).toBe(
      false,
    );

    const written = join(dir, 'backups', preMigrationBackupName(1));
    expect(readFileSync(written, 'utf8')).toBe(original);
  });

  it('keeps one file per version, so a 1 → 3 player holds both originals', () => {
    writePreMigrationBackup(dir, 1, original);
    writePreMigrationBackup(dir, 2, '{"schemaVersion":2,"world":{}}');

    const names = readdirSync(join(dir, 'backups')).sort();
    expect(names).toEqual([preMigrationBackupName(1), preMigrationBackupName(2)]);
  });

  it('is EXEMPT from autosave pruning, structurally rather than by rule', () => {
    // `pruneBackups` filters on `slot-0-<tick>.json`. This name cannot match,
    // so the exemption cannot be forgotten by someone editing the pruner —
    // which is why these two are pinned against each other here.
    expect(preMigrationBackupName(1)).not.toMatch(/^slot-0-\d+\.json$/);

    writePreMigrationBackup(dir, 1, original);
    for (let tick = 1; tick <= BACKUPS_KEPT + 3; tick += 1) {
      atomicWriteSave(dir, `{"schemaVersion":2,"tick":${String(tick)}}`, tick);
    }

    expect(existsSync(join(dir, 'backups', preMigrationBackupName(1)))).toBe(true);
    const autosaves = readdirSync(join(dir, 'backups')).filter((name) =>
      /^slot-0-\d+\.json$/.test(name),
    );
    expect(autosaves.length).toBeLessThanOrEqual(BACKUPS_KEPT);
  });
});

describe('the schema version the updater asks about (phase-15, ADR-025 §2)', () => {
  it('is null when there is no save, because there is nothing to orphan', () => {
    // `decideRollback` allows a rollback for a null, and that is the point of
    // routing "no save" and "unreadable save" to the same answer: a fresh
    // install has no farm to strand, so refusing would strand nobody.
    expect(readSaveSchemaVersion(dir)).toBeNull();
  });

  it('reads what the save on disk declares', () => {
    atomicWriteSave(dir, JSON.stringify({ schemaVersion: 5, world: {} }), 1);

    expect(readSaveSchemaVersion(dir)).toBe(5);
  });

  it('is null for a save that cannot be parsed', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'slot-0.json'), '{ this is not json', 'utf8');

    expect(readSaveSchemaVersion(dir)).toBeNull();
  });

  it('is null for a save that declares no version', () => {
    atomicWriteSave(dir, JSON.stringify({ world: {} }), 1);

    expect(readSaveSchemaVersion(dir)).toBeNull();
  });

  it('is null for a version that is not an integer', () => {
    atomicWriteSave(dir, JSON.stringify({ schemaVersion: '5' }), 1);

    expect(readSaveSchemaVersion(dir)).toBeNull();
  });

  it('never writes a pre-migration backup, unlike the load path', () => {
    // `readSavesForLoad` copies the original aside when it sees an older
    // schema (ADR-027 §2), and that is right for a LOAD. This is a question
    // the updater asks in the background, possibly hours after launch —
    // ADR-025 §4 says the updater never touches the save directory, "not
    // moved, not migrated, not backed up, not cleaned", and a read that
    // quietly wrote a file would break that on the most ordinary path.
    atomicWriteSave(dir, JSON.stringify({ schemaVersion: 1, world: {} }), 1);
    const before = readdirSync(join(dir, 'backups'));

    readSaveSchemaVersion(dir);

    expect(readdirSync(join(dir, 'backups'))).toEqual(before);
  });
});
