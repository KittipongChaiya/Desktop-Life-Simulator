/**
 * Wilds snapshot projection. Phase-27 — ADR-005 §2, ADR-037 §3.
 *
 * The sim→view boundary for the wilds, and it is nearly empty on purpose.
 *
 * WHAT DOES NOT CROSS IT: where the nodes are. Node existence is a pure hash of
 * `(seed, tile)` (ADR-037 §3), and the renderer already holds the seed, so
 * publishing four hundred positions every launch would be shipping a derivable
 * fact across a boundary that exists to carry the underivable ones.
 *
 * WHAT DOES: which of them cannot be worked right now. That is the only thing
 * about the wilds that changes, and it is the only thing a player needs to see
 * — a felled stand looks different from a standing one.
 *
 * THE PROJECTION IS A BOOLEAN, NOT A COUNTDOWN. Regrowth is `tick - harvestedAt
 * >= regrowTicks`, so a slice carrying "ticks remaining" would differ on every
 * tick of every regrow period and republish 20 times a second for as long as
 * anything in the wilds was regrowing — the exact defect ADR-005 §2 names, and
 * the same trap `crops-slice.ts` documents for growth. Worked-or-not changes
 * twice per node per cycle, so this republishes twice per cycle.
 */

import { isInWilds } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';
import { isNodeReady, nodeAt, type ResourceNodeRegistry } from '../content/resource-nodes';

/** The world state the projection reads. `World` satisfies this structurally. */
export interface WildsProjectionSource {
  readonly seed: number;
  readonly tick: number;
  readonly resourceNodeRegistry: ResourceNodeRegistry;
  readonly harvestedAt: ReadonlyMap<TileIndex, number>;
}

/**
 * Tiles whose node has been worked and has not come back, ordered by tile.
 *
 * Ordered because a `Map` iterates in INSERTION order: two identical states
 * reached by gathering in a different order would compare unequal and
 * republish for nothing.
 *
 * Bounded by how many nodes were worked in the last regrow period — a handful —
 * not by the size of the wilds, because `pruneHarvested` drops an entry as soon
 * as it expires.
 */
export function projectWilds(source: WildsProjectionSource): readonly number[] {
  const worked: number[] = [];
  for (const [tile, at] of source.harvestedAt) {
    // THE REGION CHECK, for the reason `validateGatherNode` states: `nodeAt`
    // answers for any tile in the world, so a stamp on a FARM tile — a save
    // from before the gather command checked, or a content pack that moved the
    // boundary — would publish a worked node in the middle of the plot.
    if (!isInWilds(tile)) continue;
    // A stamp on a tile with no node is dead weight a save can still carry —
    // an uninstalled content pack, or a build with more node kinds than this
    // one. Nothing is drawn for it (SAVE_FORMAT.md §5.3).
    const node = nodeAt(source.resourceNodeRegistry, source.seed, tile);
    if (node === null) continue;
    if (!isNodeReady(node, at, source.tick)) worked.push(tile);
  }
  return worked.sort((a, b) => a - b);
}

/** Change test for the wilds slice — republishes only on a real change. */
export function wildsEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
