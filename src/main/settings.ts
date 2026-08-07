/**
 * UI preferences — where they live on this machine.
 *
 * NOT game state. `settings.json` holds how the player likes the overlay
 * arranged; the save file holds the world (SAVE_FORMAT.md §1). Conflating them
 * would mean a corrupt preference file could take out a save.
 *
 * Everything except the location is in `settings-store.ts`, which takes the
 * directory as a parameter and is therefore pure Node and unit-tested. What is
 * left here is the one thing only Electron can answer — where `userData` is —
 * which is why this module is a registered host binding
 * (`coverage-policy.config.ts`, `TESTING.md` §4.2) and its store is not.
 */

import { app } from 'electron';

import type { AppSettings } from './settings-schema';
import { readSettingsFrom, writeSettingsTo } from './settings-store';

export type { AppSettings } from './settings-schema';

function settingsDir(): string {
  return app.getPath('userData');
}

export function loadSettings(): AppSettings {
  return readSettingsFrom(settingsDir());
}

export function saveSettings(settings: AppSettings): void {
  writeSettingsTo(settingsDir(), settings);
}
