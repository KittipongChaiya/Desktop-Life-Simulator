/**
 * Season definitions. Phase-11a — ADR-021 §1.
 *
 * The engine owns the cycle; a content source owns the names. ADR-021
 * §Alternatives D rejects hardcoding them outright: a four-season year is a
 * content decision, and hardcoding it would stop a source shipping a two-season
 * world for no saving at all.
 *
 * ## Registration order is the year's order
 *
 * There is no `order` field, deliberately. Registration order already is an
 * order, and a second one could disagree with it. This is the `tile-kinds.ts`
 * rule in a different costume — and it carries the same warning, for the same
 * reason:
 *
 * > **Appending is safe; reordering is not.** A world freezes the ordered list
 * > at creation (`world.seasons`), so reordering the registry cannot renumber
 * > an existing save — but it will give a NEW world a different year to every
 * > world created before it, silently.
 *
 * Unlike a tile kind's index, this never becomes a byte in a grid. What the
 * save stores is the whole ordered list, so an existing world keeps its year
 * even if the content that defined it changes underneath (ADR-021 §1).
 */

import { asContentId, type ContentId } from '../../shared/ids';

import { createContentRegistry, type ContentRegistry } from './registry';

export interface SeasonDefinition {
  readonly id: ContentId;
  /** What a player reads. Presentation only — no rule may branch on it. */
  readonly displayName: string;
}

export const CORE_SPRING = asContentId('core:spring');
export const CORE_SUMMER = asContentId('core:summer');
export const CORE_AUTUMN = asContentId('core:autumn');
export const CORE_WINTER = asContentId('core:winter');

export type SeasonRegistry = ContentRegistry<SeasonDefinition>;

export function createSeasonRegistry(): SeasonRegistry {
  return createContentRegistry<SeasonDefinition>('season');
}

/**
 * The ordered season list a world freezes at creation.
 *
 * Taken from the registry once, at world creation, and then persisted — so the
 * year a save runs on is the one it was created with, not the one whatever
 * content happens to be installed today would produce (ADR-021 §1).
 */
export function seasonOrder(registry: SeasonRegistry): readonly string[] {
  return registry.all().map((season) => season.id);
}
