/**
 * Phase-10c — the tint transition's arithmetic and, far more importantly, its
 * lifetime.
 *
 * `running` is what the view hands to its animation lease. A transition that
 * never reports `false` is a permanent frame cost that looks exactly like
 * normal operation (ADR-001 §1), so most of this file is about when it stops.
 */

import { describe, expect, it } from 'vitest';

import { CLEAR, createTintTransition, lerpTint, tintsEqual, type Tint } from './lighting-state';

const DURATION = 900;
const NIGHT: Tint = { color: 0x1b2a6b, alpha: 0.4 };
const DAY: Tint = { color: 0xffffff, alpha: 0 };

describe('lerpTint', () => {
  it('returns the start at t=0 and the end at t=1', () => {
    expect(lerpTint(DAY, NIGHT, 0)).toEqual(DAY);
    expect(lerpTint(DAY, NIGHT, 1)).toEqual(NIGHT);
  });

  it('clamps outside the unit interval rather than extrapolating', () => {
    // An overshoot would produce a colour neither end registered — and with
    // alpha, one outside 0–1 that Pixi would clamp silently.
    expect(lerpTint(DAY, NIGHT, -5)).toEqual(DAY);
    expect(lerpTint(DAY, NIGHT, 5)).toEqual(NIGHT);
  });

  it('interpolates each channel independently', () => {
    const mid = lerpTint({ color: 0x000000, alpha: 0 }, { color: 0xff8800, alpha: 1 }, 0.5);

    expect(mid.color).toBe(0x804400);
    expect(mid.alpha).toBe(0.5);
  });

  it('keeps every channel a byte', () => {
    // A rounding slip here produces a colour with bits in the wrong channel —
    // a green sunset, and nothing in the type system to catch it.
    for (let step = 0; step <= 20; step += 1) {
      const { color } = lerpTint(
        { color: 0x000000, alpha: 0 },
        { color: 0xffffff, alpha: 1 },
        step / 20,
      );
      for (const shift of [16, 8, 0]) {
        const channel = (color >> shift) & 0xff;
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(0xff);
      }
    }
  });
});

describe('tintsEqual', () => {
  it('separates colour and alpha differences', () => {
    expect(tintsEqual(NIGHT, { ...NIGHT })).toBe(true);
    expect(tintsEqual(NIGHT, { ...NIGHT, alpha: 0.39 })).toBe(false);
    expect(tintsEqual(NIGHT, { ...NIGHT, color: 0x1b2a6c })).toBe(false);
  });
});

describe('a transition ends (ADR-017 §1)', () => {
  it('is not running before anything is aimed at', () => {
    expect(createTintTransition(DURATION).sample(0).running).toBe(false);
  });

  it('runs while the duration has not elapsed', () => {
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, false);

    expect(transition.sample(1000).running).toBe(true);
    expect(transition.sample(1000 + DURATION / 2).running).toBe(true);
  });

  it('STOPS running once the duration has elapsed', () => {
    // The single most important assertion in this file: this is the frame cost
    // going away.
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, false);
    transition.sample(1000);

    expect(transition.sample(1000 + DURATION).running).toBe(false);
  });

  it('stays stopped, and keeps reporting the target', () => {
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, false);
    transition.sample(1000);
    transition.sample(1000 + DURATION);

    for (const at of [2000, 5000, 100_000]) {
      const sample = transition.sample(at);
      expect(sample.running).toBe(false);
      expect(sample.tint).toEqual(NIGHT);
    }
  });

  it('measures from the first frame, not from the aim', () => {
    // `to` is called from a sim-driven update; the next frame may be an
    // arbitrary gap later. Starting the clock at the aim would let a
    // transition finish before anything ever drew it.
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, false);

    const first = transition.sample(50_000);
    expect(first.running).toBe(true);
    expect(first.tint).toEqual(CLEAR);
    expect(transition.sample(50_000 + DURATION - 1).running).toBe(true);
  });
});

describe('snapping', () => {
  it('arrives immediately and never runs', () => {
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, true);

    const sample = transition.sample(0);
    expect(sample.tint).toEqual(NIGHT);
    expect(sample.running).toBe(false);
  });

  it('does not leave a transition armed for the next sample', () => {
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, true);
    transition.sample(0);

    expect(transition.sample(10_000).running).toBe(false);
  });
});

describe('re-aiming mid-transition', () => {
  it('continues from what is on screen rather than jumping back', () => {
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, false);
    transition.sample(0);
    const halfway = transition.sample(DURATION / 2).tint;

    transition.to(DAY, false);
    const next = transition.sample(DURATION / 2).tint;

    // The first sample after re-aiming is where the last one left off, not the
    // start of the abandoned fade.
    expect(next).toEqual(halfway);
  });

  it('still ends, on the new target', () => {
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, false);
    transition.sample(0);
    transition.sample(DURATION / 2);

    transition.to(DAY, false);
    transition.sample(DURATION / 2);
    const settled = transition.sample(DURATION / 2 + DURATION);

    expect(settled.running).toBe(false);
    expect(settled.tint).toEqual(DAY);
  });
});

describe('aiming at the tint already shown', () => {
  it('never starts a transition, so no frames are spent painting nothing', () => {
    // Two phases may legitimately register the same tint.
    const transition = createTintTransition(DURATION);
    transition.to(NIGHT, true);
    transition.sample(0);

    transition.to({ ...NIGHT }, false);

    expect(transition.sample(1).running).toBe(false);
  });
});
