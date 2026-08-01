/**
 * Motion preference tests. Phase-07.7a, ADR-017 §2 and §7.
 *
 * The two properties that matter here are both about OVERRIDE WITHOUT ERASURE:
 * Reduced Motion and work mode suppress motion while the player's own choices
 * stay exactly where they left them, so turning either off restores what they
 * had. That is the same discipline `effectiveOpacityPercent` follows for the
 * opacity dial, and for the same reason — a mode that rewrites preferences
 * loses them permanently the first time it is toggled.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MOTION_SETTINGS,
  MOTION_INTENSITY_DEFAULT_PERCENT,
  MOTION_INTENSITY_MAX_PERCENT,
  MOTION_INTENSITY_MIN_PERCENT,
  effectiveMotion,
  intensityScale,
  sanitizeMotionIntensity,
  type MotionSettings,
} from './motion';

/** Every class of motion switched on — a player who opted into everything. */
const ALL_ON: MotionSettings = {
  intensityPercent: MOTION_INTENSITY_MAX_PERCENT,
  particles: true,
  cameraShake: true,
  decorativeCreatures: true,
  environmental: true,
  reducedMotion: false,
};

describe('motion defaults', () => {
  it('leaves event-driven motion on — it costs nothing at idle', () => {
    // Finite effects hold an animation lease only while they run (ADR-017 §1),
    // so a still world still draws no frames with these enabled.
    expect(DEFAULT_MOTION_SETTINGS.intensityPercent).toBe(MOTION_INTENSITY_MAX_PERCENT);
    expect(DEFAULT_MOTION_SETTINGS.particles).toBe(true);
  });

  it('leaves every UNBOUNDED class off — ADR-017 §2 condition 1', () => {
    // These never finish, so they would hold the frame loop open forever on a
    // window that sits on the player's screen all day. Opt-in, never default.
    expect(DEFAULT_MOTION_SETTINGS.environmental).toBe(false);
    expect(DEFAULT_MOTION_SETTINGS.decorativeCreatures).toBe(false);
  });

  it('leaves camera shake off — the brief asks for it disabled by default', () => {
    expect(DEFAULT_MOTION_SETTINGS.cameraShake).toBe(false);
  });

  it('does not start in reduced motion', () => {
    expect(DEFAULT_MOTION_SETTINGS.reducedMotion).toBe(false);
  });
});

describe('reduced motion — the master switch', () => {
  it('suppresses every other class at once', () => {
    const effective = effectiveMotion({ ...ALL_ON, reducedMotion: true }, { workMode: false });

    expect(effective).toEqual({
      intensityPercent: MOTION_INTENSITY_MIN_PERCENT,
      particles: false,
      cameraShake: false,
      decorativeCreatures: false,
      environmental: false,
    });
  });

  it('overrides without overwriting, so the player gets their choices back', () => {
    // The property criterion 13 names: stored values are untouched, so
    // clearing the switch restores exactly what was chosen before it.
    const stored: MotionSettings = { ...ALL_ON, reducedMotion: true };
    effectiveMotion(stored, { workMode: false });

    expect(stored.particles).toBe(true);
    expect(stored.environmental).toBe(true);
    expect(stored.intensityPercent).toBe(MOTION_INTENSITY_MAX_PERCENT);
    expect(effectiveMotion({ ...stored, reducedMotion: false }, { workMode: false })).toEqual({
      intensityPercent: MOTION_INTENSITY_MAX_PERCENT,
      particles: true,
      cameraShake: true,
      decorativeCreatures: true,
      environmental: true,
    });
  });
});

