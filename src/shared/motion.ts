/**
 * Motion preferences — the third presence family. Phase-07.7a, ADR-017 §7.
 *
 * Opacity governs how much the overlay intrudes on the eye and volume how much
 * on the ear (ADR-016); these govern how much it MOVES. All three are
 * application preferences under the ADR-014 §4 model: they live in
 * `settings.json`, never in a save, and the simulation never learns they exist
 * — so no two players' worlds can diverge because one turned off butterflies.
 *
 * Shared rather than owned by main because both ends hold one: main persists
 * and sanitizes, the renderer applies. The precedence rule below is pure, so
 * it lives with the vocabulary instead of being re-implemented on each side.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE (ADR-017 §2): motion is either FINITE —
 * it acquires an animation lease, runs, and releases — or UNBOUNDED, in which
 * case it holds the frame loop open for as long as it is on. Finite motion is
 * free at idle and defaults ON. Unbounded motion is not, and defaults OFF.
 */

/**
 * How much movement each finite effect carries, as a percentage.
 *
 * A CONTINUOUS DIAL, not a set of levels. 07.7a modelled this as a three-value
 * enum, which threw away expressiveness the renderer already had: every curve
 * is damped by multiplication (`1 + (curve - 1) * strength`), so any value in
 * between was always going to work. The enum only ever limited the UI.
 *
 * The same range and step as the opacity and volume dials, because it is the
 * same kind of control and a player should not have to learn a second one.
 */
export const MOTION_INTENSITY_MIN_PERCENT = 0;
export const MOTION_INTENSITY_MAX_PERCENT = 100;
export const MOTION_INTENSITY_STEP_PERCENT = 5;
export const MOTION_INTENSITY_DEFAULT_PERCENT = 100;

/**
 * Below this, motion reads as "off" rather than "small".
 *
 * Used for the CSS accessibility state and for anything that has to make a
 * binary call about whether the interface is animating at all.
 */
export const MOTION_STILL_THRESHOLD_PERCENT = 10;

/**
 * The levels 07.7a stored, and what they mean as percentages.
 *
 * A settings file written before this change holds one of these strings. A
 * player who chose `minimal` must land on 0 rather than silently jumping to
 * full motion — which is what a bare fallback-to-default would have done, and
 * is the reason this map exists rather than letting the sanitizer shrug.
 */
const LEGACY_INTENSITY: Readonly<Record<string, number>> = {
  full: 100,
  subtle: 50,
  minimal: 0,
};

/** The six controls of the accessibility panel, as stored. */
export interface MotionSettings {
  /** Scale applied to finite effects, 0–100. */
  readonly intensityPercent: number;
  /** Dust, leaves, sparkles, coin bursts, splashes. Finite; event-driven. */
  readonly particles: boolean;
  /** Screen shake on large harvests and placements. Finite. */
  readonly cameraShake: boolean;
  /** Butterflies and birds. UNBOUNDED — see the header. */
  readonly decorativeCreatures: boolean;
  /** Grass and flag sway, windmill, smoke, clouds. UNBOUNDED. */
  readonly environmental: boolean;
  /** Master switch. Overrides the five above without overwriting them. */
  readonly reducedMotion: boolean;
}

/**
 * What a fresh profile gets.
 *
 * Finite motion on, unbounded motion off, shake off. A new player sees a farm
 * that responds to everything they do and costs nothing when they walk away —
 * which is the trade `VISION.md` §2.1 makes on their behalf.
 */
export const DEFAULT_MOTION_SETTINGS: MotionSettings = {
  intensityPercent: MOTION_INTENSITY_DEFAULT_PERCENT,
  particles: true,
  cameraShake: false,
  decorativeCreatures: false,
  environmental: false,
  reducedMotion: false,
};

/** The motion actually in force, with the stored settings left untouched. */
export interface EffectiveMotion {
  readonly intensityPercent: number;
  readonly particles: boolean;
  readonly cameraShake: boolean;
  readonly decorativeCreatures: boolean;
  readonly environmental: boolean;
}

/** Modes that suppress motion without being motion settings themselves. */
export interface MotionModes {
  /** Work mode: the player has told us they are busy (ADR-014). */
  readonly workMode: boolean;
}

/**
 * Resolves stored preferences and modes into what may actually move.
 *
 * PRECEDENCE, strongest first: Reduced Motion, then work mode, then the
 * player's individual choices. Nothing here writes back — the same discipline
 * `effectiveOpacityPercent` follows, and for the same reason: a mode that
 * rewrote preferences would destroy them on its first toggle.
 */
export function effectiveMotion(
  settings: MotionSettings,
  modes: MotionModes = { workMode: false },
): EffectiveMotion {
  if (settings.reducedMotion) {
    return {
      intensityPercent: MOTION_INTENSITY_MIN_PERCENT,
      particles: false,
      cameraShake: false,
      decorativeCreatures: false,
      environmental: false,
    };
  }

  // Work mode stops the world MOVING on its own, but not the game
  // acknowledging what the player just did — those effects end, so they cost
  // nothing once they have.
  const ambientAllowed = !modes.workMode;

  return {
    intensityPercent: settings.intensityPercent,
    particles: settings.particles,
    cameraShake: settings.cameraShake,
    decorativeCreatures: settings.decorativeCreatures && ambientAllowed,
    environmental: settings.environmental && ambientAllowed,
  };
}

/**
 * The dial as a multiplier the renderer applies directly.
 *
 * Every finite curve is damped TOWARD its resting value by this number rather
 * than skipped, so a value changed mid-animation cannot strand a sprite at the
 * wrong size — at 0 the sprite simply sits where it belongs, and no code path
 * is disabled.
 */
export function intensityScale(percent: number): number {
  if (!Number.isFinite(percent)) return 1;
  return Math.min(100, Math.max(0, percent)) / 100;
}

/**
 * Clamps to the dial's range and snaps to its step.
 *
 * Accepts the 07.7a level strings and maps them (see `LEGACY_INTENSITY`), so a
 * settings file written before the dial existed upgrades in place instead of
 * discarding what the player chose. Anything else takes the default.
 */
export function sanitizeMotionIntensity(value: unknown): number {
  if (typeof value === 'string') {
    return LEGACY_INTENSITY[value] ?? MOTION_INTENSITY_DEFAULT_PERCENT;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MOTION_INTENSITY_DEFAULT_PERCENT;
  }

  const clamped = Math.min(
    MOTION_INTENSITY_MAX_PERCENT,
    Math.max(MOTION_INTENSITY_MIN_PERCENT, value),
  );
  return Math.round(clamped / MOTION_INTENSITY_STEP_PERCENT) * MOTION_INTENSITY_STEP_PERCENT;
}
