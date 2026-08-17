/**
 * A stateless integer hash, for derived variation. Phase-12a.
 *
 * Extracted from `renderer/render/decor.ts`, where it was written for ADR-017
 * §5 — *"all variation is derived, never rolled"*. Weather needs the identical
 * primitive for the identical reason at a different scale (ADR-022 §1), and two
 * copies of a hash is two chances for one of them to be "improved" into a
 * different function.
 *
 * **This is not the world RNG, and must never become it.** Drawing weather from
 * `world.rng` would consume the stream, so a world that displayed weather would
 * diverge from one that did not — the desynchronisation ADR-017 §5 forbids for
 * a sway animation, at world scale. A hash of stored inputs cannot diverge:
 * same seed, same period, same answer, on every machine and every launch.
 */

/**
 * A stable 32-bit hash of two integers.
 *
 * The standard xorshift-style finaliser: four lines, no state, well mixed. Any
 * such hash would do — what matters is that it is FIXED. Changing it changes
 * every derived value in every world, past and future.
 */
export function mix32(a: number, b: number): number {
  let value = (a ^ (b * 0x9e37_79b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85eb_ca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2_ae35) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/**
 * A stable 32-bit hash of a string — FNV-1a. Phase-21, for keying derived
 * values by content id (demand's `hash(item)`, ADR-033 §1).
 *
 * The same freeze applies as `mix32`: any decent string hash would do, and
 * changing THIS one changes every derived value keyed by a string, in every
 * world, past and future.
 */
export function hashString(text: string): number {
  let value = 0x811c_9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x0100_0193) >>> 0;
  }
  return value >>> 0;
}
