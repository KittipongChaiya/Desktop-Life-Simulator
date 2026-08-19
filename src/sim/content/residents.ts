/**
 * The residents: who lives in the village. Phase-19 — ADR-031 §1.
 *
 * A fixed table beside the town layout (ADR-030 §4's pattern), not a registry:
 * no second content source wants to add a resident yet, and a capability
 * nothing exercises is a claim rather than a feature (the ADR-016 §4
 * deferral). The names became canon on first appearance and are recorded in
 * `LORE_BIBLE.md` §17.
 *
 * Everything here is CONTENT — one of the three inputs a resident's derived
 * day is allowed to read (content, seed, tick — ADR-031 §2). Homes correspond
 * one-to-one with the cottages in `TOWN_PLACEMENTS`; a test pins that, since
 * a resident whose home is not a cottage would derive a day anchored to a
 * door that does not exist.
 */

import { asContentId, type ContentId } from '../../shared/ids';

/** The two villager costume variants on the shared rig (CHARACTER_BIBLE §14). */
export type VillagerCostume = 'villager_a' | 'villager_b';

export interface ResidentDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  /** The cottage this resident lives in — must match a `TOWN_PLACEMENTS` cottage. */
  readonly home: { readonly x: number; readonly y: number };
  readonly costume: VillagerCostume;
}

export const RESIDENTS: readonly ResidentDefinition[] = [
  {
    id: asContentId('core:resident_marla'),
    displayName: 'Marla',
    home: { x: 65, y: 32 },
    costume: 'villager_a',
  },
  {
    id: asContentId('core:resident_tobin'),
    displayName: 'Tobin',
    home: { x: 76, y: 32 },
    costume: 'villager_b',
  },
  {
    id: asContentId('core:resident_prue'),
    displayName: 'Prue',
    home: { x: 65, y: 35 },
    costume: 'villager_b',
  },
  {
    id: asContentId('core:resident_edwin'),
    displayName: 'Edwin',
    home: { x: 76, y: 35 },
    costume: 'villager_a',
  },
];

/**
 * Where a resident's day happens: the gathering spots of the village, all on
 * walkable town ground (asserted by test against the layout — a stop under a
 * building would strand every itinerary that draws it).
 *
 * The well's four sides, plaza corners, the tile beside the notice board, and
 * the castle gate. Doors of the OTHER cottages join at derivation time, so a
 * resident can call on a neighbour.
 */
export const TOWN_STOPS: readonly { readonly x: number; readonly y: number }[] = [
  // Re-sited with the town in phase-45. Every one of these must be walkable
  // town ground: a stop inside a building's footprint strands every itinerary
  // that draws it, and footprints are three tiles wide now.
  { x: 70, y: 33 }, // west of the well
  { x: 72, y: 33 }, // east of the well
  { x: 71, y: 32 }, // north of the well
  { x: 71, y: 34 }, // south of the well
  { x: 68, y: 31 }, // plaza, north-west
  { x: 74, y: 31 }, // plaza, north-east
  { x: 68, y: 34 }, // plaza, south-west
  { x: 74, y: 34 }, // plaza, south-east
  { x: 70, y: 32 }, // beside the notice board
  { x: 71, y: 31 }, // the castle gate, where the paving meets its wall
];

/** The tile a resident stands on when emerging from (or entering) a home. */
export function doorOf(home: { readonly x: number; readonly y: number }): {
  readonly x: number;
  readonly y: number;
} {
  // Cottages face south: the door tile is directly below the building.
  return { x: home.x, y: home.y + 1 };
}
