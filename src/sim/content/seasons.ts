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
  /**
   * Ground colour for the season, packed `0xRRGGBB`. Presentation only.
   *
   * It rides on the definition rather than in a registry of its own — the way
   * a crop carries its `stageSprites` — because a season and its colour are
   * one content decision, and splitting them would let a source register a
   * season with no colour or a colour for no season.
   *
   * Multiplied over the terrain, so `0xffffff` is "unchanged" and every other
   * value darkens. **No simulation rule may read this** (ADR-021 §6): a
   * seasonal repaint is a tempting place to hang a rule, and it is exactly the
   * ADR-020 §4 prohibition restated one system along.
   */
  readonly tint: number;
}

export const CORE_SPRING = asContentId('core:spring');
export const CORE_SUMMER = asContentId('core:summer');
export const CORE_AUTUMN = asContentId('core:autumn');
export const CORE_WINTER = asContentId('core:winter');

export type SeasonRegistry = ContentRegistry<SeasonDefinition>;

export function createSeasonRegistry(): SeasonRegistry {
  return createContentRegistry<SeasonDefinition>('season');
}

/** A season's ground tint, or white if the season is not registered. */
export function seasonTint(registry: SeasonRegistry, season: string | undefined): number {
  if (season === undefined) return 0xffffff;
  const definition = registry.get(asContentId(season));
  return definition.ok ? definition.value.tint : 0xffffff;
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
