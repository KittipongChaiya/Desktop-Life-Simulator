/**
 * Ground decoration — trees, rocks, bushes, flowers. Phase-07.5e.
 *
 * The world is 64×64 and the farm occupies a fraction of it; everything else
 * is undifferentiated grass, which reads less like countryside than like an
 * unfinished level. `fix/0.1/7.5.md` §Visual asks for props and ground
 * decoration, and the art already exists — `tree`, `rock`, `bush`, and
 * `flower` shipped with the phase-05.5 world set.
 *
 * THREE RULES MAKE THIS SAFE:
 *
 * 1. **It is presentation, and touches nothing.** Decor is not a building, not
 *    an entity, and not in the save. It never blocks a tile, never costs a
 *    move, and never appears in a snapshot — a worker walks straight through a
 *    bush, because the bush does not exist as far as the simulation is
 *    concerned. Anything else would be new gameplay, which this phase forbids.
 *
 * 2. **It is derived, never rolled.** Placement is a pure hash of the world
 *    seed and the tile index — NOT `world.rng`. Drawing from the simulation's
 *    generator would consume its stream and desynchronise every future tick
 *    from a saved game (ADR-007); a hash reads nothing and advances nothing,
 *    so the same world always grows the same trees, on every launch, before
 *    and after a save.
 *
 * 3. **It stays off the farm.** Only unowned, walkable grass is eligible, so
 *    decor never lands on the plot, on tilled soil, on water, or under a
 *    building. Land expansion is handled by re-planning when ownership
 *    changes: a tile that becomes yours loses its tree.
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { asTileIndex, type TileIndex } from '../../shared/ids';
import { getKind, isBlocked, isOwned, type TileGrid } from '../../sim/world/tile-grid';

/** One placed prop. `sprite` is a manifest key (`ASSETS.md` §5). */
export interface DecorItem {
  readonly tile: TileIndex;
  readonly sprite: string;
}

/**
 * The props, with their relative weights.
 *
 * Weighted so the world reads as grassland with occasional stands of trees,
 * not as a forest the farm was carved out of: flowers and bushes are the
 * texture, trees and rocks the landmarks.
 */
const PROPS: readonly { readonly sprite: string; readonly weight: number }[] = [
  { sprite: 'buildings:flower', weight: 4 },
  { sprite: 'buildings:bush', weight: 3 },
  { sprite: 'buildings:tree', weight: 2 },
  { sprite: 'buildings:rock', weight: 1 },
];

const TOTAL_WEIGHT = PROPS.reduce((sum, prop) => sum + prop.weight, 0);

/**
 * Share of eligible tiles that get a prop, per thousand.
 *
 * Low on purpose. `fix/0.1/7.5.md` says readability outranks visual
 * complexity, and this is an overlay a few hundred pixels tall — dense scatter
 * would compete with the crops and workers the player is actually reading.
 */
const DENSITY_PER_MILLE = 55;

/**
 * Upper bound on props, whatever the density works out to.
 *
 * A hard ceiling rather than a trusted calculation: decor is cosmetic, and no
 * cosmetic system should be able to put an unbounded number of sprites in the
 * scene graph.
 */
export const MAX_DECOR = 220;

/**
 * A stable 32-bit hash of (seed, tile).
 *
 * Deliberately not the world RNG — see rule 2 in the module header. Any
 * well-mixed integer hash would do; this is the standard xorshift-style
 * finaliser, chosen because it is four lines and needs no state.
 */
function hash(seed: number, tile: number): number {
  let value = (seed ^ (tile * 0x9e37_79b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85eb_ca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2_ae35) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/**
 * Chooses where decoration goes for this world.
 *
 * Pure: same grid and seed in, same props out, on every call and every launch.
 * The caller re-plans when ownership changes, which is the only input that
 * moves during a session.
 */
export function planDecor(grid: TileGrid, seed: number, grassKindIndex: number): DecorItem[] {
  const items: DecorItem[] = [];

  for (let index = 0; index < WORLD_WIDTH * WORLD_HEIGHT; index += 1) {
    if (items.length >= MAX_DECOR) break;

    const tile = asTileIndex(index);
    // Off the farm, on plain grass, and nowhere a building stands.
    if (isOwned(grid, tile) || isBlocked(grid, tile)) continue;
    if (getKind(grid, tile) !== grassKindIndex) continue;

    const roll = hash(seed, index);
    if (roll % 1_000 >= DENSITY_PER_MILLE) continue;

    // A second, independent slice of the same hash picks the prop, so density
    // and species are not correlated.
    const pick = (roll >>> 10) % TOTAL_WEIGHT;
    let running = 0;
    for (const prop of PROPS) {
      running += prop.weight;
      if (pick < running) {
        items.push({ tile, sprite: prop.sprite });
        break;
      }
    }
  }

  return items;
}
