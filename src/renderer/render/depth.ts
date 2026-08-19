/**
 * How deep a thing is. Phase-40 — ADR-042 §1.
 *
 * Every sprite in the world layer sorts by ONE number, and this is where that
 * number is defined so no view can invent its own.
 *
 * ## The number is the object's BASE, in world pixels
 *
 * Not its tile row, and not the top of its sprite. The base is where the thing
 * meets the ground, which is the only property that answers "which of these is
 * nearer the camera" for objects of different heights. A worker standing at the
 * foot of a tree is nearer than the tree; the same worker one tile further up
 * is behind it. Sorting by sprite top would put every tall thing behind every
 * short one, and sorting by tile row cannot express a worker standing halfway
 * between two rows.
 *
 * ## Why this file exists at all
 *
 * Before phase-40 there were two y-sorted layers and three units. Buildings and
 * crops set `zIndex` to a TILE ROW (0…63); workers set it to a PIXEL offset
 * (0…2047). They never collided only because `objects` and `entities` were
 * separate containers — which is precisely why a worker could never be occluded
 * by a tree, and why the world read as sprites in cells rather than as a place.
 * Merging the layers without unifying the units would have sorted every
 * building behind every worker, everywhere, always.
 *
 * ## Motion does not change depth
 *
 * A worker's bob, hop and fidget move the SPRITE and must not move its place in
 * the order — a hopping worker that flickers in front of and behind a fence is
 * the bug this sentence prevents. Callers pass the logical base, never the
 * drawn one.
 */

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';

/**
 * Depth for something standing ON a tile — buildings, crops, props, nodes.
 *
 * The bottom edge of the tile, because that is where a bottom-anchored sprite
 * touches the ground (ADR-042 §2).
 *
 * Takes a plain `number` rather than a `TileIndex`: the view models this sorts
 * carry tile indices as numbers already, and demanding the branded type here
 * would push a cast into every call site to buy nothing — the function only
 * divides by the row stride.
 */
export function tileDepth(tile: number): number {
  return (Math.floor(tile / WORLD_WIDTH) + 1) * TILE_SIZE;
}

/**
 * Depth for something at a free world position — workers, residents, the
 * player, anything that moves between tiles.
 *
 * `worldY` is the TOP of the mover's tile-sized box, which is what the
 * simulation reports and what `worker-render.ts` interpolates; the base is one
 * tile below it. Passing the sprite's drawn `y` here instead would fold the bob
 * into the sort order.
 */
export function positionDepth(worldY: number): number {
  return worldY + TILE_SIZE;
}

/**
 * Nudges a depth so one thing reliably draws in front of another at the SAME
 * base — a crop in front of the soil feature it grows on, say.
 *
 * Bounded and tiny: a full tile of bias would let a tie-break jump a whole row
 * and reorder things that are genuinely at different depths.
 */
export function biasDepth(depth: number, bias: number): number {
  return depth + Math.max(-TILE_SIZE / 2, Math.min(TILE_SIZE / 2, bias));
}
