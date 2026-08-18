/**
 * Plants lean in the wind. Phase-07.5e, shared in phase-27 — ADR-017 §2.
 *
 * Extracted from `decor-view.ts` when the wilds got a second layer of trees.
 * The alternative was two copies of the rule, and the boundary between the town
 * band and the wilds is the one place on the map where both are on screen at
 * once — a still forest beside a swaying hedgerow reads as a bug, and a copied
 * constant is how the two would eventually drift apart.
 *
 * This is UNBOUNDED motion (ADR-017 §2): it never finishes, so no caller may
 * run it without resolving all four ambient conditions and holding a lease. The
 * helpers here only compute; the leases stay with the views.
 */

import { derivedUnit } from './presentation-rng';

/**
 * Sprites that sway. Rocks do not, which is the whole of the rule.
 *
 * Keyed by sprite rather than by a kind enum because both callers describe
 * their items by sprite key and nothing else — inventing a parallel taxonomy
 * would be a second source of truth for the same fact. `ore_vein` is absent for
 * the same reason `rock` is: crystal does not bend.
 */
export const SWAYS: ReadonlySet<string> = new Set([
  'buildings:flower',
  'buildings:bush',
  'buildings:tree',
]);

/** Peak lean, in radians. Small: this is a breeze, not a storm. */
export const SWAY_RADIANS = 0.035;

/** Milliseconds per full sway cycle. Slow enough to read as wind. */
export const SWAY_PERIOD_MS = 3400;

/**
 * A plant's place in the cycle, derived from its tile.
 *
 * DERIVED, never rolled (ADR-017 §5), so a hedgerow ripples instead of pulsing
 * as one block — identically on every launch, because the answer depends only
 * on the tile.
 */
export function swayPhase(tile: number): number {
  return derivedUnit(tile, 0) * Math.PI * 2;
}

/** Rotation for a plant at `phase`, at `nowMs`. */
export function swayRotation(nowMs: number, phase: number): number {
  return Math.sin((nowMs / SWAY_PERIOD_MS) * Math.PI * 2 + phase) * SWAY_RADIANS;
}
