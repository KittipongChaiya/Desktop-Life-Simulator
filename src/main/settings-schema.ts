/**
 * App-preference schema and derivations. Phase-01.8a (ADR-014 §4).
 *
 * Pure and electron-free so vitest can cover parsing and the opacity rules;
 * `settings.ts` owns the disk I/O around it. These are application
 * preferences, NOT game state — no field here may ever mirror the save, and
 * loading a save never touches them.
 *
 * Deliberately absent: the hidden and click-through states (01.8b). They have
 * no persisted representation at all — a player must never start the app
 * invisible or untouchable (ADR-014 §4).
 */

import {
  OPACITY_DEFAULT_PERCENT,
  OPACITY_MAX_PERCENT,
  OPACITY_MIN_PERCENT,
  OPACITY_STEP_PERCENT,
} from '../shared/constants';

export interface UiSettings {
  readonly collapsed: boolean;
  /** The presence dial's position, 30–100 in steps of 5 (`fix/0.1/1.8.md`). */
  readonly opacityPercent: number;
  /** Work mode's last state — relaunch resumes it (ADR-014 §4). */
  readonly workMode: boolean;
}

export const DEFAULT_SETTINGS: UiSettings = {
  collapsed: false,
  opacityPercent: OPACITY_DEFAULT_PERCENT,
  workMode: false,
};

/**
 * Work mode's opacity — a mode constant deliberately BELOW the slider floor,
 * so it reads as a different state rather than a slider position (ADR-014 §2).
 * Applied by precedence in `effectiveOpacityPercent`; never written back to
 * the slider, which keeps the player's own setting untouched.
 */
export const WORK_MODE_OPACITY_PERCENT = 25;

/** Clamps to the dial's range and snaps to its step; anything else → default. */
export function sanitizeOpacityPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return OPACITY_DEFAULT_PERCENT;

  const clamped = Math.min(OPACITY_MAX_PERCENT, Math.max(OPACITY_MIN_PERCENT, value));
  return Math.round(clamped / OPACITY_STEP_PERCENT) * OPACITY_STEP_PERCENT;
}

/**
 * Tolerant parse: each field falls back independently, so a pre-01.8 settings
 * file upgrades in place and one corrupt field never discards its neighbours.
 */
export function parseSettings(value: unknown): UiSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_SETTINGS;
  const record = value as Record<string, unknown>;

  return {
    collapsed:
      typeof record['collapsed'] === 'boolean' ? record['collapsed'] : DEFAULT_SETTINGS.collapsed,
    opacityPercent: sanitizeOpacityPercent(record['opacityPercent']),
    workMode:
      typeof record['workMode'] === 'boolean' ? record['workMode'] : DEFAULT_SETTINGS.workMode,
  };
}

/** The window's opacity under mode precedence: work mode overrides the slider. */
export function effectiveOpacityPercent(
  settings: Pick<UiSettings, 'opacityPercent' | 'workMode'>,
): number {
  return settings.workMode ? WORK_MODE_OPACITY_PERCENT : settings.opacityPercent;
}
