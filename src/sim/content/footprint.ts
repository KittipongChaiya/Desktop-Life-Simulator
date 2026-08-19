/**
 * How many tiles a building stands on. Phase-41 — ADR-042 §3.
 *
 * Until now every building occupied exactly one tile, because nothing could
 * express anything else. That is the single fact that made the world read as a
 * grid of cells: a house was an icon in a box, the same size as a flowerpot.
 *
 * ## The origin is the BOTTOM-LEFT tile
 *
 * A footprint grows UP and RIGHT from the tile the player clicks. Up, because
 * sprites are anchored at their base (ADR-042 §2) and a building's base row is
 * what it stands on — so the origin is also its depth, with no conversion. Left
 * to right, because that is the order tiles are indexed in and it keeps the
 * arithmetic obvious.
 *
 * The consequence a player sees: clicking near the top or right edge of the
 * plot can refuse a large building. That is predictable and reversible, which
 * is the most a placement rule can be.
 *
 * ## It is CONTENT, and it is DERIVED
 *
 * The footprint lives on the definition, so a save records only which building
 * is on which tile and the occupied tiles are recomputed from the registry on
 * load — exactly as the sprite is. A footprint written into a save would be a
 * second source of truth for a fact content already owns, and it would freeze
 * v0.5's sizes into every file written before v0.6 changed them.
 *
 * ## Logical, not visual
 *
 * These are the tiles the SIMULATION owns: blocked for pathing, refused to
 * another building, refused to a crop. What the sprite covers is the renderer's
 * business and is deliberately allowed to be larger — a roof overhangs, a
 * canopy shades a worker walking past. Conflating the two is the mistake
 * ADR-042 §3 was written to prevent.
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';

/** A building's logical size, in tiles. */
export interface Footprint {
  readonly width: number;
  readonly height: number;
}

/** What a definition with no declared footprint means. */
export const SINGLE_TILE: Footprint = { width: 1, height: 1 };

/**
 * The tiles a building at `origin` would occupy, or `null` if any of them
 * falls outside the world.
 *
 * Returns `null` rather than clamping: a building that silently shrank at the
 * map edge would block fewer tiles than its art covers, and a worker would walk
 * through its wall.
 */
export function footprintTiles(
  origin: TileIndex,
  footprint: Footprint,
): readonly TileIndex[] | null {
  const originRow = Math.floor(origin / WORLD_WIDTH);
  const originCol = origin - originRow * WORLD_WIDTH;

  // Grows UP from the origin row, so the top row is the smaller index.
  const topRow = originRow - (footprint.height - 1);
  const rightCol = originCol + (footprint.width - 1);

  if (topRow < 0 || rightCol >= WORLD_WIDTH || originRow >= WORLD_HEIGHT) return null;

  const tiles: TileIndex[] = [];
  for (let row = topRow; row <= originRow; row += 1) {
    for (let col = originCol; col <= rightCol; col += 1) {
      tiles.push(toIndexUnchecked(col, row));
    }
  }
  return tiles;
}

/**
 * Whether a footprint is one tile — the common case, and the one that needs no
 * rectangle arithmetic anywhere.
 */
export function isSingleTile(footprint: Footprint): boolean {
  return footprint.width === 1 && footprint.height === 1;
}
