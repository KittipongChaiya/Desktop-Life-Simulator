/**
 * Phase-13a — the device layer, against a hand-written fake host.
 *
 * `TESTING.md` §2 rules out a mocking framework, and phase-08.0 established
 * the alternative: parameterise the host. The fake below is forty lines of
 * plain objects, which is enough to check every decision this layer makes —
 * lazy construction, the gain clamp, the voice bound, and that no failure
 * escapes.
 *
 * Without this the file would be a host binding with no detector, and
 * `TESTING.md` §4.2 does not permit an exclusion for that.
 */

import { describe, expect, it, vi } from 'vitest';

import { Sound } from '../app/sounds';

import { createWebAudioPorts, type AudioDeviceOptions } from './web-audio';

interface FakeHost {
  readonly options: AudioDeviceOptions;
  readonly contexts: () => number;
  readonly started: () => number;
  readonly gains: () => readonly number[];
  /** Sources created with `loop = true` — the ambient bed (phase-13d). */
  readonly loops: () => number;
  /** Bed sources explicitly stopped. */
  readonly stops: () => number;
  /** Every gain a bed voice was set to, in order. */
  readonly bedGains: () => readonly number[];
}

/** A fake `AudioContext` that records what was asked of it. */
function fakeHost(overrides: { failContext?: boolean; failStart?: boolean } = {}): FakeHost {
  let contexts = 0;
  let started = 0;
  let loops = 0;
  let stops = 0;
  const gains: number[] = [];
  const bedGains: number[] = [];
  /** The gain node handed to the most recent source, so a bed's is findable. */
  let lastGainNode: { gain: { value: number } } | null = null;

  const buffer = { duration: 0.25 } as AudioBuffer;

  const createContext = (): AudioContext | null => {
    if (overrides.failContext === true) throw new Error('no audio device');
    contexts += 1;

    return {
      destination: {},
      createGain: () => {
        const node = {
          connect: () => undefined,
          disconnect: () => undefined,
          gain: { value: 0 },
        };
        lastGainNode = node;
        return node as unknown as GainNode;
      },
      createBufferSource: () => {
        if (overrides.failStart === true) throw new Error('suspended');
        const source = {
          buffer: null,
          loop: false,
          connect: () => undefined,
          disconnect: () => undefined,
          start: () => {
            started += 1;
            if (source.loop) {
              loops += 1;
              bedGains.push(lastGainNode?.gain.value ?? -1);
            }
          },
          stop: () => {
            stops += 1;
          },
        };
        return source as unknown as AudioBufferSourceNode;
      },
      decodeAudioData: async () => Promise.resolve(buffer),
    } as unknown as AudioContext;
  };

  return {
    options: {
      createContext,
      loadBuffer: async () => Promise.resolve(buffer),
    },
    contexts: () => contexts,
    started: () => started,
    gains: () => gains,
    loops: () => loops,
    stops: () => stops,
    bedGains: () => bedGains,
  };
}

/** Lets the injected loader's promise settle. */
const settle = async (): Promise<void> => Promise.resolve();

describe('nothing is built until something is played', () => {
  it('creates no context on construction', () => {
    const host = fakeHost();
    createWebAudioPorts(host.options);

    // A muted session — the overwhelming majority — must never start the
    // audio thread (ADR-023 §4).
    expect(host.contexts()).toBe(0);
  });

  it('creates exactly one context however many sounds play', async () => {
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);

    ports.play(Sound.Harvest, 1);
    await settle();
    ports.play(Sound.Coin, 1);
    ports.play(Sound.Till, 1);

    expect(host.contexts()).toBe(1);
  });
});

describe('the first play of a sound is silent while it decodes', () => {
  it('starts nothing until the buffer has arrived', async () => {
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);

    ports.play(Sound.Harvest, 1);
    expect(host.started()).toBe(0);

    await settle();
    await settle();
    ports.play(Sound.Harvest, 1);

    expect(host.started()).toBe(1);
  });

  it('decodes each sound once, not once per play', async () => {
    const loadBuffer = vi.fn(async () => Promise.resolve({ duration: 0.1 } as AudioBuffer));
    const host = fakeHost();
    const ports = createWebAudioPorts({ ...host.options, loadBuffer });

    ports.play(Sound.Harvest, 1);
    await settle();
    await settle();
    ports.play(Sound.Harvest, 1);
    ports.play(Sound.Harvest, 1);

    expect(loadBuffer).toHaveBeenCalledTimes(1);
  });
});

