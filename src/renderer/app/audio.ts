/**
 * The sound bus. Phase-07.5a — ADR-016.
 *
 * Three responsibilities, and deliberately no others: decide whether a sound
 * is AUDIBLE right now, decide its GAIN, and refuse to let a burst of
 * simultaneous events become a wall of sound. It does not know what a sound
 * is (`sounds.ts`) and it does not know how to make noise (the injected
 * port), which is what makes it testable in Node and replaceable at the
 * asset layer without touching a call site.
 *
 * Audibility is read at PLAY time, never captured: the bus is built once at
 * boot and the player changes their mind afterwards.
 *
 * Nothing here reaches the simulation. Audio is presentation, and the sim
 * neither knows nor could know that sound exists (ADR-007 §1).
 */

import { SOUND_GAIN, type Sound } from './sounds';

/**
 * How long one sound suppresses a repeat of itself.
 *
 * Three workers finishing a harvest on the same tick is ordinary, not
 * exceptional — the seed bin exists to make it so. Without this the farm's
 * most satisfying moment becomes its most irritating one. A quarter second is
 * long enough to collapse a simultaneous burst and short enough that
 * deliberate, separate actions still each get their sound.
 */
export const SOUND_COALESCE_MS = 250;

export interface AudioPorts {
  /** Makes the noise. `gain` is 0–1 and already mixed. May throw; the bus copes. */
  play(sound: Sound, gain: number): void;
  /** Monotonic milliseconds, for the coalescing window. */
  now(): number;
}

/** What the bus reads to decide audibility. Getters, not values — see above. */
export interface AudioState {
  /** The master volume dial, 0–100. */
  volumePercent(): number;
  muted(): boolean;
  /**
   * Work mode. Silences everything regardless of the dial, because a mode
   * that exists to stop the overlay competing for attention cannot keep
   * making noise (ADR-014).
   */
  workMode(): boolean;
}

export interface SoundBus {
  /** Plays a sound if it should be heard. Never throws. */
  play(sound: Sound): void;
}

export function createSoundBus(ports: AudioPorts, state: AudioState): SoundBus {
  const lastPlayedAt = new Map<Sound, number>();

  return {
    play(sound) {
      if (state.muted() || state.workMode()) return;

      const volume = state.volumePercent() / 100;
      if (volume <= 0) return;

      // The window starts when a sound is actually HEARD. Stamping it while
      // muted would leave the first audible sound after an unmute swallowed
      // by a suppression the player never heard.
      const now = ports.now();
      const previous = lastPlayedAt.get(sound);
      if (previous !== undefined && now - previous < SOUND_COALESCE_MS) return;
      lastPlayedAt.set(sound, now);

      try {
        ports.play(sound, volume * SOUND_GAIN[sound]);
      } catch {
        // A missing or busy audio device is not the player's problem, and it
        // is certainly not worth a crash in a farming game. Silence is a
        // perfectly good degraded state.
      }
    },
  };
}
