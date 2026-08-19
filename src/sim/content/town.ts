/**
 * Town content: the village's building definitions and its fixed layout.
 * Phase-18 — ADR-030 §4, `WORLD_BIBLE.md` §Village.
 *
 * The layout is a TABLE, not a generator: every world gets the same village,
 * because the village is canon rather than variation, and a fixed table
 * consumes no RNG so determinism is untouched (ADR-030 §4). Coordinates are
 * absolute grid positions inside the town region (x ≥ `TOWN_MIN_X`) — asserted
 * by test, since a town building west of the boundary would stand on land a
 * farm is entitled to buy.
 *
 * Town buildings use the ordinary building model (ADR-004 §5): definition,
 * instance, blocked tile. What makes them "town" is where they stand — on
 * never-owned land — and `playerPlaceable: false`, which keeps them out of
 * `placeBuilding` (they are founded by construction, not bought).
 */

import { asContentId, type ContentId } from '../../shared/ids';

import type { BuildingDefinition } from './buildings';

export const CORE_COTTAGE = asContentId('core:cottage');
export const CORE_WELL = asContentId('core:well');
export const CORE_NOTICE_BOARD = asContentId('core:notice_board');
export const CORE_CASTLE = asContentId('core:castle');

/**
 * The village's buildings. Costs are zero because no coin path reaches them:
 * they are not purchasable (`playerPlaceable: false`) and not sellable (they
 * stand on unowned tiles, and selling requires an owned one).
 */
export const TOWN_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: CORE_COTTAGE,
    displayName: 'Cottage',
    sprite: 'buildings:cottage',
    footprint: { width: 2, height: 2 },
    cost: 0,
    playerPlaceable: false,
  },
  {
    id: CORE_WELL,
    displayName: 'Town Well',
    sprite: 'buildings:well',
    cost: 0,
    playerPlaceable: false,
  },
  {
    id: CORE_NOTICE_BOARD,
    displayName: 'Notice Board',
    sprite: 'buildings:notice_board',
    cost: 0,
    playerPlaceable: false,
  },
  {
    id: CORE_CASTLE,
    displayName: 'Castle',
    sprite: 'buildings:castle',
    footprint: { width: 4, height: 3 },
    cost: 0,
    playerPlaceable: false,
  },
];

/** The definition ids that mark a world as already having its town. */
export const TOWN_BUILDING_IDS: readonly ContentId[] = TOWN_BUILDINGS.map(
  (definition) => definition.id,
);

export interface TownPlacement {
  readonly building: ContentId;
  readonly x: number;
  readonly y: number;
}

/**
 * Where each building stands. Four cottages around the plaza (phase-19's
 * residents each get a door), the well at the plaza's centre, the notice
 * board beside the road entrance where phase-20's contracts will hang, and
 * the castle looking down the plaza from the north (owner's addition,
 * 2026-08-15 — the village's landmark).
 */
export const TOWN_PLACEMENTS: readonly TownPlacement[] = [
  // RE-LAID WIDE IN PHASE-45, and the reason is a measurement rather than a
  // preference. The world viewport is about 172 px tall — FIVE TILES — and this
  // town was spread over eleven rows, from the castle at y=25 to the southern
  // cottages at y=37. A player could never see two cottages at once, so the
  // town read as an empty plaza with something off-screen: exactly the "large
  // empty rectangle of tiles" the art direction forbids.
  //
  // The window is wide and short, so the town is now wide and short too. The
  // plaza, the well, the board and all four cottages sit inside rows 31–35 and
  // fit one screen together; the castle is the one thing above them, a landmark
  // you pan up to see rather than the reason you cannot see anything else.
  //
  // Buildings have FOOTPRINTS since phase-41 (cottage 2x2, castle 4x3) and
  // these origins are checked not to collide, and — the mistake the first
  // attempt made — not to sit ON the plaza: the castle takes rows 28–30 just
  // north of it, and the cottages take cols 65–66 and 76–77 either side.
  { building: CORE_COTTAGE, x: 65, y: 32 },
  { building: CORE_COTTAGE, x: 76, y: 32 },
  { building: CORE_COTTAGE, x: 65, y: 35 },
  { building: CORE_COTTAGE, x: 76, y: 35 },
  { building: CORE_WELL, x: 71, y: 33 },
  { building: CORE_NOTICE_BOARD, x: 69, y: 32 },
  { building: CORE_CASTLE, x: 70, y: 30 },
];

/**
 * The village's ground: a road west toward the farm, and the plaza square.
 * `core:path` tiles — walkable, never tillable, and workers already move
 * faster on them (`GAME_DESIGN.md` §2.2), which phase-19's residents inherit
 * for free.
 */
export function townPathTiles(): readonly { readonly x: number; readonly y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  // The road: from the region boundary to the plaza's west edge.
  for (let x = 64; x < 68; x += 1) tiles.push({ x, y: 33 });
  // The plaza: 7 wide and 4 deep around the well (phase-45). It was 7x7, which
  // is more rows than the window has, so most of it was never on screen at
  // once and the part that was looked like an empty field of paving.
  for (let y = 31; y <= 34; y += 1) {
    for (let x = 68; x <= 74; x += 1) tiles.push({ x, y });
  }
  // No castle walk: the castle's base row now sits directly against the
  // plaza's northern edge, so the paving already reaches its gate.
  return tiles;
}