describe('work mode — ADR-017 §2 condition 3', () => {
  it('stops ambient motion and creatures, because the player said they are busy', () => {
    const effective = effectiveMotion(ALL_ON, { workMode: true });

    expect(effective.environmental).toBe(false);
    expect(effective.decorativeCreatures).toBe(false);
  });

  it('keeps finite acknowledgement of what the player does', () => {
    // Work mode strips the HUD, not the feedback: a harvest the player
    // triggered still gets its pop. Those effects end, so they cost nothing
    // once they finish.
    const effective = effectiveMotion(ALL_ON, { workMode: true });

    expect(effective.particles).toBe(true);
    expect(effective.intensityPercent).toBe(MOTION_INTENSITY_MAX_PERCENT);
  });

  it('does not overwrite the stored settings either', () => {
    const stored: MotionSettings = { ...ALL_ON };
    effectiveMotion(stored, { workMode: true });

    expect(stored.environmental).toBe(true);
    expect(stored.decorativeCreatures).toBe(true);
  });

  it('lets reduced motion win where the two overlap', () => {
    const effective = effectiveMotion({ ...ALL_ON, reducedMotion: true }, { workMode: true });
    expect(effective.intensityPercent).toBe(MOTION_INTENSITY_MIN_PERCENT);
    expect(effective.particles).toBe(false);
  });
});

describe('intensity as a multiplier', () => {
  it('maps the top of the dial to unchanged motion', () => {
    expect(intensityScale(100)).toBe(1);
  });

  it('maps the bottom to no motion at all', () => {
    // Not "a very small amount": Reduced Motion has to mean STILL.
    expect(intensityScale(0)).toBe(0);
  });

  it('is proportional in between — the dial is continuous', () => {
    expect(intensityScale(50)).toBeCloseTo(0.5, 6);
    expect(intensityScale(25)).toBeCloseTo(0.25, 6);
  });

  it('clamps out-of-range values so a curve can only ever be damped', () => {
    expect(intensityScale(-40)).toBe(0);
    expect(intensityScale(400)).toBe(1);
  });

  it('treats a malformed value as full rather than as still', () => {
    // Losing motion silently is worse than keeping it: the player can see
    // motion they did not ask for, and cannot see motion that vanished.
    expect(intensityScale(Number.NaN)).toBe(1);
  });

  it('reaches 0 through reduced motion, whatever the stored dial', () => {
    const stored: MotionSettings = { ...ALL_ON, reducedMotion: true };
    expect(intensityScale(effectiveMotion(stored).intensityPercent)).toBe(0);
  });
});

describe('the dial parses like the others', () => {
  it('passes through values already on the dial', () => {
    expect(sanitizeMotionIntensity(0)).toBe(0);
    expect(sanitizeMotionIntensity(50)).toBe(50);
    expect(sanitizeMotionIntensity(100)).toBe(100);
  });

  it('clamps to range and snaps to the step', () => {
    expect(sanitizeMotionIntensity(-30)).toBe(MOTION_INTENSITY_MIN_PERCENT);
    expect(sanitizeMotionIntensity(250)).toBe(MOTION_INTENSITY_MAX_PERCENT);
    expect(sanitizeMotionIntensity(47)).toBe(45);
    expect(sanitizeMotionIntensity(48)).toBe(50);
  });

  it('falls back for anything that is not a finite number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, null, undefined, {}, []]) {
      expect(sanitizeMotionIntensity(bad)).toBe(MOTION_INTENSITY_DEFAULT_PERCENT);
    }
  });
});

describe('migrating the 07.7a levels', () => {
  it('keeps a player who chose minimal at zero', () => {
    // The failure this exists to prevent: a bare fallback-to-default would
    // have jumped someone who asked for stillness straight to full motion.
    expect(sanitizeMotionIntensity('minimal')).toBe(0);
  });

  it('maps the other two levels onto the dial', () => {
    expect(sanitizeMotionIntensity('full')).toBe(100);
    expect(sanitizeMotionIntensity('subtle')).toBe(50);
  });

  it('still refuses a string that was never a level', () => {
    expect(sanitizeMotionIntensity('cinematic')).toBe(MOTION_INTENSITY_DEFAULT_PERCENT);
    expect(sanitizeMotionIntensity('')).toBe(MOTION_INTENSITY_DEFAULT_PERCENT);
  });
});
