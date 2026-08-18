/**
 * Resource node definitions. Phase-27 — ADR-037 §5, ADR-004 §5.
 *
 * A node kind is the KIND of thing standing in the wilds: what it yields, how
 * long it takes to work, and how long it takes to come back. Registered once at
 * startup, never mutated, and — the part that matters — **never saved**.
 *
 * ## Existence is derived, not stored (ADR-037 §3)
 *
 * `nodeAt` is a pure function of `(seed, tile)`. There is no node table: the
 * wilds are ~2,000 tiles, and storing what stands on each of them would cost
 * the save a collection larger than everything else in it put together, need a
 * migration, and need an offline catch-up model for regrowth.
 *
 * Derived instead, the whole thing costs zero bytes and is exact after any
 * absence, because "is this node available at tick T" is arithmetic.
 *
 * The hash consumes **no RNG draw**. `world.rng` is a stream whose position is
 * part of the save (ADR-007), so drawing from it here would make what grows in
 * the wilds depend on how many other things had happened first — and two worlds
 * with one seed would diverge on the first weather roll. A hash of the inputs
 * has no position and cannot drift.
 *
 * The stated price (ADR-037 §3): installing a content pack that adds a node
 * kind re-rolls what grows where, exactly as adding a weather kind changes what
 * it rained last Tuesday (ADR-022 §5). Tolerable for the same reason — a wild
 * tile is a convenience, never a requirement.
 */

import { asContentId, type ContentId, type TileIndex } from '../../shared/ids';
import type { ItemStack } from '../world/container';

import { createContentRegistry, type ContentRegistry } from './registry';

export interface ResourceNodeDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  /** Sprite key from the generated manifest (ASSETS.md §5). */
  readonly sprite: string;
  /** What working it yields — a declared source (ADR-011 §4). */
  readonly yields: readonly ItemStack[];
  /** Ticks a worker spends on it. Integer (ADR-007 §7). */
  readonly gatherTicks: number;
  /** Ticks before it can be worked again. Integer. */
  readonly regrowTicks: number;
  /**
   * Share of wild tiles this kind occupies, in `[0, 1)`.
   *
   * Densities are summed in registration order and compared against one hash
   * value, so they behave like a weighted draw: the sum across all kinds is the
   * chance a wild tile has anything on it at all. A sum at or above 1 fills
   * every tile, which is refused at registration rather than discovered as a
   * wilderness with no floor.
   */
  readonly density: number;
}

export const CORE_TIMBER = asContentId('core:timber_node');
export const CORE_STONE_NODE = asContentId('core:stone_node');
export const CORE_ORE = asContentId('core:ore_node');

export type ResourceNodeRegistry = ContentRegistry<ResourceNodeDefinition>;

export function createResourceNodeRegistry(): ResourceNodeRegistry {
  return createContentRegistry<ResourceNodeDefinition>('resourceNode');
}

/**
 * Whether a node kind could ever appear and ever be worked.
 *
 * Refused at REGISTRATION, where the author is told — the same rule
 * `isRunnableRecipe` and `isSatisfiableRole` follow. A density of zero is a
 * kind that never spawns; a non-positive `gatherTicks` is a node a worker
 * finishes on the tick it starts, which would let one worker strip the wilds in
 * a single tick.
 */
export function isSpawnableNode(node: ResourceNodeDefinition): boolean {
  if (!Number.isFinite(node.density) || node.density <= 0 || node.density >= 1) return false;
  if (!Number.isInteger(node.gatherTicks) || node.gatherTicks <= 0) return false;
  if (!Number.isInteger(node.regrowTicks) || node.regrowTicks < 0) return false;
  return (
    node.yields.length > 0 &&
    node.yields.every((y) => Number.isInteger(y.quantity) && y.quantity > 0)
  );
}

/**
 * A stable hash of two integers into `[0, 1)`.
 *
 * Deliberately not `world.rng`: see the module header. This is the 32-bit
 * integer mix used by `presentation-rng.ts` for the same reason — cheap,
 * well-distributed, and positionless.
 */
function hash01(seed: number, tile: number): number {
  let h = (Math.imul(seed, 0x9e3779b1) ^ Math.imul(tile + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 0x1_0000_0000;
}

/**
 * The node standing on `tile`, or null.
 *
 * PURE and total: same seed and tile, same answer, for ever. Callers must
 * already know the tile is in the wilds — this function does not check regions,
 * because the region test belongs to the caller's geometry and duplicating it
 * here would be a second place the boundary is defined.
 */
export function nodeAt(
  registry: ResourceNodeRegistry,
  seed: number,
  tile: TileIndex,
): ResourceNodeDefinition | null {
  const roll = hash01(seed, tile);
  let floor = 0;
  // Registration order is the draw order, so it is on-disk-stable in the same
  // sense tile-kind indices are: reordering the registry re-rolls the wilds.
  for (const node of registry.all()) {
    floor += node.density;
    if (roll < floor) return node;
  }
  return null;
}

/**
 * Whether `tile`'s node can be worked at `tick`.
 *
 * `harvestedAt` holds only tiles worked recently; an absent entry means never
 * worked, which is available. Regrowth is arithmetic on the tick, so an
 * eight-hour absence needs no catch-up model at all (ADR-037 §3).
 */
export function isNodeReady(
  node: ResourceNodeDefinition,
  harvestedAt: number | undefined,
  tick: number,
): boolean {
  return harvestedAt === undefined || tick - harvestedAt >= node.regrowTicks;
}
