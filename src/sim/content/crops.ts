/**
 * Crop definitions. ADR-004 §5 — definitions are data, instances reference them.
 *
 * A definition is the KIND of crop: how long it takes, what it yields, what it
 * looks like at each stage. It is registered once at startup, never mutated,
 * and never saved — instances store a `ContentId` and look the definition up.
 *
 * That split is why rebalancing a growth time is a data edit rather than a save
 * migration, and why a v0.2 plugin can add a crop without touching core.
 *
 * No inheritance. A crop that behaves differently gets different DATA, not a
 * subclass (ADR-004 §Alternatives B).
 */

import { asContentId, type ContentId } from '../../shared/ids';
import type { ItemStack } from '../world/container';

import { createContentRegistry, type ContentRegistry } from './registry';

/**
 * Visual stages a crop passes through.
 *
 * Four stages, at fixed fractions of total growth (`GAME_DESIGN.md` §3.3).
 * Staged rather than continuous so a growing crop dirties the scene four times
 * over its life instead of every tick (ADR-001 §1).
 */
export const CropStage = {
  Seed: 0,
  Sprout: 1,
  Growing: 2,
  Mature: 3,
} as const;

export type CropStage = (typeof CropStage)[keyof typeof CropStage];

/** Fraction of total growth at which each stage begins. */
export const STAGE_THRESHOLDS: readonly number[] = [0, 0.25, 0.55, 1];

export interface CropDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  /** Total ticks from planting to mature. ADR-007 §7 — authored in ticks. */
  readonly growthTicks: number;
  /** Sprite key per stage, indexed by `CropStage`. */
  readonly stageSprites: readonly string[];
  /** What harvesting produces. */
  readonly harvestYield: readonly ItemStack[];
  /** The item one plant consumes (`GAME_DESIGN.md` §8.1 — "1 seed"). Phase-06b. */
  readonly seedItem: ContentId;
  /**
   * Fixed purchase price per seed (§3.1). Fixed, not dynamic — seeds are
   * bought from the market at list; only SELLING passes the multiplier.
   */
  readonly seedCost: number;
  /**
   * Seasons this crop may grow in. Empty means "any".
   *
   * Declared now because it is DATA, not behaviour — v0.2 seasons read it
   * without changing the definition shape. An empty array is the honest
   * v0.1 answer, not a placeholder.
   */
  readonly seasons: readonly string[];
  /**
   * Open-ended classification for future systems.
   *
   * Tags let v0.3 contracts ask for "a root vegetable" and v0.4 recipes ask for
   * "a grain" without either editing this interface (ADR-004 §4: composition
   * where variation is real).
   */
  readonly tags: readonly string[];
}

export const CORE_TURNIP = asContentId('core:turnip');
export const CORE_WHEAT = asContentId('core:wheat');
export const CORE_CARROT = asContentId('core:carrot');
export const CORE_PUMPKIN = asContentId('core:pumpkin');

export type CropRegistry = ContentRegistry<CropDefinition>;

export function createCropRegistry(): CropRegistry {
  return createContentRegistry<CropDefinition>('crop');
}

/**
 * Stage a crop has reached after `elapsedTicks`.
 *
 * PURE. Depends only on elapsed ticks and the definition (ADR-009 §2), which is
 * what makes offline progress exact rather than approximated.
 */
export function stageFor(definition: CropDefinition, elapsedTicks: number): CropStage {
  if (elapsedTicks >= definition.growthTicks) return CropStage.Mature;
  if (elapsedTicks <= 0) return CropStage.Seed;

  const progress = elapsedTicks / definition.growthTicks;

  // Walk down so the highest satisfied threshold wins.
  for (let stage = STAGE_THRESHOLDS.length - 1; stage >= 0; stage -= 1) {
    if (progress >= (STAGE_THRESHOLDS[stage] ?? 0)) return stage as CropStage;
  }
  return CropStage.Seed;
}

/** True once the crop can be harvested. */
export function isMature(definition: CropDefinition, elapsedTicks: number): boolean {
  return elapsedTicks >= definition.growthTicks;
}

/**
 * Whether a crop may be planted in a season. Phase-11b — ADR-021 §2.
 *
 * Two absences both mean "no restriction", and they are different absences:
 *
 * - **An empty `seasons` list** is the crop saying it grows year-round. That
 *   reading was fixed in phase-03, when the field was added as data ahead of
 *   the system: *"An empty array is the honest v0.1 answer, not a placeholder."*
 * - **No season at all** is the WORLD having no season system — a content set
 *   that registered none. A seasonal crop in a world with no seasons is not
 *   unplantable, it is unrestricted: there is no calendar to be out of step
 *   with. Returning false here would leave such a world unable to plant
 *   anything, which is a worse answer than the one nobody asked for.
 *
 * This is a plantability rule and nothing more. A standing crop is never
 * consulted — ADR-021 §3 is emphatic that a crop planted in season and left
 * through a boundary matures unchanged, because anything else punishes the
 * absent player `VISION.md` §2.2 exists to protect.
 */
export function isInSeason(definition: CropDefinition, season: string | undefined): boolean {
  if (definition.seasons.length === 0) return true;
  if (season === undefined) return true;
  return definition.seasons.includes(season);
}

/**
 * The crop whose harvest produces an item, if any. Phase-11c.
 *
 * Seasonal pricing needs to know what season a SOLD ITEM belongs to, and an
 * item does not know. The link is the crop's `harvestYield`, so this reads it
 * rather than assuming `core:wheat` the item comes from `core:wheat` the crop
 * — true for core content by convention (`items.ts`), and not a rule any
 * third-party source agreed to. A source shipping `mod:melon` yielding
 * `mod:melon_flesh` would otherwise get no seasonal price at all, silently.
 *
 * Linear in the crop count, called per item priced. With four crops that is
 * nothing; if a content set ever makes it matter, memoize on the registry,
 * which is immutable once installed.
 */
export function cropYielding(registry: CropRegistry, item: ContentId): CropDefinition | undefined {
  return registry.all().find((crop) => crop.harvestYield.some((entry) => entry.item === item));
}
