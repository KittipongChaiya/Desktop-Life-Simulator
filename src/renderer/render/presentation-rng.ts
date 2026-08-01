/**
 * Presentation randomness — derived, never rolled. Phase-07.7b, ADR-017 §5.
 *
 * Every varying thing in the game-feel pass reads from here: a dust puff's
 * scatter, a butterfly's path, which idle fidget a worker plays. All of it is a
 * HASH of presentation inputs — a tile index, an event tick, an entity id —
 * and never a generator with a cursor.
 *
 * THE REASON IS DETERMINISM, NOT STYLE. `world.rng` is simulation state: every
 * draw advances it, and a saved game replays by consuming it in exactly the
 * order the original run did. A decorative sparkle that took one number from it
 * would shift every subsequent draw, and the farm would diverge from its own
 * save — a rendering flourish silently corrupting the thing ADR-007 exists to
 * protect. Nothing in the renderer may touch it.
 *
 * A hash also has the property the effects need anyway: it is stable. The same
 * harvest scatters the same way on a replay, on a reload, and on another
 * machine, because the answer depends only on the inputs.
 *
 * `decor.ts` established the PRINCIPLE in 07.5e — "it is derived, never rolled"
 * — and this module generalises it so every later effect shares one mixer
 * rather than each growing its own.
 *
 * DELIBERATELY NOT SHARED WITH `decor.ts`. Its mixer uses a plain multiply
 * where this uses `Math.imul`, so the two produce different numbers from the
 * same inputs. Unifying them looks like an obvious cleanup and is not: decor
 * placement is a pure function of the world seed, so changing the mixer would
 * relocate every tree, rock, and bush in every existing player's world, for no
 * behavioural gain. Leave them separate.
 */

/**
 * Mixes two integers into a well-distributed 32-bit unsigned value.
 *
 * The standard xorshift-style finaliser: four lines, no state, and good enough
 * separation that adjacent tiles do not produce adjacent results — which is
 * what stops a field of decoration from lining up in visible bands.
 */
export function mix(a: number, b: number): number {
  let value = (a ^ Math.imul(b, 0x9e37_79b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85eb_ca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2_ae35) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/** Mixes any number of integers, folding left. */
export function mixAll(...values: readonly number[]): number {
  let result = 0;
  for (const value of values) result = mix(result, value);
  return result;
}

/** A stable fraction in [0, 1) for the given inputs. */
export function derivedUnit(a: number, b: number): number {
  // 2^32 as the divisor keeps the result strictly below 1.
  return mix(a, b) / 0x1_0000_0000;
}

/** A stable value in [min, max) for the given inputs. */
export function derivedRange(min: number, max: number, a: number, b: number): number {
  if (max <= min) return min;
  return min + derivedUnit(a, b) * (max - min);
}

/**
 * A stable index into a collection of `length` items.
 *
 * Returns 0 for an empty collection: cosmetic code must never hand an
 * out-of-range index to a frame, and there is nothing to choose from anyway.
 */
export function derivedIndex(length: number, a: number, b: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.floor(derivedUnit(a, b) * length));
}
