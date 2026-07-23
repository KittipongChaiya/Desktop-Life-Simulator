/**
 * UI preferences.
 *
 * NOT game state. `settings.json` holds how the player likes the overlay
 * arranged; the save file holds the world (SAVE_FORMAT.md §1). Conflating them
 * would mean a corrupt preference file could take out a save.
 *
 * Deliberately simple: preferences are cheap to lose and are re-derivable from
 * defaults, so this uses a plain write rather than the atomic sequence saves
 * require (ADR-002 §2).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { app } from 'electron';

import { DEFAULT_SETTINGS, parseSettings, type UiSettings } from './settings-schema';

export type { UiSettings } from './settings-schema';

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): UiSettings {
  try {
    // Parsing and per-field sanitation live in the schema (settings-schema.ts,
    // pure and unit-tested); this module owns only the disk around it.
    return parseSettings(JSON.parse(readFileSync(settingsPath(), 'utf8')));
  } catch {
    // Missing or unreadable preferences are normal on first run and never fatal.
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UiSettings): void {
  try {
    const path = settingsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  } catch {
    // Losing a preference must never interrupt play.
  }
}
