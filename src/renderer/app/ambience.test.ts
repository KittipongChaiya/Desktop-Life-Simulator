/**
 * When an ambient bed may sound. Phase-13d — ADR-023 §5.
 *
 * §5 permits continuous audio under five conditions, four of them adopted
 * verbatim from ADR-017 §2 because ambience is the audible form of the same
 * problem. This is those conditions as one function, and the tests are one per
 * condition plus the matrix that proves each is independently sufficient to
 * silence — which is the property that matters, because a bed that keeps
 * playing when any single one lapses is the always-on cost ADR-001 refuses.
 *
 * The fifth condition is a measured idle budget, which is a number in
 * `docs/perf/` rather than a branch, so it is not here.
 */

import { describe, expect, it } from 'vitest';

import { ambienceGain, createAmbienceController, type AmbienceConditions } from './ambience';
import { Sound } from './sounds';

/** Everything permitting: raining, watched, expanded, unmuted, dials up. */
const SOUNDING: AmbienceConditions = {
  triggered: true,
  muted: false,
  workMode: false,
  collapsed: false,
  present: true,
  volumePercent: 100,
  ambientPercent: 100,
};

describe('an ambient bed sounds only when everything permits it', () => {
  it('sounds when every condition holds', () => {
    expect(ambienceGain(SOUNDING)).toBeGreaterThan(0);
  });

  it('is silent with nothing producing it', () => {
    // ADR-016, restated by ADR-023 §5: "a sound with no trigger is unreachable
    // code". Rain audio without rain is a bed that plays because it exists.
    expect(ambienceGain({ ...SOUNDING, triggered: false })).toBe(0);
  });

  it('is silent while the ambient category is at zero', () => {
    // Condition 1, and the reason it is expressed as a LEVEL rather than a
    // check: `DEFAULT_CATEGORY_PERCENT.ambient` is 0, so a fresh profile is
    // silent and unmuting the game does not start ambience — the player has
    // to ask for it specifically.
    expect(ambienceGain({ ...SOUNDING, ambientPercent: 0 })).toBe(0);
  });

  it('is silent while collapsed', () => {
    // Condition 2. Collapsing tears the renderer down (ADR-001 §2); ambience
    // must not be the thing keeping the process warm.
    expect(ambienceGain({ ...SOUNDING, collapsed: true })).toBe(0);
  });

  it('is silent in work mode', () => {
    // Condition 3. Work mode silences all audio unconditionally (ADR-016 §2),
    // and a bed is not an exception to "unconditionally".
    expect(ambienceGain({ ...SOUNDING, workMode: true })).toBe(0);
  });

  it('is silent once the player stops touching the overlay', () => {
    // Condition 4, on the same signal ambient MOTION uses — a player looking
    // at the farm hears rain, a player who alt-tabbed hears nothing.
    expect(ambienceGain({ ...SOUNDING, present: false })).toBe(0);
  });

  it('is silent while muted', () => {
    expect(ambienceGain({ ...SOUNDING, muted: true })).toBe(0);
  });

  it('is silent at zero master volume', () => {
    expect(ambienceGain({ ...SOUNDING, volumePercent: 0 })).toBe(0);
  });
});

describe('every condition is independently sufficient to silence it', () => {
  // The property the phase actually needs. A bed that survives any single
  // lapse is an always-on cost wearing an opt-in label, so this asserts each
  // one alone against an otherwise-perfect state rather than trusting that
  // eight separate tests add up to it.
  const lapses: readonly [string, Partial<AmbienceConditions>][] = [
    ['no trigger', { triggered: false }],
    ['category off', { ambientPercent: 0 }],
    ['collapsed', { collapsed: true }],
    ['work mode', { workMode: true }],
    ['absent', { present: false }],
    ['muted', { muted: true }],
    ['volume off', { volumePercent: 0 }],
  ];

  it.each(lapses)('%s silences it on its own', (_label, lapse) => {
    expect(ambienceGain({ ...SOUNDING, ...lapse })).toBe(0);
  });

  it('needs every one of them back before it sounds again', () => {
    // Restoring one condition while another is still lapsed must not start it.
    const silent = { ...SOUNDING, collapsed: true, present: false };

    expect(ambienceGain({ ...silent, collapsed: false })).toBe(0);
    expect(ambienceGain({ ...silent, present: true })).toBe(0);
    expect(ambienceGain({ ...silent, collapsed: false, present: true })).toBeGreaterThan(0);
  });
});

