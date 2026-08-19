/**
 * Why the five-hundredth harvest does not sound like the first. Phase-47.
 *
 * The catalogue is eleven short sounds, each played from one buffer, so every
 * harvest was bit-identical to every other harvest. That is survivable in a
 * game somebody plays for twenty minutes and it is the whole problem in one
 * they leave open for eight hours: identical repetition is what turns a sound
 * a player liked into a sound they mute. The phase is called "audio that earns
 * eight hours" and this is most of what earns it.
 *
 * ## Pitch, not new files
 *
 * A buffer played at a slightly different rate is a slightly different sound,
 * and it costs one property on a node that is being allocated anyway. Twelve
 * recorded variants per effect would cost twelve times the decode, twelve
 * times the memory, and an asset pipeline that has to keep them in step.
 *
 * ## Derived, never random
 *
 * `Math.random` would make the same farm sound different on every launch and
 * make this untestable. The rate comes from a counter through the same hash
 * family the world uses for decor and tile variants (ADR-009's argument, one
 * domain over): the Nth harvest of a session always sounds the same, and the
 * sequence never audibly repeats.
 *
 * ## Signals must not wobble
 *
 * A UI click, an error and a notification are STATEMENTS: the player learns
 * them as one shape, and a shape that moves reads as a fault rather than as
 * life. Only world sounds vary. The rule is by category rather than a list of
 * sound names, so a sound added later inherits the right behaviour without
 * anybody remembering this file exists.
 */

import { AudioCategory } from './sounds';

/**
 * How far the rate may move, as a fraction either side of 1.
 *
 * Six percent is about a semitone. Enough that consecutive plays are audibly
 * not the same recording; small enough that nothing sounds detuned, which on a
 * two-note pluck like `coin` would read as a wrong note rather than variety.
 */
const SPREAD = 0.06;

/** The rate for a sound that must never move. */
export const NO_VARIATION = 1;

/**
 * The playback rate for the `sequence`-th play of a sound in this category.
 *
 * `sequence` counts plays of that one sound, so two different effects fired on
 * the same frame do not receive correlated rates — which would make them sound
 * like one event pitched twice rather than two events.
 */
export function variationRate(category: AudioCategory, sequence: number): number {
  // Signals hold their shape. Ambient beds are continuous, and a bed whose
  // rate changed would audibly shift pitch mid-weather.
  if (category !== AudioCategory.World) return NO_VARIATION;

  // MurmurHash3's finalizer, as everywhere else in this project that needs a
  // small well-mixed number. A plain modulo would cycle audibly: at four
  // values the ear finds the pattern within a minute.
  let hash = sequence | 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x21f0aaad);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x735a2d97);
  hash ^= hash >>> 15;

  // 0…1 from the top bits, then centred on 1.
  const unit = (hash >>> 8) / 0xff_ffff;
  return 1 + (unit * 2 - 1) * SPREAD;
}
