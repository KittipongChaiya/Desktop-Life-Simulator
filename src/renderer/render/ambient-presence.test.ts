/**
 * Presence tests. Phase-07.7j, ADR-017 §2 condition 4.
 *
 * This is the mechanism the whole ambient-motion exception rests on, so the
 * property under test is the one the ADR promised: **it goes absent on its
 * own.** If it did not, ambient motion would hold the frame loop open forever
 * and ADR-001's invariant would be repealed rather than restated — which is
 * the difference between an amendment and a hole.
 */

import { describe, expect, it } from 'vitest';

import { AMBIENT_IDLE_TIMEOUT_MS, createAmbientPresence } from './ambient-presence';

describe('starting state', () => {
  it('is ABSENT before anything has happened', () => {
    // A freshly-mounted overlay nobody has touched must not be animating; the
    // opposite default would spend frames on a window that was merely opened.
    expect(createAmbientPresence().isPresent(0)).toBe(false);
  });

  it('stays absent however much time passes without a touch', () => {
    const presence = createAmbientPresence();
    expect(presence.isPresent(10_000_000)).toBe(false);
  });
});

describe('it goes absent on its own — the load-bearing property', () => {
  it('is present immediately after a touch', () => {
    const presence = createAmbientPresence();
    presence.touch(1000);
    expect(presence.isPresent(1000)).toBe(true);
  });

  it('is still present just before the timeout', () => {
    const presence = createAmbientPresence();
    presence.touch(1000);
    expect(presence.isPresent(1000 + AMBIENT_IDLE_TIMEOUT_MS - 1)).toBe(true);
  });

  it('is ABSENT exactly at the timeout', () => {
    const presence = createAmbientPresence();
    presence.touch(1000);
    expect(presence.isPresent(1000 + AMBIENT_IDLE_TIMEOUT_MS)).toBe(false);
  });

  it('stays absent for the rest of the session', () => {
    // The failure this prevents: motion that resumes on its own and quietly
    // keeps the frame loop alive on a window nobody is looking at.
    const presence = createAmbientPresence();
    presence.touch(1000);
    for (const later of [30_000, 600_000, 8 * 60 * 60 * 1000]) {
      expect(presence.isPresent(later)).toBe(false);
    }
  });
});

describe('waking again', () => {
  it('returns on the next touch', () => {
    const presence = createAmbientPresence();
    presence.touch(0);
    expect(presence.isPresent(AMBIENT_IDLE_TIMEOUT_MS)).toBe(false);

    presence.touch(AMBIENT_IDLE_TIMEOUT_MS);
    expect(presence.isPresent(AMBIENT_IDLE_TIMEOUT_MS)).toBe(true);
  });

  it('extends the window from the LATEST touch, not the first', () => {
    const presence = createAmbientPresence();
    presence.touch(0);
    presence.touch(5000);
    // Would have expired at 8000 from the first touch; runs to 13000 now.
    expect(presence.isPresent(10_000)).toBe(true);
    expect(presence.isPresent(13_000)).toBe(false);
  });

  it('survives many touches without drifting', () => {
    const presence = createAmbientPresence();
    for (let t = 0; t <= 100_000; t += 500) presence.touch(t);
    expect(presence.isPresent(100_000)).toBe(true);
    expect(presence.isPresent(100_000 + AMBIENT_IDLE_TIMEOUT_MS)).toBe(false);
  });
});

describe('clearing', () => {
  it('goes absent at once — what collapsing the overlay does', () => {
    // Collapsed mode destroys the renderer entirely (ADR-001 §2); presence
    // must not survive to animate the next scene the moment it is rebuilt.
    const presence = createAmbientPresence();
    presence.touch(1000);
    presence.clear();
    expect(presence.isPresent(1000)).toBe(false);
  });

  it('can be woken again after clearing', () => {
    const presence = createAmbientPresence();
    presence.touch(1000);
    presence.clear();
    presence.touch(2000);
    expect(presence.isPresent(2000)).toBe(true);
  });
});

describe('bad input', () => {
  it('ignores a malformed timestamp rather than becoming permanently present', () => {
    const presence = createAmbientPresence();
    presence.touch(Number.NaN);
    expect(presence.isPresent(0)).toBe(false);

    presence.touch(Number.POSITIVE_INFINITY);
    expect(presence.isPresent(0)).toBe(false);
  });

  it('treats a frame landing before the touch as present', () => {
    // A clock adjustment must not read as "absent for a negative duration".
    const presence = createAmbientPresence();
    presence.touch(5000);
    expect(presence.isPresent(4000)).toBe(true);
  });
});

describe('configurability', () => {
  it('honours a custom timeout', () => {
    const presence = createAmbientPresence(1000);
    presence.touch(0);
    expect(presence.isPresent(999)).toBe(true);
    expect(presence.isPresent(1000)).toBe(false);
  });
});
