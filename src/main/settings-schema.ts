/**
 * The application settings model. Phase-01.8a; categorized per
 * fix/0.1/1.8a.md (ADR-014 §4, amended).
 *
 * Pure and electron-free so vitest can cover parsing and the opacity rules;
 * `settings.ts` owns the disk I/O around it. These are application
 * preferences, NOT game state — the save system (phase-07) may never touch
 * them: loading a save never overwrites them, deleting a save never deletes
 * them, and no field here may ever affect the deterministic simulation.
 *
 * Settings are grouped in CATEGORIES so future versions add whole families
 * (input bindings, audio, graphics, language, accessibility) without breaking
 * compatibility — the tolerant per-category parse ignores what it does not
 * know and defaults what is missing.
 *
 * Deliberately absent: the hidden and click-through states (01.8b). They have
 * no persisted representation at all — a player must never start the app
 * invisible or untouchable (ADR-014 §4).
 */

import {
  AUDIO_MUTED_BY_DEFAULT,
  OPACITY_DEFAULT_PERCENT,
  OPACITY_MAX_PERCENT,
  OPACITY_MIN_PERCENT,
  OPACITY_STEP_PERCENT,
  VOLUME_DEFAULT_PERCENT,
  VOLUME_MAX_PERCENT,
  VOLUME_MIN_PERCENT,
  VOLUME_STEP_PERCENT,
} from '../shared/constants';
import {
  DEFAULT_MOTION_SETTINGS,
  sanitizeMotionIntensity,
  type MotionSettings,
} from '../shared/motion';

/** How the overlay window is arranged. */
export interface OverlaySettings {
  readonly collapsed: boolean;
}

/** The desktop-companion presence dials (ADR-014). */
export interface DesktopSettings {
  /** The presence dial's position, 30–100 in steps of 5 (`fix/0.1/1.8.md`). */
  readonly opacityPercent: number;
  /** Work mode's last state — relaunch resumes it (ADR-014 §4). */
  readonly workMode: boolean;
}

/**
 * The audio family (phase-07.5a, ADR-016) — the category this schema's header
 * anticipated. Preferences, never game state: a save may not carry them and
 * loading one may not change them.
 */
export interface AudioSettings {
  /** The volume dial's position, 0–100 in steps of 5. */
  readonly volumePercent: number;
  /** Mute, independent of the dial, so unmuting restores the chosen level. */
  readonly muted: boolean;
  /**
   * Per-category levels, 0–100. Phase-13b — ADR-023 §2.
   *
   * Preferences under the same ADR-014 §4 model as the dial: no new
   * persistence mechanism, and a save may not carry them.
   *
   * **`ambient` defaults to 0**, which is ADR-023 §5 condition 1 expressed as
   * data rather than as a check somewhere. Unmuting the game does not start
   * ambience; a player has to ask for it specifically.
   */
  readonly categoryPercent: Readonly<Record<string, number>>;
}

/**
 * The update family (phase-15, ADR-025 §6).
 *
 * Pinning is an application PREFERENCE, exactly like the dials above: it
 * changes what the application does, never what the world does, so it is not
 * save data and a save may not carry it (ADR-025 §6, under ADR-014 §4's model).
 */
export interface UpdateSettings {
  /**
   * The version the player will not be moved past, or `null` for no pin.
   *
   * A version rather than a boolean, because a pin is a CEILING: someone who
   * pinned `0.2.2` for a plugin that has not caught up should still receive
   * `0.2.1`. `update-policy.ts` reads it; this file only records it.
   */
  readonly pinnedVersion: string | null;
}

export interface AppSettings {
  readonly overlay: OverlaySettings;
  readonly desktop: DesktopSettings;
  readonly audio: AudioSettings;
  /** How much the overlay MOVES (phase-07.7a, ADR-017 §7). */
  readonly motion: MotionSettings;
  /** Whether the player has held this install at a version (phase-15). */
  readonly update: UpdateSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  overlay: { collapsed: false },
  desktop: { opacityPercent: OPACITY_DEFAULT_PERCENT, workMode: false },
  audio: {
    volumePercent: VOLUME_DEFAULT_PERCENT,
    muted: AUDIO_MUTED_BY_DEFAULT,
    categoryPercent: { ui: 100, world: 100, ambient: 0, music: 100 },
  },
  motion: DEFAULT_MOTION_SETTINGS,
  update: { pinnedVersion: null },
};

/**
 * Work mode's opacity — a mode constant deliberately BELOW the slider floor,
 * so it reads as a different state rather than a slider position (ADR-014 §2).
 * Applied by precedence in `effectiveOpacityPercent`; never written back to
 * the slider, which keeps the player's own setting untouched.
 */
export const WORK_MODE_OPACITY_PERCENT = 25;

