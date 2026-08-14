/**
 * The audio device. Phase-07.5a — ADR-016; rebuilt on Web Audio in phase-13a.
 *
 * The ONE place that knows a sound is a file. Everything above it names
 * sounds (`sounds.ts`) or decides audibility (`audio.ts`), which is what keeps
 * both testable in Node and what lets the placeholder set be replaced without
 * a call site changing.
 *
 * ## Why Web Audio replaced `HTMLAudioElement`
 *
 * The original choice was right for what it had to do: the bus coalesces
 * bursts, so nothing needed a mixing graph, and an element per sound is simple
 * and impossible to leak. ADR-023 §4 changes the requirements — category buses,
 * declared ducking, per-sound variation, and overlapping instances of one sound
 * all need a graph, and an element cannot play twice at once at all.
 *
 * What that costs is bounded deliberately. A `BufferSourceNode` is single-use,
 * so playing a sound means allocating a node, and an eight-hour farm harvesting
 * continuously would churn the heap ADR-017 §4 protects. `voice-pool.ts` fixes
 * the number in flight; this file honours its verdict.
 *
 * ## Nothing is built until something is played
 *
 * An `AudioContext` is a thread. Sound ships muted (ADR-016 §3), so most
 * sessions must never create one — and phase-07.5a already measured what eager
 * construction costs, turning two E2E specs flaky the day audio landed. The
 * context, the buffers, and the graph are all built on first play.
 *
 * Every failure is swallowed. A machine with no audio device, a codec the build
 * did not expect, an autoplay policy — none are worth a broken farm, and the
 * bus treats silence as a perfectly good degraded state.
 */

import coinUrl from '@assets/audio/coin.wav';
import depositUrl from '@assets/audio/deposit.wav';
import errorUrl from '@assets/audio/error.wav';
import harvestUrl from '@assets/audio/harvest.wav';
import notificationUrl from '@assets/audio/notification.wav';
import placementUrl from '@assets/audio/placement.wav';
import plantUrl from '@assets/audio/plant.wav';
import selectionUrl from '@assets/audio/selection.wav';
import tillUrl from '@assets/audio/till.wav';
import uiClickUrl from '@assets/audio/ui-click.wav';

import type { AmbienceDevice } from '../app/ambience';
import type { AudioPorts } from '../app/audio';
import { Sound } from '../app/sounds';
import { createVoicePool } from '../audio/voice-pool';

/**
 * Catalogue key → bundled URL.
 *
 * Exhaustive by type: adding a `Sound` without a file fails the build here
 * rather than playing silence in a state nobody tests.
 */
const SOUND_URL: Readonly<Record<Sound, string>> = {
  [Sound.Harvest]: harvestUrl,
  [Sound.Deposit]: depositUrl,
  [Sound.Coin]: coinUrl,
  [Sound.Placement]: placementUrl,
  [Sound.Selection]: selectionUrl,
  [Sound.UiClick]: uiClickUrl,
  [Sound.Notification]: notificationUrl,
  [Sound.Till]: tillUrl,
  [Sound.Plant]: plantUrl,
  [Sound.Error]: errorUrl,
};

/**
 * How the device layer reaches the host, and the only reason it is testable.
 *
 * `TESTING.md` §2 rules out a mocking framework, and phase-08.0 already
 * established what to do instead: `docking.ts` and `settings.ts` took their
 * host as a parameter rather than importing it, and became testable without
 * changing behaviour. This is the same move for `AudioContext` — the default
 * is the real one, and a test hands in a hand-written fake.
 *
 * Without it this file would be a host binding with **no detector**, which
 * `TESTING.md` §4.2 does not permit an exclusion for: a file leaves the
 * measured set only if a named test does exercise it.
 */
export interface AudioDeviceOptions {
  /** Builds the host context. Returns null when the machine has no audio. */
  readonly createContext?: () => AudioContext | null;
  /** Fetches and decodes a sound. Split out for the same reason. */
  readonly loadBuffer?: (url: string, context: AudioContext) => Promise<AudioBuffer>;
}

