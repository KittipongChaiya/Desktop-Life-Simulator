/**
 * Where the wilds' nodes stand, for drawing. Phase-27 — ADR-037 §3.
 *
 * The pure half of the node layer, split from the Pixi half exactly as
 * `decor.ts` is split from `decor-view.ts` and for the same reason: all of the
 * arithmetic is testable without a GPU.
 *
 * ## This is derived, and that is the whole point
 *
 * Node positions never cross the snapshot boundary. They are `nodeAt` — a pure
 * hash of `(seed, tile)` — so the renderer computes them from the seed it
 * already holds, and the `wilds` slice carries only what CHANGES: which of them
 * have been worked. Publishing four hundred fixed positions on every launch
 * would be shipping a derivable fact across a boundary that exists for the
 * underivable ones (ADR-005 §2).
 *
 * ## And this is NOT decor
 *
 * `decor.ts` places cosmetic props the simulation knows nothing about — a
 * worker walks through a bush. Every sprite here is a real, gatherable thing,
 * at the exact tile the gather command will accept. The two must never be
 * confused, which is why decor now stops at the wilds boundary: both draw
 * `buildings:tree`, and a fake tree next to a real one teaches the player that
 * trees sometimes work and sometimes do not.
 *
 * THERE IS NO CEILING HERE, and that is deliberate — `MAX_DECOR` caps a
 * cosmetic system because no cosmetic system should be able to fill the scene
 * graph. Capping THIS would hide gatherable content: the player would see an
 * empty tile a worker walks to and harvests. The bound is the wilds' size times
 * the declared densities (~430 sprites, one atlas, one batch), and it is
 * asserted rather than clamped.
 */

import { WILDS_MIN_X, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { asTileIndex, type TileIndex } from '../../shared/ids';
import { nodeAt, type ResourceNodeRegistry } from '../../sim/content/resource-nodes';
import { isBlocked, type TileGrid } from '../../sim/world/tile-grid';

/** One node standing in the wilds, ready to draw. */
export interface WildNodeView {
  readonly tile: TileIndex;
  /** Sprite key from the manifest (`ASSETS.md` §5). */
  readonly sprite: string;
}

/**
 * Every node in the wilds, in ascending tile order.
 *
 * Pure: same registry, seed, and grid in, same nodes out, on every call and
 * every launch — which is what lets the view build its sprites once and then
 * only ever change their appearance.
 */
export function planWildNodes(
  registry: ResourceNodeRegistry,
  seed: number,
  grid: TileGrid,
): readonly WildNodeView[] {
  const nodes: WildNodeView[] = [];

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
      const tile = asTileIndex(y * WORLD_WIDTH + x);
      // A blocked tile is unreachable, so a node drawn on one would be a thing
      // the player can see and no worker can ever get to. `selectGather`
      // skips them for the same reason — the two must agree or the wilds
      // would show work that never happens.
      if (isBlocked(grid, tile)) continue;

      const node = nodeAt(registry, seed, tile);
      if (node !== null) nodes.push({ tile, sprite: node.sprite });
    }
  }

  return nodes;
}
