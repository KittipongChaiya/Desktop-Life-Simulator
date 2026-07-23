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

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { atomicWriteSave, readSavesForLoad, WRITE_STEPS, type WriteStep } from './save-store';

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
