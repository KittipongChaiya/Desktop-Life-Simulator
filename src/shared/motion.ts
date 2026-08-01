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

/** How much movement each finite effect carries. */
export const MotionIntensity = {
  /** The full pass — every easing, bounce, and follow-through. */
  Full: 'full',
  /** Shortened and shallower: the acknowledgement without the flourish. */
  Subtle: 'subtle',
  /** A state change, near-instant. What Reduced Motion forces. */
  Minimal: 'minimal',
} as const;

export type MotionIntensity = (typeof MotionIntensity)[keyof typeof MotionIntensity];

const INTENSITIES: readonly string[] = [
  MotionIntensity.Full,
  MotionIntensity.Subtle,
  MotionIntensity.Minimal,
];

/** The six controls of the accessibility panel, as stored. */
export interface MotionSettings {
  /** Scale applied to finite effects. */
  readonly intensity: MotionIntensity;
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
  intensity: MotionIntensity.Full,
  particles: true,
  cameraShake: false,
  decorativeCreatures: false,
  environmental: false,
  reducedMotion: false,
};

/** The motion actually in force, with the stored settings left untouched. */
export interface EffectiveMotion {
  readonly intensity: MotionIntensity;
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
      intensity: MotionIntensity.Minimal,
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
    intensity: settings.intensity,
    particles: settings.particles,
    cameraShake: settings.cameraShake,
    decorativeCreatures: settings.decorativeCreatures && ambientAllowed,
    environmental: settings.environmental && ambientAllowed,
  };
}

/**
 * An intensity level as a multiplier the renderer can apply directly.
 *
 * Every finite curve is damped TOWARD its resting value by this number rather
 * than skipped, so a level changed mid-animation cannot strand a sprite at the
 * wrong size — at 0 the sprite simply sits where it belongs, and no code path
 * is disabled.
 */
export function intensityScale(intensity: MotionIntensity): number {
  if (intensity === MotionIntensity.Minimal) return 0;
  return intensity === MotionIntensity.Subtle ? 0.5 : 1;
}

/** Settings files are untrusted input; anything unrecognised takes the default. */
export function sanitizeMotionIntensity(value: unknown): MotionIntensity {
  return typeof value === 'string' && INTENSITIES.includes(value)
    ? (value as MotionIntensity)
    : DEFAULT_MOTION_SETTINGS.intensity;
}
