/**
 * Phase-13a — the voice pool, in Node, with no browser.
 *
 * That it runs here at all is the point ADR-016 §1 makes and ADR-023 §1
 * restates: the interesting part of audio must stay testable without a device.
 * A pool that could only be checked against a real `AudioContext` would be a
 * pool nobody checks.
 */

import { describe, expect, it } from 'vitest';

import { createVoicePool, VOICE_POOL_CAPACITY } from './voice-pool';

describe('claiming a voice', () => {
  it('hands out a distinct slot while any are free', () => {
    const pool = createVoicePool(4);
    const slots = [0, 1, 2, 3].map(() => pool.claim(0, 100).slot);

    expect(new Set(slots).size).toBe(4);
  });

  it('does not report a free slot as recycled', () => {
    // The metric has to mean something: a finished voice being reused is not
    // a voice being cut short.
    const pool = createVoicePool(2);
    expect(pool.claim(0, 100).recycled).toBe(false);
    expect(pool.claim(0, 100).recycled).toBe(false);
  });

  it('reuses a slot whose voice has finished', () => {
    const pool = createVoicePool(1);
    const first = pool.claim(0, 100);
    const second = pool.claim(200, 300);

    expect(second.slot).toBe(first.slot);
    expect(second.recycled).toBe(false);
  });

  it('reuses a slot ending exactly now', () => {
    // A voice that ends at this instant is over. Treating it as live would
    // make the pool one voice smaller than it says it is.
    const pool = createVoicePool(1);
    pool.claim(0, 100);
    expect(pool.claim(100, 200).recycled).toBe(false);
  });
});

describe('at capacity (ADR-017 §4)', () => {
  it('recycles rather than refusing', () => {
    // Refusing to play and stealing an old voice are the same thing to a
    // listener, and stealing is what a mixer does.
    const pool = createVoicePool(2);
    pool.claim(0, 1_000);
    pool.claim(1, 1_000);

    const third = pool.claim(2, 1_000);
    expect(third.recycled).toBe(true);
    expect(third.slot).toBeGreaterThanOrEqual(0);
    expect(third.slot).toBeLessThan(2);
  });

  it('steals the voice claimed longest ago', () => {
    const pool = createVoicePool(2);
    const oldest = pool.claim(0, 5_000).slot;
    pool.claim(10, 5_000);

    expect(pool.claim(20, 5_000).slot).toBe(oldest);
  });

  it('steals by CLAIM time, not by end time', () => {
    // Otherwise a long sound outlasts everything and can never be recycled,
    // so one accidental five-minute buffer would permanently cost a voice.
    // BOTH voices must still be sounding, or the free-slot scan answers first
    // and the tie-break never runs — which is what the first version of this
    // test did, passing for a reason it was not about.
    const pool = createVoicePool(2);
    const longOne = pool.claim(0, 999_999).slot;
    pool.claim(10, 500);

    // At t=20 both are live. By claim time the long one is oldest; by end
    // time it would be the last thing chosen. The two rules disagree here,
    // which is the only reason this assertion means anything.
    expect(pool.claim(20, 100).slot).toBe(longOne);
  });

  it('never exceeds its capacity however many claims arrive', () => {
    const pool = createVoicePool(3);
    for (let i = 0; i < 500; i += 1) pool.claim(i, i + 10_000);

    expect(pool.activeAt(600)).toBe(3);
  });

  it('always returns a slot inside the pool', () => {
    const pool = createVoicePool(3);
    for (let i = 0; i < 200; i += 1) {
      const { slot } = pool.claim(i, i + 1_000);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(3);
    }
  });
});

describe('activity and teardown', () => {
  it('counts only voices still sounding', () => {
    const pool = createVoicePool(4);
    pool.claim(0, 50);
    pool.claim(0, 500);

    expect(pool.activeAt(10)).toBe(2);
    expect(pool.activeAt(100)).toBe(1);
    expect(pool.activeAt(1_000)).toBe(0);
  });

  it('is empty after clear, so nothing outlives a teardown', () => {
    const pool = createVoicePool(4);
    pool.claim(0, 10_000);
    pool.claim(0, 10_000);

    pool.clear();

    expect(pool.activeAt(0)).toBe(0);
    expect(pool.claim(0, 10).recycled).toBe(false);
  });

  it('refuses to be built with a nonsensical capacity', () => {
    // A zero-capacity pool would divide the mixer by zero voices; one is the
    // floor rather than an error, because silence is not worth a crash.
    expect(createVoicePool(0).capacity).toBe(1);
    expect(createVoicePool(-5).capacity).toBe(1);
    expect(createVoicePool(2.7).capacity).toBe(2);
  });

  it('ships a capacity the coalescing window makes hard to reach', () => {
    expect(VOICE_POOL_CAPACITY).toBeGreaterThan(1);
  });
});