describe('the gain it sounds at', () => {
  it('is the master dial times the ambient dial', () => {
    expect(ambienceGain({ ...SOUNDING, volumePercent: 50, ambientPercent: 50 })).toBeCloseTo(
      0.25,
      5,
    );
  });

  it('never exceeds one, so a bed cannot be the loudest thing on the desktop', () => {
    expect(ambienceGain(SOUNDING)).toBeLessThanOrEqual(1);
  });

  it('treats a dial above its range as full rather than louder', () => {
    // The dials are sanitised in main, but this is presentation code reading a
    // value that crossed a process boundary, and amplifying past unity is the
    // one arithmetic mistake here that a player would hear immediately.
    expect(ambienceGain({ ...SOUNDING, volumePercent: 400, ambientPercent: 400 })).toBe(1);
  });

  it('treats a negative dial as silence rather than as a phase inversion', () => {
    expect(ambienceGain({ ...SOUNDING, volumePercent: -50 })).toBe(0);
  });
});

describe('the controller drives the device (phase-13d)', () => {
  function harness(overrides: Partial<AmbienceConditions> = {}, duck = 1) {
    const applied: number[] = [];
    let conditions: AmbienceConditions = { ...SOUNDING, ...overrides };

    const controller = createAmbienceController({
      bed: Sound.Rain,
      device: {
        set: (_bed, gain) => applied.push(gain),
      },
      conditions: () => conditions,
      duck: () => duck,
    });

    return {
      controller,
      applied,
      set: (next: Partial<AmbienceConditions>) => {
        conditions = { ...conditions, ...next };
      },
    };
  }

  it('applies the bed at the conditions gain', () => {
    const h = harness();

    h.controller.update();

    expect(h.applied).toEqual([1]);
  });

  it('names the bed it was built for', () => {
    const beds: Sound[] = [];
    createAmbienceController({
      bed: Sound.Rain,
      device: { set: (bed) => beds.push(bed) },
      conditions: () => SOUNDING,
      duck: () => 1,
    }).update();

    expect(beds).toEqual([Sound.Rain]);
  });

  it('re-reads the conditions every update rather than capturing them', () => {
    // All seven move at runtime — the player alt-tabs, work mode toggles, the
    // rain stops. Capturing at construction would freeze the bed on whatever
    // was true at boot.
    const h = harness();
    h.controller.update();

    h.set({ present: false });
    h.controller.update();

    expect(h.applied).toEqual([1, 0]);
  });

  it('ducks a sounding bed rather than silencing it', () => {
    // ADR-023 §2: ambient attenuates under ui and world. Quieter, still there.
    const h = harness({}, 0.45);

    h.controller.update();

    expect(h.applied).toEqual([0.45]);
  });

  it('does not let ducking start a bed the conditions silenced', () => {
    // The ordering that matters. A ducked bed is quieter; a silenced one is
    // STOPPED, and the difference is whether the audio thread is still running
    // (§5 condition 4). Multiplying a zero by a duck must stay zero rather
    // than becoming "very quiet but alive".
    const h = harness({ present: false }, 0.45);

    h.controller.update();

    expect(h.applied).toEqual([0]);
  });

  it('asks for zero when the rain stops, which is what releases the thread', () => {
    const h = harness();
    h.controller.update();

    h.set({ triggered: false });
    h.controller.update();

    expect(h.applied[1]).toBe(0);
  });
});