export function createWebAudioPorts(
  options: AudioDeviceOptions = {},
): AudioPorts & { readonly ambience: AmbienceDevice } {
  // Built on FIRST PLAY, never at boot — see the header.
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  const buffers = new Map<Sound, AudioBuffer>();
  const pending = new Set<Sound>();
  const pool = createVoicePool();

  /**
   * The one ambient bed, if it is sounding. Phase-13d — ADR-023 §5.
   *
   * ONE, not a pool. A bed never ends, so a pooled voice would hold its slot
   * for the whole session and starve the effects the pool exists to bound —
   * and `voice-pool.ts` recycles by claim time, which would make the bed the
   * oldest claim on the farm and the first thing stolen. It is bounded by
   * being exactly one node instead, which is a bound the pool cannot express.
   */
  let bed: { source: AudioBufferSourceNode; gain: GainNode; sound: Sound } | null = null;

  const stopBed = (): void => {
    if (bed === null) return;
    try {
      bed.source.stop();
    } catch {
      // Already stopped, or a context that went away underneath us.
    }
    bed.source.disconnect();
    bed.gain.disconnect();
    bed = null;
  };

  /** The context and its master gain, created once, or null if unavailable. */
  const graph = (): { context: AudioContext; master: GainNode } | null => {
    if (context !== null && master !== null) return { context, master };

    try {
      const created = options.createContext?.() ?? new AudioContext();
      if (created === null) return null;
      const gain = created.createGain();
      gain.connect(created.destination);
      context = created;
      master = gain;
      return { context: created, master: gain };
    } catch {
      // No device, or a policy that forbids one. Silence is a valid state.
      return null;
    }
  };

  /**
   * Decodes a sound into a buffer, once.
   *
   * The first play of each sound is silent while its fetch and decode run —
   * the same one-off cost the element version paid, and preferable to
   * decoding ten files at boot for a session that is probably muted.
   */
  const load = (sound: Sound, ctx: AudioContext): AudioBuffer | undefined => {
    const ready = buffers.get(sound);
    if (ready !== undefined) return ready;
    if (pending.has(sound)) return undefined;

    pending.add(sound);
    const fetchAndDecode =
      options.loadBuffer ??
      (async (url: string, context: AudioContext): Promise<AudioBuffer> =>
        fetch(url)
          .then(async (response) => response.arrayBuffer())
          .then(async (bytes) => context.decodeAudioData(bytes)));

    void fetchAndDecode(SOUND_URL[sound], ctx)
      .then((decoded) => {
        buffers.set(sound, decoded);
      })
      .catch(() => undefined)
      .finally(() => {
        pending.delete(sound);
      });

    return undefined;
  };

  return {
    play(sound, gain) {
      const built = graph();
      if (built === null) return;

      const buffer = load(sound, built.context);
      if (buffer === undefined) return; // still decoding; drop this one

      // The pool decides whether this sound may sound at all. `recycled` is
      // not acted on here: Web Audio has already scheduled the stolen voice,
      // and cutting it short would need a reference this layer deliberately does
      // not keep. The bound that matters is on NODES IN FLIGHT, and claiming a
      // slot is what enforces it.
      const nowMs = performance.now();
      pool.claim(nowMs, nowMs + buffer.duration * 1000);

      try {
        const source = built.context.createBufferSource();
        const voice = built.context.createGain();
        source.buffer = buffer;
        voice.gain.value = Math.max(0, Math.min(1, gain));
        source.connect(voice);
        voice.connect(built.master);
        source.onended = () => {
          source.disconnect();
          voice.disconnect();
        };
        source.start();
      } catch {
        // A context suspended by policy, most likely. Not a game concern.
      }
    },

    now: () => performance.now(),

    ambience: {
      set(sound, gain) {
        const wanted = Math.max(0, Math.min(1, gain));

        // Zero STOPS rather than plays silence. A silent-but-running source
        // keeps the audio thread awake, which is exactly what ADR-023 §5
        // condition 4 surrenders.
        if (wanted <= 0) {
          stopBed();
          return;
        }

        // A different bed replaces the current one. Two continuous sounds is a
        // mix nobody chose, and §5 permits ambience rather than ambiences.
        if (bed !== null && bed.sound !== sound) stopBed();

        if (bed !== null) {
          bed.gain.gain.value = wanted;
          return;
        }

        const built = graph();
        if (built === null) return;

        const buffer = load(sound, built.context);
        if (buffer === undefined) return; // still decoding; the next call starts it

        try {
          const source = built.context.createBufferSource();
          const voice = built.context.createGain();
          source.buffer = buffer;
          source.loop = true;
          voice.gain.value = wanted;
          source.connect(voice);
          voice.connect(built.master);
          source.start();
          bed = { source, gain: voice, sound };
        } catch {
          // A context suspended by policy. Silence is a valid state.
          bed = null;
        }
      },
    },
  };
}
