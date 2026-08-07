/**
 * Preferences on disk. Phase-08.0c — the module was at 0%.
 *
 * Written against a REAL temp directory, in the `save-store.test.ts` tradition:
 * the failure modes here are filesystem ones, and a mocked `fs` would only
 * prove the mock behaves as configured.
 *
 * The rule under test in most of these is that a preference problem is never
 * fatal. A first run has no file; a half-written file survives a power cut; a
 * read-only directory exists on managed machines. None of those may stop the
 * player from playing — but every one of them must leave the world alone,
 * which is why preferences live outside the save (`SAVE_FORMAT.md` §1).
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from './settings-schema';
import { readSettingsFrom, settingsPathIn, writeSettingsTo } from './settings-store';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dls-settings-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeSettingsTo / readSettingsFrom', () => {
  it('round-trips the settings a player changed', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      overlay: { collapsed: true },
      desktop: { ...DEFAULT_SETTINGS.desktop, opacityPercent: 70 },
    };
    writeSettingsTo(dir, settings);
    expect(readSettingsFrom(dir)).toEqual(settings);
  });

  it('creates the directory when it does not exist yet — first run', () => {
    const nested = join(dir, 'userData');
    writeSettingsTo(nested, DEFAULT_SETTINGS);
    expect(readSettingsFrom(nested)).toEqual(DEFAULT_SETTINGS);
  });

  it('writes readable JSON with a trailing newline', () => {
    writeSettingsTo(dir, DEFAULT_SETTINGS);
    const text = readFileSync(settingsPathIn(dir), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('readSettingsFrom falls back to defaults rather than failing', () => {
  it('when there is no file at all — the normal first run', () => {
    expect(readSettingsFrom(dir)).toEqual(DEFAULT_SETTINGS);
  });

  it('when the directory does not exist', () => {
    expect(readSettingsFrom(join(dir, 'nope'))).toEqual(DEFAULT_SETTINGS);
  });

  it('when the file is truncated JSON — a power cut mid-write', () => {
    writeFileSync(settingsPathIn(dir), '{"overlay": {"collapsed": tr', 'utf8');
    expect(readSettingsFrom(dir)).toEqual(DEFAULT_SETTINGS);
  });

  it('when the file is not JSON at all', () => {
    writeFileSync(settingsPathIn(dir), 'not json', 'utf8');
    expect(readSettingsFrom(dir)).toEqual(DEFAULT_SETTINGS);
  });

  it('when the path is a directory rather than a file', () => {
    mkdirSync(settingsPathIn(dir));
    expect(readSettingsFrom(dir)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('a bad value is sanitised, not obeyed', () => {
  it('sends every field through the schema rather than trusting the file', () => {
    // The file is user-editable and survives upgrades, so it is untrusted input
    // (`AI_RULES.md` §2.4). Sanitation itself is settings-schema.ts's business;
    // what this pins is that the store cannot bypass it.
    writeFileSync(
      settingsPathIn(dir),
      JSON.stringify({ desktop: { opacityPercent: 9999 }, overlay: { collapsed: 'yes' } }),
      'utf8',
    );
    const loaded = readSettingsFrom(dir);
    expect(loaded.desktop.opacityPercent).toBeLessThanOrEqual(100);
    expect(typeof loaded.overlay.collapsed).toBe('boolean');
  });
});

describe('writeSettingsTo never throws', () => {
  it('swallows an unwritable destination — losing a preference is not fatal', () => {
    // A file where the directory should be: `mkdirSync` throws ENOTDIR.
    const blocked = join(dir, 'blocked');
    writeFileSync(blocked, 'in the way', 'utf8');
    expect(() => writeSettingsTo(blocked, DEFAULT_SETTINGS)).not.toThrow();
  });
});