describe('failure is swallowed, because silence is a valid state', () => {
  it('does not throw when the machine has no audio device', () => {
    const host = fakeHost({ failContext: true });
    const ports = createWebAudioPorts(host.options);

    expect(() => {
      ports.play(Sound.Harvest, 1);
    }).not.toThrow();
  });

  it('does not throw when the context refuses to make a voice', async () => {
    const host = fakeHost({ failStart: true });
    const ports = createWebAudioPorts(host.options);

    ports.play(Sound.Harvest, 1);
    await settle();
    await settle();

    expect(() => {
      ports.play(Sound.Harvest, 1);
    }).not.toThrow();
  });

  it('does not throw when decoding fails', async () => {
    const host = fakeHost();
    const ports = createWebAudioPorts({
      ...host.options,
      loadBuffer: async () => Promise.reject(new Error('bad codec')),
    });

    ports.play(Sound.Harvest, 1);
    await settle();
    await settle();

    expect(() => {
      ports.play(Sound.Harvest, 1);
    }).not.toThrow();
  });
});

describe('the clock', () => {
  it('reports monotonic milliseconds for the bus to coalesce with', () => {
    const ports = createWebAudioPorts(fakeHost().options);
    const first = ports.now();
    expect(typeof first).toBe('number');
    expect(ports.now()).toBeGreaterThanOrEqual(first);
  });
});

describe('the ambient bed (phase-13d, ADR-023 §5)', () => {
  it('starts nothing at a gain of zero', async () => {
    // Zero must STOP rather than play silence: a silent-but-running source
    // keeps the audio thread awake, which is exactly what §5 condition 4
    // surrenders when the player looks away.
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);

    ports.ambience.set(Sound.Harvest, 0);
    await settle();
    ports.ambience.set(Sound.Harvest, 0);

    expect(host.loops()).toBe(0);
    expect(host.started()).toBe(0);
  });

  it('starts a LOOPING source once the buffer is ready', async () => {
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);

    ports.ambience.set(Sound.Harvest, 0.5); // first call kicks off the decode
    await settle();
    ports.ambience.set(Sound.Harvest, 0.5);

    expect(host.loops()).toBe(1);
    expect(host.bedGains()).toEqual([0.5]);
  });

  it('adjusts the running bed rather than stacking a second source', async () => {
    // The failure this prevents is audible and cumulative: one source per
    // update, all looping forever, getting louder every time the gain moves.
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);
    ports.ambience.set(Sound.Harvest, 0.5);
    await settle();
    ports.ambience.set(Sound.Harvest, 0.5);

    ports.ambience.set(Sound.Harvest, 0.2);
    ports.ambience.set(Sound.Harvest, 0.9);

    expect(host.loops()).toBe(1);
  });

  it('stops the bed when the gain returns to zero', async () => {
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);
    ports.ambience.set(Sound.Harvest, 0.5);
    await settle();
    ports.ambience.set(Sound.Harvest, 0.5);

    ports.ambience.set(Sound.Harvest, 0);

    expect(host.stops()).toBe(1);
  });

  it('starts again after being stopped', async () => {
    // Presence comes back. The bed has to be restartable, not one-shot.
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);
    ports.ambience.set(Sound.Harvest, 0.5);
    await settle();
    ports.ambience.set(Sound.Harvest, 0.5);
    ports.ambience.set(Sound.Harvest, 0);

    ports.ambience.set(Sound.Harvest, 0.4);

    expect(host.loops()).toBe(2);
  });

  it('replaces one bed with another rather than layering them', async () => {
    // Two continuous sounds is a mix nobody chose. §5 permits ambience, not
    // ambiences.
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);
    ports.ambience.set(Sound.Harvest, 0.5);
    await settle();
    ports.ambience.set(Sound.Harvest, 0.5);

    ports.ambience.set(Sound.Coin, 0.5);
    await settle();
    ports.ambience.set(Sound.Coin, 0.5);

    expect(host.stops()).toBe(1);
    expect(host.loops()).toBe(2);
  });

  it('clamps the gain rather than amplifying', async () => {
    const host = fakeHost();
    const ports = createWebAudioPorts(host.options);

    ports.ambience.set(Sound.Harvest, 9);
    await settle();
    ports.ambience.set(Sound.Harvest, 9);

    expect(host.bedGains()).toEqual([1]);
  });

  it('stays silent on a machine with no audio device', async () => {
    const host = fakeHost({ failContext: true });
    const ports = createWebAudioPorts(host.options);

    ports.ambience.set(Sound.Harvest, 0.5);
    await settle();
    expect(() => {
      ports.ambience.set(Sound.Harvest, 0.5);
    }).not.toThrow();

    expect(host.loops()).toBe(0);
  });

  it('survives a context that refuses to start a source', async () => {
    const host = fakeHost({ failStart: true });
    const ports = createWebAudioPorts(host.options);

    await settle();
    expect(() => {
      ports.ambience.set(Sound.Harvest, 0.5);
    }).not.toThrow();
  });
});
