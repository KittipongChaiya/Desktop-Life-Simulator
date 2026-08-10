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

import {
  AUDIO_DUCKING,
  DUCK_HOLD_MS,
  SOUND_CATEGORY,
  SOUND_GAIN,
  type AudioCategory,
  type Sound,
} from './sounds';

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
   * Per-category level, 0–100. Phase-13b — ADR-023 §2.
   *
   * A getter like the rest, and OPTIONAL so every existing caller keeps
   * working: a state that does not answer is a state where every category is
   * at full, which is exactly what the mix was before categories existed.
   */
  categoryPercent?(category: AudioCategory): number;
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
  /** When each category last actually sounded — the ducking input. */
  const lastHeardAt = new Map<AudioCategory, number>();

  /**
   * The attenuation applying to a category right now.
   *
   * Declared, not measured: it reads the table and the clock, so it costs a
   * map lookup rather than an always-on analyser node (ADR-023 §2).
   */
  const duckingFor = (category: AudioCategory, nowMs: number): number => {
    let quietest = 1;
    for (const rule of AUDIO_DUCKING) {
      if (rule.category !== category) continue;
      for (const over of rule.under) {
        const heard = lastHeardAt.get(over);
        if (heard !== undefined && nowMs - heard < DUCK_HOLD_MS) {
          quietest = Math.min(quietest, rule.to);
        }
      }
    }
    return quietest;
  };

  return {
    play(sound) {
      if (state.muted() || state.workMode()) return;

      const volume = state.volumePercent() / 100;
      if (volume <= 0) return;

      const category = SOUND_CATEGORY[sound];
      const categoryLevel = (state.categoryPercent?.(category) ?? 100) / 100;
      // A category turned off is silent, and silently so — no coalescing stamp
      // either, for the reason the mute check has none: the window must start
      // when a sound is HEARD.
      if (categoryLevel <= 0) return;

      // The window starts when a sound is actually HEARD. Stamping it while
      // muted would leave the first audible sound after an unmute swallowed
      // by a suppression the player never heard.
      const now = ports.now();
      const previous = lastPlayedAt.get(sound);
      if (previous !== undefined && now - previous < SOUND_COALESCE_MS) return;
      lastPlayedAt.set(sound, now);

      // Ducking is applied here rather than in the device layer because it is
      // a MIX decision, and the mix is this layer's whole job (ADR-016 §1).
      const duck = duckingFor(category, now);

      try {
        ports.play(sound, volume * categoryLevel * duck * SOUND_GAIN[sound]);
        lastHeardAt.set(category, now);
      } catch {
        // A missing or busy audio device is not the player's problem, and it
        // is certainly not worth a crash in a farming game. Silence is a
        // perfectly good degraded state.
      }
    },
  };
}
