/**
 * Pure terrain sprite selection.
 *
 * Which sprite a tile shows, with no PixiJS dependency — so it is unit-testable
 * without a GPU and `terrain-renderer.ts` stays the Pixi half, the same split
 * `terrain-chunks.ts` already makes for chunk arithmetic.
 *
 * TWO OVERRIDES, NEITHER OF THEM A TILE KIND. Tilled soil is a recorded fact
 * about a tile; wild ground is a fact about where the tile IS. Both are drawn
 * on top of whatever kind the grid holds, and neither is stored.
 *
 * TILLED SOIL IS AN OVERRIDE, NOT A TILE KIND. Tilling sets `tilledAt` and
 * leaves `kind` untouched (ADR-009 §1), so that reverting is one field write
 * and the ground underneath is never lost. The tilled look therefore has to be
 * applied at render time; a `core:tilled` kind would be a second source of
 * truth for the same fact, and the first save migration would drift them apart.
 *
 * WILD GROUND IS THE SAME ARGUMENT AT REGION SCALE (phase-27, ADR-037 §1).
 * The wilds are fixed geometry, so a tile east of `WILDS_MIN_X` is wilderness
 * by virtue of its coordinate; writing a kind byte into two thousand tiles to
 * record that would need a migration and could then disagree with the
 * boundary the gather command enforces.
 *
 * It applies to GRASS ONLY. The override says what untended grass looks like,
 * so a plugin that puts a lake or a rock face out there keeps its water and
 * its stone — wild grass painted over a lake would be the drift this whole
 * arrangement exists to avoid.
 */

import type { TileIndex } from '../../shared/ids';
import {
  CORE_GRASS,
  TILLED_SPRITE,
  WILD_SPRITE,
  type TileKindRegistry,
} from '../../sim/content/tile-kinds';
import { getKind, type TileGrid } from '../../sim/world/tile-grid';
import { isTilled } from '../../sim/world/tile-state';

import { isWildGround } from './wild-ground';

/** Sprite key for a tile as it should currently be drawn. */
export function tileSpriteKey(
  grid: TileGrid,
  tileKinds: TileKindRegistry,
  tile: TileIndex,
): string {
  if (isTilled(grid, tile)) return TILLED_SPRITE;

  const definition = tileKinds.byIndex(getKind(grid, tile));
  if (definition?.id === CORE_GRASS && isWildGround(tile)) return WILD_SPRITE;

  // An unknown index means the grid references a kind that is not registered —
  // a save from a build with more content, or a bug. Fall back to the first
  // kind rather than throwing inside a render pass.
  return definition?.sprite ?? tileKinds.byIndex(0)?.sprite ?? '';
}
