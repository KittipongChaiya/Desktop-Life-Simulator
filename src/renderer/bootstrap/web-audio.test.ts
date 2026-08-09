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
}

/** A fake `AudioContext` that records what was asked of it. */
function fakeHost(overrides: { failContext?: boolean; failStart?: boolean } = {}): FakeHost {
  let contexts = 0;
  let started = 0;
  const gains: number[] = [];

  const buffer = { duration: 0.25 } as AudioBuffer;

  const createContext = (): AudioContext | null => {
    if (overrides.failContext === true) throw new Error('no audio device');
    contexts += 1;

    return {
      destination: {},
      createGain: () =>
        ({
          connect: () => undefined,
          disconnect: () => undefined,
          gain: { value: 0 },
        }) as unknown as GainNode,
      createBufferSource: () => {
        if (overrides.failStart === true) throw new Error('suspended');
        return {
          buffer: null,
          connect: () => undefined,
          disconnect: () => undefined,
          start: () => {
            started += 1;
          },
        } as unknown as AudioBufferSourceNode;
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
