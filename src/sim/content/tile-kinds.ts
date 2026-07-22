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

export type TileKindRegistry = ContentRegistry<TileKindDefinition>;

export function createTileKindRegistry(): TileKindRegistry {
  return createContentRegistry<TileKindDefinition>('tile kind');
}

/**
 * Registers the v0.1 terrain set.
 *
 * Order is significant: it fixes each kind's dense numeric index, which the
 * tile grid stores. Appending is safe; reordering would reinterpret every
 * existing grid and every save.
 */
export function registerCoreTileKinds(registry: TileKindRegistry): void {
  const kinds: readonly TileKindDefinition[] = [
    { id: CORE_GRASS, walkable: true, tillable: true, moveCost: 1, sprite: 'terrain:grass' },
    { id: CORE_WATER, walkable: false, tillable: false, moveCost: 0, sprite: 'terrain:water' },
    { id: CORE_STONE, walkable: false, tillable: false, moveCost: 0, sprite: 'terrain:stone' },
    // Appended, so grass/water/stone keep their indices. A worker crosses a path
    // in 7 ticks vs 10 on grass (§2.2). No path-laying mechanic ships in v0.1;
    // the kind and its cost exist so movement honours paths when they arrive.
    { id: CORE_PATH, walkable: true, tillable: false, moveCost: 0.7, sprite: 'terrain:path' },
  ];

  for (const kind of kinds) {
    const result = registry.register(kind);
    if (!result.ok) {
      // Core content failing to register is a programming error, not a runtime
      // condition — it means duplicate or malformed IDs shipped.
      throw new Error(`failed to register ${kind.id}: ${result.error.message}`);
    }
  }
}
