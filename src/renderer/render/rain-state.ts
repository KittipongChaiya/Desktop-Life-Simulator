/**
 * Where each raindrop is. Phase-12d — ADR-022 §6, ADR-017 §4, §5.
 *
 * Split from the Pixi binding for the reason `lighting-state.ts` is: the part
 * that can be wrong is the arithmetic, and it needs no GPU to check.
 *
 * **Every drop's position is DERIVED, never rolled** (ADR-017 §5). A drop's
 * column and speed come from a hash of its index, and its height from the
 * clock — so the same drop is in the same place on every machine, and the
 * world RNG is never touched. Weather that consumed `world.rng` would
 * desynchronise a save whose owner happened to be watching (ADR-022 §1).
 *
 * **Nothing allocates after construction** (ADR-017 §4). The drop count is
 * fixed, positions are computed into caller-owned numbers, and there is no
 * per-frame array.
 */

import { mix32 } from '../../shared/hash';

/**
 * How many drops the rain is made of.
 *
 * A ceiling, not a target: the pool is allocated once at this size and the
 * renderer never asks for more, whatever the weather does.
 */
export const RAIN_DROPS = 96;

/** How long a drop takes to fall the screen's height, in milliseconds. */
export const RAIN_FALL_MS = 900;

/** Horizontal drift as a fraction of the fall — rain is not vertical. */
export const RAIN_SLANT = 0.18;

/** A drop's column, as a fraction of the width. Stable for its whole life. */
export function dropColumn(index: number): number {
  return (mix32(index, 0x5eed) % 10_000) / 10_000;
}

/** A drop's speed multiplier, so the rain has depth rather than one sheet. */
export function dropSpeed(index: number): number {
  // 0.75–1.25, derived. Uniform speed reads as a texture scrolling, which is
  // the thing that makes cheap rain look cheap.
  return 0.75 + (mix32(index, 0xfa11) % 500) / 1_000;
}

/**
 * A drop's vertical position at a moment, as a fraction of the height.
 *
 * Wraps, so a drop leaving the bottom re-enters at the top — the loop is what
 * makes this ambient (it never ends) and therefore what puts it under
 * ADR-017 §2's four conditions rather than a lease it would hold forever.
 */
export function dropFall(index: number, nowMs: number): number {
  const phase = (mix32(index, 0xbead) % 1_000) / 1_000;
  const travelled = (nowMs * dropSpeed(index)) / RAIN_FALL_MS + phase;
  return travelled - Math.floor(travelled);
}

/** A drop's horizontal position at a moment, as a fraction of the width. */
export function dropDrift(index: number, nowMs: number): number {
  const x = dropColumn(index) + dropFall(index, nowMs) * RAIN_SLANT;
  // Wrapped rather than clamped: a clamped drop would pile up at the edge.
  return x - Math.floor(x);
}
