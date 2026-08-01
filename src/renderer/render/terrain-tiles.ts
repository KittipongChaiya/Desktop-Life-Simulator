/**
 * Pure terrain sprite selection.
 *
 * Which sprite a tile shows, with no PixiJS dependency — so it is unit-testable
 * without a GPU and `terrain-renderer.ts` stays the Pixi half, the same split
 * `terrain-chunks.ts` already makes for chunk arithmetic.
 *
 * TILLED SOIL IS AN OVERRIDE, NOT A TILE KIND. Tilling sets `tilledAt` and
 * leaves `kind` untouched (ADR-009 §1), so that reverting is one field write
 * and the ground underneath is never lost. The tilled look therefore has to be
 * applied at render time; a `core:tilled` kind would be a second source of
 * truth for the same fact, and the first save migration would drift them apart.
 */

import type { TileIndex } from '../../shared/ids';
import { TILLED_SPRITE, type TileKindRegistry } from '../../sim/content/tile-kinds';
import { getKind, type TileGrid } from '../../sim/world/tile-grid';
import { isTilled } from '../../sim/world/tile-state';

/** Sprite key for a tile as it should currently be drawn. */
export function tileSpriteKey(
  grid: TileGrid,
  tileKinds: TileKindRegistry,
  tile: TileIndex,
): string {
  if (isTilled(grid, tile)) return TILLED_SPRITE;

  const definition = tileKinds.byIndex(getKind(grid, tile));
  // An unknown index means the grid references a kind that is not registered —
  // a save from a build with more content, or a bug. Fall back to the first
  // kind rather than throwing inside a render pass.
  return definition?.sprite ?? tileKinds.byIndex(0)?.sprite ?? '';
}
