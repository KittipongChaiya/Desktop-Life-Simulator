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
  MotionIntensity,
  effectiveMotion,
  intensityScale,
  sanitizeMotionIntensity,
  type MotionSettings,
} from './motion';

/** Every class of motion switched on — a player who opted into everything. */
const ALL_ON: MotionSettings = {
  intensity: MotionIntensity.Full,
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
    expect(DEFAULT_MOTION_SETTINGS.intensity).toBe(MotionIntensity.Full);
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
      intensity: MotionIntensity.Minimal,
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
    expect(stored.intensity).toBe(MotionIntensity.Full);
    expect(effectiveMotion({ ...stored, reducedMotion: false }, { workMode: false })).toEqual({
      intensity: MotionIntensity.Full,
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
    expect(effective.intensity).toBe(MotionIntensity.Full);
  });

  it('does not overwrite the stored settings either', () => {
    const stored: MotionSettings = { ...ALL_ON };
    effectiveMotion(stored, { workMode: true });

    expect(stored.environmental).toBe(true);
    expect(stored.decorativeCreatures).toBe(true);
  });

  it('lets reduced motion win where the two overlap', () => {
    const effective = effectiveMotion({ ...ALL_ON, reducedMotion: true }, { workMode: true });
    expect(effective.intensity).toBe(MotionIntensity.Minimal);
    expect(effective.particles).toBe(false);
  });
});

describe('intensity as a multiplier', () => {
  it('maps full to unchanged motion', () => {
    expect(intensityScale(MotionIntensity.Full)).toBe(1);
  });

  it('maps minimal to no motion at all', () => {
    // Not "a very small amount": Reduced Motion has to mean STILL.
    expect(intensityScale(MotionIntensity.Minimal)).toBe(0);
  });

  it('places subtle strictly between the two', () => {
    const subtle = intensityScale(MotionIntensity.Subtle);
    expect(subtle).toBeGreaterThan(0);
    expect(subtle).toBeLessThan(1);
  });

  it('stays inside [0, 1], so a curve can only ever be damped', () => {
    for (const level of [MotionIntensity.Full, MotionIntensity.Subtle, MotionIntensity.Minimal]) {
      const scale = intensityScale(level);
      expect(scale).toBeGreaterThanOrEqual(0);
      expect(scale).toBeLessThanOrEqual(1);
    }
  });

  it('reaches 0 through reduced motion, whatever the stored level', () => {
    // The end-to-end shape the renderer relies on.
    const stored: MotionSettings = { ...ALL_ON, reducedMotion: true };
    expect(intensityScale(effectiveMotion(stored).intensity)).toBe(0);
  });
});

describe('intensity parsing', () => {
  it('accepts each declared level', () => {
    for (const level of [MotionIntensity.Full, MotionIntensity.Subtle, MotionIntensity.Minimal]) {
      expect(sanitizeMotionIntensity(level)).toBe(level);
    }
  });

  it('falls back to the default for anything else', () => {
    // Settings files are untrusted input like any other boundary.
    for (const bad of ['', 'FULL', 'off', 0, null, undefined, {}, []]) {
      expect(sanitizeMotionIntensity(bad)).toBe(DEFAULT_MOTION_SETTINGS.intensity);
    }
  });
});
