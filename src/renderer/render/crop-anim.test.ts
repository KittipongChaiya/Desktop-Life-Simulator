/**
 * Crop animation curve tests. Phase-07.7d.
 *
 * The property worth pinning is that every curve LANDS. A scale that ends at
 * 1.04 instead of 1 leaves the farm permanently, invisibly wrong — every crop
 * a few percent off resting size, with nothing to point at. Curves are also
 * the easiest place for a late frame to freeze something mid-swell, so the
 * clamping is asserted rather than assumed.
 */

import { describe, expect, it } from 'vitest';

import {
  animAlpha,
  animLift,
  animScale,
  clampProgress,
  CROP_ANIM_MS,
  CropAnim,
  isFinished,
  progressOf,
} from './crop-anim';

const ALL = [CropAnim.Spawn, CropAnim.Pulse, CropAnim.Depart] as const;

describe('every curve lands on resting size', () => {
  it('ends at scale 1, except depart which is leaving anyway', () => {
    expect(animScale(CropAnim.Spawn, 1)).toBeCloseTo(1, 5);
    expect(animScale(CropAnim.Pulse, 1)).toBeCloseTo(1, 5);
  });

  it('starts pulse at resting size, so a stage change does not jump', () => {
    expect(animScale(CropAnim.Pulse, 0)).toBeCloseTo(1, 5);
  });

  it('starts spawn small, so a planted crop presses in', () => {
    expect(animScale(CropAnim.Spawn, 0)).toBeLessThan(0.6);
  });

  it('overshoots resting size on the way, or it reads as a fade-in', () => {
    const peak = Math.max(
      ...Array.from({ length: 21 }, (_, i) => animScale(CropAnim.Spawn, i / 20)),
    );
    expect(peak).toBeGreaterThan(1);

    const pulsePeak = Math.max(
      ...Array.from({ length: 21 }, (_, i) => animScale(CropAnim.Pulse, i / 20)),
    );
    expect(pulsePeak).toBeGreaterThan(1.1);
  });

  it('never inverts or collapses a sprite', () => {
    for (const kind of ALL) {
      for (let i = 0; i <= 40; i += 1) {
        const scale = animScale(kind, i / 40);
        expect(scale).toBeGreaterThan(0);
        expect(scale).toBeLessThan(2);
      }
    }
  });
});

describe('opacity', () => {
  it('leaves spawn and pulse fully opaque throughout', () => {
    for (const kind of [CropAnim.Spawn, CropAnim.Pulse]) {
      for (let i = 0; i <= 10; i += 1) expect(animAlpha(kind, i / 10)).toBe(1);
    }
  });

  it('holds a departing crop visible before it goes', () => {
    // A crop that starts fading the instant it is harvested reads as a
    // rendering glitch rather than as being picked.
    expect(animAlpha(CropAnim.Depart, 0)).toBe(1);
    expect(animAlpha(CropAnim.Depart, 0.2)).toBe(1);
  });

  it('reaches fully transparent by the end', () => {
    expect(animAlpha(CropAnim.Depart, 1)).toBeCloseTo(0, 5);
  });

  it('never goes negative or above one', () => {
    for (let i = 0; i <= 40; i += 1) {
      const alpha = animAlpha(CropAnim.Depart, i / 40);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });
});

describe('lift', () => {
  it('moves only on depart', () => {
    expect(animLift(CropAnim.Spawn, 0.5)).toBe(0);
    expect(animLift(CropAnim.Pulse, 0.5)).toBe(0);
    expect(animLift(CropAnim.Depart, 0)).toBeCloseTo(0, 5);
    expect(animLift(CropAnim.Depart, 1)).toBeGreaterThan(0);
  });

  it('rises monotonically, so a harvest never stutters downward', () => {
    let previous = -1;
    for (let i = 0; i <= 20; i += 1) {
      const lift = animLift(CropAnim.Depart, i / 20);
      expect(lift).toBeGreaterThanOrEqual(previous);
      previous = lift;
    }
  });
});

describe('late and malformed frames', () => {
  it('clamps progress into range', () => {
    expect(clampProgress(-3)).toBe(0);
    expect(clampProgress(2.5)).toBe(1);
    expect(clampProgress(Number.NaN)).toBe(1);
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('leaves a sprite at rest when its frame lands past the end', () => {
    // The failure this prevents: a dropped frame freezing every crop mid-swell.
    expect(animScale(CropAnim.Pulse, 4)).toBeCloseTo(1, 5);
    expect(animScale(CropAnim.Spawn, 9)).toBeCloseTo(1, 5);
  });

  it('treats a NaN progress as finished rather than as size zero', () => {
    expect(animScale(CropAnim.Spawn, Number.NaN)).toBeCloseTo(1, 5);
  });
});

describe('timing', () => {
  it('reports progress across the window', () => {
    expect(progressOf(CropAnim.Pulse, 1000, 1000)).toBe(0);
    expect(progressOf(CropAnim.Pulse, 1000, 1000 + CROP_ANIM_MS.pulse / 2)).toBeCloseTo(0.5, 5);
    expect(progressOf(CropAnim.Pulse, 1000, 1000 + CROP_ANIM_MS.pulse)).toBe(1);
  });

  it('finishes exactly at its duration — the view destroys sprites on this', () => {
    // A departing sprite outlives its own data; if this never returned true,
    // the sprite would be retained forever.
    const start = 500;
    expect(isFinished(CropAnim.Depart, start, start + CROP_ANIM_MS.depart - 1)).toBe(false);
    expect(isFinished(CropAnim.Depart, start, start + CROP_ANIM_MS.depart)).toBe(true);
  });

  it('stays finished for any later frame', () => {
    expect(isFinished(CropAnim.Depart, 0, 10_000)).toBe(true);
  });
});
