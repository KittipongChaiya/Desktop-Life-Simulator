/**
 * Tile kinds — the first real content type.
 *
 * Registered rather than hardcoded so phase-03 can add `core:tilled` and
 * `core:path`, and so a v0.2 plugin can add terrain, without touching the grid
 * or the renderer.
 *
 * `GAME_DESIGN.md` §2.2 defines the v0.1 set. Only the three that exist in
 * phase-02 are registered here; tilled soil and paths arrive with the systems
 * that give them meaning.
 */

import { asContentId, type ContentId } from '../../shared/ids';

import { createContentRegistry, type ContentRegistry } from './registry';

export interface TileKindDefinition {
  readonly id: ContentId;
  /** Entities may stand on it. */
  readonly walkable: boolean;
  /** May be converted to tilled soil (phase-03). */
  readonly tillable: boolean;
  /**
   * Movement cost multiplier. 1 is normal; paths are cheaper (phase-03).
   * Pathfinding reads this rather than special-casing kinds.
   */
  readonly moveCost: number;
  /** Sprite key from the generated asset manifest (ADR-006 §4). */
  readonly sprite: string;
}

export const CORE_GRASS = asContentId('core:grass');
export const CORE_WATER = asContentId('core:water');
export const CORE_STONE = asContentId('core:stone');
export const CORE_PATH = asContentId('core:path');

/**
 * Sprite for a TILLED tile — a tile state, deliberately not a tile kind.
 *
 * Tilling sets `tilledAt` and leaves `kind` alone (ADR-009 §1), so the sprite
 * belongs to no definition and cannot live on one. It lives here, with the rest
 * of the terrain content, rather than as a string literal in the render layer.
 */
export const TILLED_SPRITE = 'terrain:tilled';

export type TileKindRegistry = ContentRegistry<TileKindDefinition>;

export function createTileKindRegistry(): TileKindRegistry {
  return createContentRegistry<TileKindDefinition>('tile kind');
}