/**
 * Clamps every known category to 0–100; anything else takes its default.
 *
 * Only the four engine categories survive. An unknown key in the file is
 * DROPPED rather than kept, because the category set is closed (ADR-023 §2) —
 * carrying a stray one forward would let a hand-edited settings file
 * reintroduce a bus the engine does not have.
 */
function sanitizeCategoryPercent(value: unknown): Readonly<Record<string, number>> {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const out: Record<string, number> = {};

  for (const [category, fallback] of Object.entries(DEFAULT_SETTINGS.audio.categoryPercent)) {
    const raw = source[category];
    out[category] =
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(0, Math.min(100, Math.round(raw)))
        : fallback;
  }

  return out;
}

/** Clamps to the dial's range and snaps to its step; anything else → default. */
export function sanitizeOpacityPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return OPACITY_DEFAULT_PERCENT;

  const clamped = Math.min(OPACITY_MAX_PERCENT, Math.max(OPACITY_MIN_PERCENT, value));
  return Math.round(clamped / OPACITY_STEP_PERCENT) * OPACITY_STEP_PERCENT;
}

/** The same treatment for the volume dial, whose floor is silence. */
export function sanitizeVolumePercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return VOLUME_DEFAULT_PERCENT;

  const clamped = Math.min(VOLUME_MAX_PERCENT, Math.max(VOLUME_MIN_PERCENT, value));
  return Math.round(clamped / VOLUME_STEP_PERCENT) * VOLUME_STEP_PERCENT;
}

/**
 * Reads a pin: a trimmed non-empty string, or `null` for no pin.
 *
 * It does NOT check that the version is real, and that restraint is the rule.
 * This function answers whether the player asked to be held; `update-policy.ts`
 * answers whether the pin can be ordered against a release, and holds when it
 * cannot. Dropping an unreadable pin here would turn "hold me here" into
 * "update me freely" before the policy ever saw it — moving a farm the player
 * asked not to move, which is the precedence rule (ADR-025 §1) inverted.
 *
 * Blank is the one string that means nothing: a cleared field in a hand-edited
 * file is how someone REMOVES a pin, not how they name a version. Trimming is
 * safe for the same reason — it can only rescue ` 0.2.1 `, never invent a pin.
 */
function sanitizePinnedVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Tolerant parse: each category and each field falls back independently, so
 * files upgrade in place and one corrupt field never discards its neighbours.
 *
 * Pre-categorization files (phase-01's `{collapsed}`, 01.8a's flat trio) are
 * read through a flat fallback per category — a present category wins; the
 * next write migrates the file to the categorized shape.
 */
export function parseSettings(value: unknown): AppSettings {
  const record = asRecord(value);
  if (record === null) return DEFAULT_SETTINGS;

  const overlay = asRecord(record['overlay']) ?? record;
  const desktop = asRecord(record['desktop']) ?? record;
  // An absent audio category is the ordinary case for every settings file
  // written before 07.5a: it falls back to the defaults, and the next write
  // adds the category in place. That is the whole point of categorising.
  const audio = asRecord(record['audio']) ?? {};
  // Likewise absent from every file written before 07.7a.
  const motion = asRecord(record['motion']) ?? {};
  // Likewise absent from every file written before phase 15.
  const update = asRecord(record['update']) ?? {};

  return {
    overlay: {
      collapsed: readBoolean(overlay['collapsed'], DEFAULT_SETTINGS.overlay.collapsed),
    },
    desktop: {
      opacityPercent: sanitizeOpacityPercent(desktop['opacityPercent']),
      workMode: readBoolean(desktop['workMode'], DEFAULT_SETTINGS.desktop.workMode),
    },
    audio: {
      volumePercent: sanitizeVolumePercent(audio['volumePercent']),
      muted: readBoolean(audio['muted'], DEFAULT_SETTINGS.audio.muted),
      categoryPercent: sanitizeCategoryPercent(audio['categoryPercent']),
    },
    motion: {
      intensityPercent: sanitizeMotionIntensity(motion['intensityPercent'] ?? motion['intensity']),
      particles: readBoolean(motion['particles'], DEFAULT_MOTION_SETTINGS.particles),
      cameraShake: readBoolean(motion['cameraShake'], DEFAULT_MOTION_SETTINGS.cameraShake),
      decorativeCreatures: readBoolean(
        motion['decorativeCreatures'],
        DEFAULT_MOTION_SETTINGS.decorativeCreatures,
      ),
      environmental: readBoolean(motion['environmental'], DEFAULT_MOTION_SETTINGS.environmental),
      reducedMotion: readBoolean(motion['reducedMotion'], DEFAULT_MOTION_SETTINGS.reducedMotion),
    },
    update: {
      pinnedVersion: sanitizePinnedVersion(update['pinnedVersion']),
    },
  };
}

/** The window's opacity under mode precedence: work mode overrides the slider. */
export function effectiveOpacityPercent(desktop: DesktopSettings): number {
  return desktop.workMode ? WORK_MODE_OPACITY_PERCENT : desktop.opacityPercent;
}
