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
 * 3. **The farm gets its OWN set** (phase-37; this rule used to read "it stays
 *    off the farm"). Trees, rocks and bushes still never land on the plot —
 *    rule 4 makes a tree mean something, and scenery where the player wants to
 *    build is an obstacle in all but name. But "off the farm" left the plot as
 *    the one part of the world with nothing on it, bare grass around the very
 *    buildings the player chose to place, which is the opposite of the lived-in
 *    farm the art direction asks for. So owned grass draws from `FARM_PROPS`
 *    instead: crates, bales, sacks, tools, flowers. Never on TILLED ground,
 *    never under a building, and never anything that could be mistaken for a
 *    resource. Re-planned when ownership OR the buildings change.
 *
 * 4. **AND IT NEVER DRAWS A TREE OR A ROCK** (phase-27). Rule 1 says a prop is
 *    not a thing — a worker walks straight through a bush. That was harmless
 *    until the wilds arrived, because `tree` and `rock` are exactly the sprites
 *    the timber and stone NODES use, and two identical trees where one can be
 *    worked and one cannot is not decoration: it is a lie about what the world
 *    contains, and it costs the player a walk to find out.
 *
 *    Excluding the wilds from this scan was the first fix and it was not
 *    enough — a live look showed identical trees either side of the boundary,
 *    with nothing but a shade of ground between them. So the RULE is now the
 *    simple one a player can actually learn:
 *
 *        A tree or a rock is something you can work. Everything else is
 *        scenery.
 *
 *    Decor keeps flowers and bushes at the same density, so the countryside is
 *    a MEADOW and the wilds are a FOREST — which reads as geography instead of
 *    as a rule, and reinforces where the gathering is.
 */

import { TOWN_MIN_X, WILDS_MIN_X, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { mix32 } from '../../shared/hash';
import { asTileIndex, type TileIndex } from '../../shared/ids';
import { getKind, isBlocked, isOwned, type TileGrid } from '../../sim/world/tile-grid';
import { isTilled } from '../../sim/world/tile-state';

/** One placed prop. `sprite` is a manifest key (`ASSETS.md` §5). */
export interface DecorItem {
  readonly tile: TileIndex;
  readonly sprite: string;
}

/**
 * The props, with their relative weights.
 *
 * Weighted so the world reads as meadow: flowers scattered through, bushes as
 * the occasional mass. Trees and rocks were here until phase-27 and are gone
 * for rule 4 — they mean something now.
 *
 * The relative weights of the survivors are unchanged, so the countryside has
 * the same texture it had, minus its landmarks.
 */
const PROPS: readonly { readonly sprite: string; readonly weight: number }[] = [
  { sprite: 'buildings:flower', weight: 4 },
  { sprite: 'buildings:bush', weight: 3 },
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
 * The FARM set (phase-37). What a worked plot has lying about on it.
 *
 * Rule 3 keeps every prop above OFF owned land, and that rule is right: a tree
 * on the plot would be a lie about what can be worked (rule 4), and scenery
 * that sat where the player wanted to build would be an obstacle in all but
 * name. But it left the farm as the one part of the world with nothing on it
 * — bare grass around the very buildings the player chose to place.
 *
 * So this is a SEPARATE set with its own eligibility. Nothing here is a
 * resource, nothing here is a tree or a rock, and every one of them is the
 * kind of object a person puts down and comes back for.
 */
const FARM_PROPS: readonly { readonly sprite: string; readonly weight: number }[] = [
  { sprite: 'buildings:crate', weight: 3 },
  { sprite: 'buildings:hay_bale', weight: 3 },
  { sprite: 'buildings:sacks', weight: 2 },
  { sprite: 'buildings:farm_tools', weight: 2 },
  // The flower clump is shared with the countryside on purpose: a farm with
  // flowers on it is a farm somebody likes, and it ties the two regions
  // together rather than making the boundary a hard line of props.
  { sprite: 'buildings:flower', weight: 4 },
];

const FARM_TOTAL_WEIGHT = FARM_PROPS.reduce((sum, prop) => sum + prop.weight, 0);

/**
 * How thickly the farm is dressed, per thousand eligible tiles, as the plot
 * grows from its first few squares to a full farm.
 *
 * THE BRIEF ASKS THE FARM TO SHOW PROGRESSION — humble at the start, busy
 * later, clearly lived in at the end. Density keyed to how much land is owned
 * is the honest way to say that with no new state at all: the grid already
 * knows how big the plot is, and a bigger plot means both more eligible tiles
 * AND more things on each of them.
 *
 * It starts BELOW the countryside's 55 and ends above it. A first-day farm
 * should look like somebody just arrived.
 */
const FARM_DENSITY_MIN = 20;
const FARM_DENSITY_MAX = 75;
/** Owned tiles at which the farm is considered fully dressed. */
const FARM_DENSITY_FULL = 400;

/**
 * The TOWN set (phase-37). The third region's identity.
 *
 * The world is three fixed bands — farm, town, wilds — and until now this
 * function knew about exactly one boundary: it stopped at the wilds. The town
 * band got the same meadow scatter as open countryside, so the one part of the
 * map where people supposedly live looked like a field with buildings in it.
 *
 * These are the objects a settlement has and a field does not: something to sit
 * on, something to read, something that lights the way home — and a cat.
 */
const TOWN_PROPS: readonly { readonly sprite: string; readonly weight: number }[] = [
  { sprite: 'buildings:bench', weight: 3 },
  { sprite: 'buildings:lamp', weight: 3 },
  { sprite: 'buildings:signpost', weight: 2 },
  // Flowers are shared with every other region on purpose: they are what makes
  // three sets read as one world rather than as three tilesets.
  { sprite: 'buildings:flower', weight: 4 },
  // Sparingly, exactly as the brief asks. One in fourteen town props.
  { sprite: 'buildings:cat', weight: 1 },
];

const TOWN_TOTAL_WEIGHT = TOWN_PROPS.reduce((sum, prop) => sum + prop.weight, 0);

/**
 * The town is dressed more thinly than the countryside, which is not a
 * mistake. Its props are TALLER and busier — a lamp is 34 px — and the band is
 * where buildings, residents and the market are. Density that reads as cosy in
 * a meadow reads as clutter in a street.
 */
const TOWN_DENSITY_PER_MILLE = 38;

/** Density for a plot of this size, clamped to the range above. */
function farmDensity(ownedTiles: number): number {
  const t = Math.min(1, Math.max(0, ownedTiles / FARM_DENSITY_FULL));
  return Math.round(FARM_DENSITY_MIN + (FARM_DENSITY_MAX - FARM_DENSITY_MIN) * t);
}

/**
 * Upper bound on props, whatever the density works out to.
 *
 * A hard ceiling rather than a trusted calculation: decor is cosmetic, and no
 * cosmetic system should be able to put an unbounded number of sprites in the
 * scene graph.
 */
export const MAX_DECOR = 220;

/**
 * Which prop set and density a tile draws from, or `null` if it is ineligible.
 *
 * Split out so the placement pass can be run TWICE over the same rule — once
 * to count what the world wants, once to place what the budget allows — with
 * no chance of the two disagreeing about eligibility.
 */
function regionFor(
  grid: TileGrid,
  index: number,
  grassKindIndex: number,
  farmPerMille: number,
):
  | readonly [readonly { readonly sprite: string; readonly weight: number }[], number, number]
  | null {
  const tile = asTileIndex(index);
  // Rule 4: the wilds grow their own trees, and those ones mean something.
  if (index % WORLD_WIDTH >= WILDS_MIN_X) return null;
  // Nowhere a building stands, and only on plain grass, for every set.
  if (isBlocked(grid, tile)) return null;
  if (getKind(grid, tile) !== grassKindIndex) return null;

  const owned = isOwned(grid, tile);
  // NEVER on worked ground. A crate standing in a furrow hides the crop the
  // player is there to read, and a crop is Tier 1.
  if (owned && isTilled(grid, tile)) return null;

  // THE THREE REGIONS, in the order that decides them: the plot the player
  // works, then the band people live in, then everything else. Read from the
  // world's own geography (`TOWN_MIN_X`) rather than from a second map.
  if (owned) return [FARM_PROPS, FARM_TOTAL_WEIGHT, farmPerMille];
  if (index % WORLD_WIDTH >= TOWN_MIN_X) {
    return [TOWN_PROPS, TOWN_TOTAL_WEIGHT, TOWN_DENSITY_PER_MILLE];
  }
  return [PROPS, TOTAL_WEIGHT, DENSITY_PER_MILLE];
}

/**
 * A stable 32-bit hash of (seed, tile).
 *
 * Deliberately not the world RNG — see rule 2 in the module header. Moved to
 * `shared/hash.ts` in phase-12a, where weather needs the same primitive for
 * the same reason (ADR-022 §1). Same function, byte for byte: decor placement
 * in an existing world must not move.
 */
const hash = mix32;

/**
 * Chooses where decoration goes for this world.
 *
 * Pure: same grid and seed in, same props out, on every call and every launch.
 * The caller re-plans when ownership changes, which is the only input that
 * moves during a session.
 */
export function planDecor(grid: TileGrid, seed: number, grassKindIndex: number): DecorItem[] {
  const items: DecorItem[] = [];
  const total = WORLD_WIDTH * WORLD_HEIGHT;

  // How big the plot is, which sets how thickly the farm is dressed. Counted
  // rather than stored: the grid already knows, and a second copy could drift.
  let ownedTiles = 0;
  for (let index = 0; index < total; index += 1) {
    if (isOwned(grid, asTileIndex(index))) ownedTiles += 1;
  }
  const farmPerMille = farmDensity(ownedTiles);

  // PASS ONE: how many props does the world want?
  //
  // THE CAP USED TO BE A CLIFF. Placement filled from tile 0 and `break`ed at
  // `MAX_DECOR`, and the world wants about 300 props against a ceiling of 220
  // — so the last NINE ROWS of the map had no decoration at all, a bald strip
  // along the southern edge that no test looked for and that got worse every
  // time a prop set was added. Counting first turns the ceiling into a uniform
  // thinning instead of a crop.
  let wanted = 0;
  for (let index = 0; index < total; index += 1) {
    const region = regionFor(grid, index, grassKindIndex, farmPerMille);
    if (region !== null && hash(seed, index) % 1_000 < region[2]) wanted += 1;
  }

  // PASS TWO: place, scaled to fit. `keepPerMille` is 1000 when the world fits
  // under the cap, so a small map is untouched by any of this.
  const keepPerMille = wanted > MAX_DECOR ? Math.floor((MAX_DECOR * 1_000) / wanted) : 1_000;

  for (let index = 0; index < total; index += 1) {
    if (items.length >= MAX_DECOR) break;

    const region = regionFor(grid, index, grassKindIndex, farmPerMille);
    if (region === null) continue;
    const [set, weight, perMille] = region;

    const roll = hash(seed, index);
    if (roll % 1_000 >= perMille) continue;
    // A THIRD independent slice decides survival, so thinning does not
    // correlate with which region or which species a tile would have had.
    if ((roll >>> 20) % 1_000 >= keepPerMille) continue;

    // A second, independent slice of the same hash picks the prop, so density
    // and species are not correlated.
    const pick = (roll >>> 10) % weight;
    let running = 0;
    for (const prop of set) {
      running += prop.weight;
      if (pick < running) {
        items.push({ tile: asTileIndex(index), sprite: prop.sprite });
        break;
      }
    }
  }

  return items;
}
