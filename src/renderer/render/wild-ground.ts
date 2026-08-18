/**
 * Where the wilderness starts, to look at. Phase-27 — ADR-037 §1.
 *
 * The world is three fixed regions: the farm below `FARM_SIZE`, the town, and
 * the wilds from `WILDS_MIN_X` east. Those boundaries are GEOMETRY — the same
 * numbers in every world — and the simulation uses them as hard lines, because
 * a node either exists on a tile or it does not.
 *
 * A hard line is the wrong thing to DRAW. Sixty-four tiles of perfectly
 * straight colour change is the one shape nothing in a landscape has, and it
 * would read as an unfinished level rather than as the edge of somewhere wild.
 * So the ground turns rough along a ragged fringe instead.
 *
 * ## The fringe only ever reaches INWARD
 *
 * This is the whole design constraint, and it comes from what the two edges
 * mean to a player. Wild ground says *you can gather here*; the node region
 * says *there is something to gather*. Those can disagree in one direction
 * safely and not in the other:
 *
 * - Rough ground with no nodes on it is a patch of scrub. Unremarkable —
 *   density is patchy everywhere out there anyway.
 * - A node standing on mown farm grass is a lie about the ground.
 *
 * So `wildEdgeX(y) <= WILDS_MIN_X`, always, and there is a test that says so.
 *
 * ## It is derived from the ROW, and takes no seed
 *
 * Decor and weather hash the world seed because what they place is world
 * content. This is not content — it is the shape of a fixed region, and
 * `FARM_SIZE` does not move between worlds either. Hashing the row alone keeps
 * one fringe for every world, which is what a fixed region should have, and
 * costs no plumbing to reach the chunk baker.
 */

import { WILDS_MIN_X, WORLD_WIDTH } from '../../shared/constants';
import { mix32 } from '../../shared/hash';
import type { TileIndex } from '../../shared/ids';

/**
 * Deepest the fringe may reach back toward the town, in tiles.
 *
 * Three is enough to break the line at gameplay zoom and small enough that the
 * rough ground never arrives anywhere the player has business being: the town
 * band is sixteen tiles wide, so the fringe stays in its outer fifth.
 */
export const WILD_FRINGE_MAX = 3;

/** First column drawn as wilderness on row `y`. Never east of `WILDS_MIN_X`. */
export function wildEdgeX(y: number): number {
  return WILDS_MIN_X - (mix32(y, 0) % (WILD_FRINGE_MAX + 1));
}

/** Whether this tile should be drawn as untamed ground. */
export function isWildGround(tile: TileIndex): boolean {
  const y = Math.floor(tile / WORLD_WIDTH);
  return tile - y * WORLD_WIDTH >= wildEdgeX(y);
}
