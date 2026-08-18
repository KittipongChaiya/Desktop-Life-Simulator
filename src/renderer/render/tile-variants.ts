/**
 * Which VARIANT of a ground tile a square shows. Phase-33 — ADR-041 §4.
 *
 * One grass tile stamped across two thousand squares is most of what made the
 * world read flat, and it is the cheapest thing in the cozy pass to fix: the
 * generator now emits three grass tiles and two wild ones, and this picks
 * between them.
 *
 * DERIVED FROM THE TILE INDEX, NOT STORED. The same argument `tile-variants`'
 * neighbours already make one layer up — `TILLED_SPRITE` is an override rather
 * than a kind (ADR-009 §1) and wild ground is a fact about a coordinate
 * (ADR-037 §1). A `variant` byte per tile would need a save migration, would be
 * a second source of truth for something a coordinate already answers, and
 * could drift from it. A hash costs nothing and cannot drift.
 *
 * KEYS COME FROM THE GENERATED MANIFEST, never from string literals — ADR-006
 * §4, and the reason is exactly this feature: a variant named in code but not
 * shipped in the atlas is a blank tile at runtime and nothing else catches it.
 * Through `Sprites` it is a compile error.
 *
 * IT MUST BE STABLE. A variant that changed between frames would make the
 * ground shimmer, and one that changed between sessions would make a player's
 * farm subtly different every time they opened it — so the hash takes the tile
 * index and nothing else. Not the world seed, not the tick, not the camera.
 */

import { Sprites } from '@assets/manifest';

import type { TileIndex } from '../../shared/ids';

/**
 * The variants each base sprite ships, INCLUDING the base itself at index 0.
 *
 * Weighting is by repetition rather than by a weight table: the plain tile
 * appears twice and the decorated ones once each, so roughly half the field is
 * quiet. That matters because the blooms are Tier 3 (`ART_DIRECTION.md` §9.1)
 * and a flower on every other square stops being a detail and becomes a
 * pattern — which is the failure the density rule names.
 */
const VARIANTS: ReadonlyMap<string, readonly string[]> = new Map([
  [
    Sprites.terrainGrass,
    [Sprites.terrainGrass, Sprites.terrainGrassB, Sprites.terrainGrass, Sprites.terrainGrassC],
  ],
  [Sprites.terrainWild, [Sprites.terrainWild, Sprites.terrainWildB]],
]);

/**
 * A cheap, well-mixed hash of one integer.
 *
 * A plain `tile % n` would band the map into stripes, because tile indices run
 * along rows — every square in a row would land on the same variant and the
 * field would read as corduroy. This is the finalizer from MurmurHash3, which
 * scatters adjacent inputs and is a handful of ALU ops.
 */
function mix(value: number): number {
  let hash = value | 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x21f0aaad);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x735a2d97);
  hash ^= hash >>> 15;
  return hash >>> 0;
}

/**
 * The sprite a tile should actually draw, after variant selection.
 *
 * Returns `sprite` UNCHANGED when it has no variants — which is every plugin
 * terrain, every tile kind added later, and the four core tiles that ship one
 * look. A caller never has to ask whether variants exist.
 */
export function variantSprite(sprite: string, tile: TileIndex): string {
  const options = VARIANTS.get(sprite);
  if (options === undefined) return sprite;
  return options[mix(tile) % options.length] ?? sprite;
}
