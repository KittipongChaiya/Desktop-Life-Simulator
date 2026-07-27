/**
 * The sound bus. Phase-07.5a — ADR-016, `fix/0.1/7.5.md` §Audio.
 *
 * The bus decides whether a sound is AUDIBLE and at what gain; it never
 * decides what a sound is or how to make noise. The properties that matter are
 * the ones that keep an overlay from becoming an intrusion: muted by default,
 * silent in work mode, and incapable of stacking a burst of simultaneous
 * events into a wall of sound.
 */

import { describe, expect, it, vi } from 'vitest';

import { createSoundBus, SOUND_COALESCE_MS, type AudioPorts } from './audio';
import { Sound, SOUND_GAIN } from './sounds';

interface Harness {
  readonly ports: AudioPorts;
  /** Every (sound, gain) pair the port was asked to play. */
  played(): { sound: Sound; gain: number }[];
  advance(ms: number): void;
}

function harness(options: { throws?: boolean } = {}): Harness {
  const played: { sound: Sound; gain: number }[] = [];
  let now = 1_000;

  return {
    ports: {
      play: (sound, gain) => {
        if (options.throws === true) throw new Error('no audio device');
        played.push({ sound, gain });
      },
      now: () => now,
    },
    played: () => played,
    advance: (ms) => {
      now += ms;
    },
  };
}

/** The bus as the app builds it: a mute state and a work-mode flag it reads. */
function bus(
  ports: AudioPorts,
  state: { volumePercent: number; muted: boolean; workMode: boolean },
): ReturnType<typeof createSoundBus> {
  return createSoundBus(ports, {
    volumePercent: () => state.volumePercent,
    muted: () => state.muted,
    workMode: () => state.workMode,
  });
}

describe('audibility', () => {
  it('plays at master volume times the sound’s own mix', () => {
    const h = harness();
    bus(h.ports, { volumePercent: 50, muted: false, workMode: false }).play(Sound.Coin);

    expect(h.played()).toEqual([{ sound: Sound.Coin, gain: 0.5 * SOUND_GAIN[Sound.Coin] }]);
  });

  it('is silent when muted', () => {
    const h = harness();
    bus(h.ports, { volumePercent: 100, muted: true, workMode: false }).play(Sound.Coin);

    expect(h.played()).toEqual([]);
  });

  it('is silent at zero volume — no inaudible calls into the device', () => {
    const h = harness();
    bus(h.ports, { volumePercent: 0, muted: false, workMode: false }).play(Sound.Coin);

    expect(h.played()).toEqual([]);
  });

  it('is silent in WORK MODE regardless of the setting (ADR-014)', () => {
    // Work mode exists so the overlay stops competing for attention. A sound
    // that plays through it defeats the entire mode.
    const h = harness();
    bus(h.ports, { volumePercent: 100, muted: false, workMode: true }).play(Sound.Coin);

    expect(h.played()).toEqual([]);
  });

  it('reads the state at PLAY time, not at construction', () => {
    // The player changes volume mid-session; the bus is built once at boot.
    const h = harness();
    const state = { volumePercent: 100, muted: true, workMode: false };
    const sound = bus(h.ports, state);

    sound.play(Sound.Coin);
    state.muted = false;
    sound.play(Sound.Coin);

    expect(h.played()).toHaveLength(1);
  });
});

describe('coalescing — a burst is one sound, not a wall', () => {
  it('collapses the same sound repeated inside the window', () => {
    // Three workers finishing on the same tick is a real and ordinary state.
    // Playing three overlapping harvest samples is what makes idle games
    // exhausting to leave running.
    const h = harness();
    const sound = bus(h.ports, { volumePercent: 100, muted: false, workMode: false });

    sound.play(Sound.Harvest);
    sound.play(Sound.Harvest);
    sound.play(Sound.Harvest);

    expect(h.played()).toHaveLength(1);
  });

  it('plays again once the window has passed', () => {
    const h = harness();
    const sound = bus(h.ports, { volumePercent: 100, muted: false, workMode: false });

    sound.play(Sound.Harvest);
    h.advance(SOUND_COALESCE_MS + 1);
    sound.play(Sound.Harvest);

    expect(h.played()).toHaveLength(2);
  });

  it('never collapses DIFFERENT sounds — they carry different meanings', () => {
    const h = harness();
    const sound = bus(h.ports, { volumePercent: 100, muted: false, workMode: false });

    sound.play(Sound.Harvest);
    sound.play(Sound.Coin);
    sound.play(Sound.Deposit);

    expect(h.played().map((entry) => entry.sound)).toEqual([
      Sound.Harvest,
      Sound.Coin,
      Sound.Deposit,
    ]);
  });

  it('does not start the window while inaudible — unmuting is not a burst', () => {
    // A muted session must not queue up suppressions that all fire on unmute,
    // nor leave a stale timestamp that swallows the first real sound.
    const h = harness();
    const state = { volumePercent: 100, muted: true, workMode: false };
    const sound = bus(h.ports, state);

    sound.play(Sound.Harvest);
    state.muted = false;
    sound.play(Sound.Harvest);

    expect(h.played()).toHaveLength(1);
  });
});

describe('failure is never the player’s problem', () => {
  it('swallows a device error — no audio must never break the game', () => {
    const h = harness({ throws: true });
    const sound = bus(h.ports, { volumePercent: 100, muted: false, workMode: false });

    expect(() => {
      sound.play(Sound.Coin);
    }).not.toThrow();
  });

  it('keeps working after a failure', () => {
    let fail = true;
    const played: Sound[] = [];
    const sound = createSoundBus(
      {
        play: (s) => {
          if (fail) throw new Error('device busy');
          played.push(s);
        },
        now: () => 0,
      },
      { volumePercent: () => 100, muted: () => false, workMode: () => false },
    );

    sound.play(Sound.Coin);
    fail = false;
    sound.play(Sound.Error);

    expect(played).toEqual([Sound.Error]);
  });
});

describe('the mix', () => {
  it('gives every catalogued sound a gain — a missing one would play at full volume', () => {
    for (const sound of Object.values(Sound)) {
      expect(SOUND_GAIN[sound]).toBeGreaterThan(0);
      expect(SOUND_GAIN[sound]).toBeLessThanOrEqual(1);
    }
  });

  it('never exceeds unity gain at full volume', () => {
    const h = harness();
    const sound = bus(h.ports, { volumePercent: 100, muted: false, workMode: false });

    for (const name of Object.values(Sound)) sound.play(name);

    for (const entry of h.played()) expect(entry.gain).toBeLessThanOrEqual(1);
  });

  it('does not call the device when a sound was suppressed', () => {
    const h = harness();
    const spy = vi.spyOn(h.ports, 'play');
    bus(h.ports, { volumePercent: 100, muted: true, workMode: false }).play(Sound.Coin);

    expect(spy).not.toHaveBeenCalled();
  });
});
