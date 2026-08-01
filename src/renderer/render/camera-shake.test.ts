/**
 * Camera shake tests. Phase-07.7g.
 *
 * The endpoint is the whole test file. A shake that ends a fraction of a pixel
 * off leaves the camera permanently displaced, and every later shake displaces
 * it further — a drift that accumulates over a session with no single frame to
 * blame it on. Everything else here is secondary to asserting it lands on zero.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SHAKE,
  HARVEST_BURST_MS,
  LARGE_HARVEST_COUNT,
  PLACEMENT_SHAKE,
  isShakeFinished,
  shakeOffset,
  type ShakeConfig,
} from './camera-shake';

const CONFIGS: readonly ShakeConfig[] = [DEFAULT_SHAKE, PLACEMENT_SHAKE];

describe('it lands on zero', () => {
  it('is exactly zero at the end', () => {
    for (const config of CONFIGS) {
      expect(shakeOffset(config, config.durationMs, 1)).toEqual({ x: 0, y: 0 });
    }
  });

  it('stays exactly zero forever after', () => {
    for (const config of CONFIGS) {
      expect(shakeOffset(config, config.durationMs + 5000, 1)).toEqual({ x: 0, y: 0 });
    }
  });

  it('is zero before it starts', () => {
    expect(shakeOffset(DEFAULT_SHAKE, -1, 1)).toEqual({ x: 0, y: 0 });
  });

  it('does not accumulate across a hundred shakes', () => {
    // The drift this file exists to prevent, simulated: run many shakes to
    // completion and confirm each one's final offset is a true zero.
    let driftX = 0;
    let driftY = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      const end = shakeOffset(DEFAULT_SHAKE, DEFAULT_SHAKE.durationMs, seed);
      driftX += end.x;
      driftY += end.y;
    }
    expect(driftX).toBe(0);
    expect(driftY).toBe(0);
  });

  it('handles a malformed elapsed time as rest rather than flinging the camera', () => {
    expect(shakeOffset(DEFAULT_SHAKE, Number.NaN, 1)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(DEFAULT_SHAKE, Number.POSITIVE_INFINITY, 1)).toEqual({ x: 0, y: 0 });
  });

  it('treats a zero-duration config as no shake at all', () => {
    expect(shakeOffset({ ...DEFAULT_SHAKE, durationMs: 0 }, 0, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe('the motion itself', () => {
  it('stays within the configured strength', () => {
    for (const config of CONFIGS) {
      for (let ms = 0; ms < config.durationMs; ms += 2) {
        const offset = shakeOffset(config, ms, 7);
        expect(Math.abs(offset.x)).toBeLessThanOrEqual(config.strengthPx + 1e-9);
        expect(Math.abs(offset.y)).toBeLessThanOrEqual(config.strengthPx + 1e-9);
      }
    }
  });

  it('decays — the second half is gentler than the first', () => {
    const peak = (from: number, to: number): number => {
      let max = 0;
      for (let ms = from; ms < to; ms += 1) {
        max = Math.max(max, Math.abs(shakeOffset(DEFAULT_SHAKE, ms, 3).x));
      }
      return max;
    };
    const half = DEFAULT_SHAKE.durationMs / 2;
    expect(peak(half, DEFAULT_SHAKE.durationMs)).toBeLessThan(peak(0, half));
  });

  it('actually moves', () => {
    const samples = Array.from({ length: 60 }, (_, i) => shakeOffset(DEFAULT_SHAKE, i * 2, 5).x);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(1);
  });

  it('does not trace a diagonal — the axes are out of step', () => {
    const offset = shakeOffset(DEFAULT_SHAKE, 40, 11);
    expect(Math.abs(Math.abs(offset.x) - Math.abs(offset.y))).toBeGreaterThan(0.01);
  });

  it('shakes differently for different triggers', () => {
    expect(shakeOffset(DEFAULT_SHAKE, 30, 1).x).not.toBeCloseTo(
      shakeOffset(DEFAULT_SHAKE, 30, 2).x,
      3,
    );
  });

  it('is derived, so a replay shakes identically', () => {
    expect(shakeOffset(DEFAULT_SHAKE, 30, 42)).toEqual(shakeOffset(DEFAULT_SHAKE, 30, 42));
  });
});

describe('strength damping', () => {
  it('scales the whole shake', () => {
    const full = shakeOffset(DEFAULT_SHAKE, 30, 9, 1);
    const half = shakeOffset(DEFAULT_SHAKE, 30, 9, 0.5);
    expect(Math.abs(half.x)).toBeCloseTo(Math.abs(full.x) / 2, 6);
  });

  it('stills the camera completely at zero — what Reduced Motion produces', () => {
    for (let ms = 0; ms < DEFAULT_SHAKE.durationMs; ms += 10) {
      expect(shakeOffset(DEFAULT_SHAKE, ms, 9, 0)).toEqual({ x: 0, y: 0 });
    }
  });
});

describe('completion', () => {
  it('reports finished exactly at the duration', () => {
    expect(isShakeFinished(DEFAULT_SHAKE, 100, 100 + DEFAULT_SHAKE.durationMs - 1)).toBe(false);
    expect(isShakeFinished(DEFAULT_SHAKE, 100, 100 + DEFAULT_SHAKE.durationMs)).toBe(true);
  });
});

describe('what counts as a large harvest', () => {
  it('never reacts to a single crop', () => {
    // A farm that jolts every few seconds is unusable as a companion; the
    // routine case has to be silent.
    expect(LARGE_HARVEST_COUNT).toBeGreaterThan(1);
  });

  it('counts over a window short enough to mean "together"', () => {
    expect(HARVEST_BURST_MS).toBeLessThanOrEqual(1000);
  });
});
