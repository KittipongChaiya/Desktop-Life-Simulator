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

export interface UiSettings {
  readonly collapsed: boolean;
}

const DEFAULTS: UiSettings = { collapsed: false };

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): UiSettings {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsPath(), 'utf8'));

    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const collapsed = (parsed as Record<string, unknown>)['collapsed'];

    return { collapsed: typeof collapsed === 'boolean' ? collapsed : DEFAULTS.collapsed };
  } catch {
    // Missing or unreadable preferences are normal on first run and never fatal.
    return DEFAULTS;
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
