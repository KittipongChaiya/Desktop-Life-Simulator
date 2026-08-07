/**
 * Preferences on disk. Phase-08.0c — extracted from `settings.ts`.
 *
 * THE DIRECTORY IS A PARAMETER, NOT `app.getPath` — the same reason
 * `save-store.ts` gives: with the path injected this module is pure Node, so
 * the read and write paths are testable against real temp directories instead
 * of mocked ones (`TESTING.md` §2 — reaching for a mock is a design signal).
 * `settings.ts` supplies the real `userData` path and is the only part that
 * needs Electron.
 *
 * SETTINGS ARE NOT SAVES. `save-store.ts` performs a six-step atomic sequence
 * because a save is the product; a preference is cheap to lose and re-derivable
 * from defaults, so this uses a plain write (ADR-002 §2). That asymmetry is
 * deliberate and is not a gap to close.
 *
 * Both directions swallow every failure. Missing or unreadable preferences are
 * normal on first run, and losing a preference must never interrupt play.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_SETTINGS, parseSettings, type AppSettings } from './settings-schema';

export function settingsPathIn(dir: string): string {
  return join(dir, 'settings.json');
}

export function readSettingsFrom(dir: string): AppSettings {
  try {
    // Parsing and per-field sanitation live in the schema (settings-schema.ts,
    // pure and unit-tested); this module owns only the disk around it.
    return parseSettings(JSON.parse(readFileSync(settingsPathIn(dir), 'utf8')));
  } catch {
    // Missing or unreadable preferences are normal on first run, never fatal.
    return DEFAULT_SETTINGS;
  }
}

export function writeSettingsTo(dir: string, settings: AppSettings): void {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(settingsPathIn(dir), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  } catch {
    // Losing a preference must never interrupt play.
  }
}
