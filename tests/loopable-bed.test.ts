/**
 * An ambient bed must not click. Phase-13d — ADR-023 §5.
 *
 * Every other generated sound is over in 200 ms, so "good enough" means it
 * makes a noise. A bed plays for an hour, which changes the standard entirely:
 * a discontinuity at the loop point is a click the player hears once per cycle,
 * forever, and it is the one artefact a bed cannot get away with.
 *
 * `loopable` is exported from the generator for exactly this reason — the same
 * arrangement `write-update-manifest.mjs` uses, where a build script's one
 * load-bearing decision is importable so it can be held to something.
 */

import { describe, expect, it } from 'vitest';

import { loopable } from '../scripts/generate-audio.mjs';

/** A ramp, so a discontinuity at the seam is unmistakable rather than subtle. */
function ramp(length: number): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i += 1) buffer[i] = i / length;
  return buffer;
}

const SAMPLE_RATE = 44_100;
const fadeSamples = (ms: number): number => Math.max(1, Math.round((ms / 1000) * SAMPLE_RATE));

describe('the loop point', () => {
  it('shortens the buffer by the crossfade, because the tail became the head', () => {
    const source = ramp(SAMPLE_RATE);

    const looped = loopable(source, 100);

    expect(looped.length).toBe(SAMPLE_RATE - fadeSamples(100));
  });

  it('leaves the last sample continuous with the first', () => {
    // THE TEST. Without the crossfade a ramp ends at ~1 and restarts at 0 — a
    // full-scale step, which is the loudest click a 16-bit sample can make.
    const looped = loopable(ramp(SAMPLE_RATE), 100);

    const first = looped[0] ?? 0;
    const last = looped[looped.length - 1] ?? 0;

    expect(Math.abs(last - first)).toBeLessThan(0.05);
  });

  it('is measurably better than not crossfading at all', () => {
    // The control. A tolerance nobody compares against is a number, not a test
    // — this pins that the fade is what closes the gap.
    const raw = ramp(SAMPLE_RATE);
    const rawStep = Math.abs((raw[raw.length - 1] ?? 0) - (raw[0] ?? 0));

    const looped = loopable(ramp(SAMPLE_RATE), 100);
    const step = Math.abs((looped[looped.length - 1] ?? 0) - (looped[0] ?? 0));

    expect(rawStep).toBeGreaterThan(0.9);
    expect(step).toBeLessThan(rawStep / 10);
  });

  it('holds loudness across the fade rather than dipping', () => {
    // Equal-power, not linear. Two uncorrelated noise sources summed linearly
    // lose about 3 dB in the middle of a crossfade, which reads as a soft spot
    // once a cycle — quieter than a click and just as periodic.
    const flat = new Float32Array(SAMPLE_RATE).fill(0.5);
    const looped = loopable(flat, 200);

    const fade = fadeSamples(200);
    let quietest = Infinity;
    for (let i = 0; i < fade; i += 1) quietest = Math.min(quietest, Math.abs(looped[i] ?? 0));

    // Equal-power holds 0.5 exactly here; linear would sag to ~0.35.
    expect(quietest).toBeGreaterThan(0.45);
  });

  it('never returns more than half the buffer to a fade longer than the sound', () => {
    const short = ramp(1_000);

    const looped = loopable(short, 10_000);

    expect(looped.length).toBe(500);
  });
});
