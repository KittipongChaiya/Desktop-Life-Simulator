/**
 * Camera focus. Phase-07.5c — `fix/0.1/7.5.md` §Camera.
 *
 * The directive's one hard constraint is "never interrupt player control", so
 * the tests that matter are the ones about NOT moving: the camera stays put
 * when the target is already visible, and abandons a glide the instant the
 * player touches anything.
 */

import { describe, expect, it } from 'vitest';

import type { CameraLimits, CameraState } from './camera';
import { createCameraFocus, FOCUS_GLIDE_MS, FOCUS_MARGIN_PX, needsFocus } from './camera-focus';

const LIMITS: CameraLimits = {
  viewportWidth: 800,
  viewportHeight: 220,
  worldWidthTiles: 64,
  worldHeightTiles: 64,
  resolution: 1,
};

const camera = (x: number, zoom = 1): CameraState => ({ x, y: 0, zoom });

describe('needsFocus — the camera moves only when it must', () => {
  it('says no for a target in the middle of the view', () => {
    // Already being looked at. Moving here would be pure disruption.
    expect(needsFocus(400, camera(0), LIMITS)).toBe(false);
  });

  it('says yes for a target off the left edge', () => {
    expect(needsFocus(10, camera(500), LIMITS)).toBe(true);
  });

  it('says yes for a target off the right edge', () => {
    expect(needsFocus(2_000, camera(0), LIMITS)).toBe(true);
  });

  it('says yes inside the margin — technically visible is not practically visible', () => {
    // A worker a few pixels from the edge is on screen and unreadable.
    expect(needsFocus(FOCUS_MARGIN_PX - 1, camera(0), LIMITS)).toBe(true);
    expect(needsFocus(FOCUS_MARGIN_PX + 1, camera(0), LIMITS)).toBe(false);
  });

  it('accounts for zoom — the same world point is elsewhere on screen', () => {
    // At zoom 2 a point at world x=500 sits at screen 1000, off an 800px view.
    expect(needsFocus(500, camera(0, 1), LIMITS)).toBe(false);
    expect(needsFocus(500, camera(0, 2), LIMITS)).toBe(true);
  });
});

describe('the glide', () => {
  it('moves from start toward target and lands EXACTLY on it', () => {
    const focus = createCameraFocus();
    focus.start(0, 400, 1_000);

    const midway = focus.sample(1_000 + FOCUS_GLIDE_MS / 2);
    expect(midway).not.toBeNull();
    expect(midway ?? 0).toBeGreaterThan(0);
    expect(midway ?? 0).toBeLessThan(400);

    // A glide that stopped a fraction short would leave the camera lying
    // about where it took the player.
    expect(focus.sample(1_000 + FOCUS_GLIDE_MS)).toBe(400);
  });

  it('finishes — one sample past the end, then nothing', () => {
    // The property the animation lease depends on: gliding must stop.
    const focus = createCameraFocus();
    focus.start(0, 400, 0);

    expect(focus.sample(FOCUS_GLIDE_MS)).toBe(400);
    expect(focus.sample(FOCUS_GLIDE_MS + 1)).toBeNull();
    expect(focus.isGliding()).toBe(false);
  });

  it('eases out — it covers more ground early than late', () => {
    const focus = createCameraFocus();
    focus.start(0, 1_000, 0);

    const firstHalf = focus.sample(FOCUS_GLIDE_MS / 2) ?? 0;
    expect(firstHalf).toBeGreaterThan(500); // past halfway at the halfway point
  });

  it('samples null when nothing was ever started', () => {
    expect(createCameraFocus().sample(0)).toBeNull();
  });

  it('a zero-distance focus never starts — no lease for no movement', () => {
    const focus = createCameraFocus();
    focus.start(250, 250, 0);

    expect(focus.isGliding()).toBe(false);
    expect(focus.sample(0)).toBeNull();
  });

  it('a new focus replaces the one in flight', () => {
    const focus = createCameraFocus();
    focus.start(0, 400, 0);
    focus.sample(FOCUS_GLIDE_MS / 2);

    focus.start(200, 900, FOCUS_GLIDE_MS / 2);

    expect(focus.sample(FOCUS_GLIDE_MS / 2 + FOCUS_GLIDE_MS)).toBe(900);
  });
});

describe('the player always wins', () => {
  it('cancel abandons a glide mid-flight, immediately', () => {
    // Not eased out, not finished early — abandoned. A camera that keeps
    // drifting after you grab it is worse than one that never moved.
    const focus = createCameraFocus();
    focus.start(0, 400, 0);
    focus.sample(FOCUS_GLIDE_MS / 4);

    focus.cancel();

    expect(focus.isGliding()).toBe(false);
    expect(focus.sample(FOCUS_GLIDE_MS / 2)).toBeNull();
  });

  it('cancelling when nothing is gliding is harmless', () => {
    // Every pan and zoom calls it, whether or not a glide is running.
    const focus = createCameraFocus();

    expect(() => {
      focus.cancel();
    }).not.toThrow();
    expect(focus.sample(0)).toBeNull();
  });

  it('a cancelled glide never resumes', () => {
    const focus = createCameraFocus();
    focus.start(0, 400, 0);
    focus.cancel();

    expect(focus.sample(FOCUS_GLIDE_MS + 1_000)).toBeNull();
  });
});
