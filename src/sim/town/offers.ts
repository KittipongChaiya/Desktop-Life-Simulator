/**
 * The notice board's offers, derived. Phase-20 — ADR-032 §1.
 *
 * Each day the board derives `BOARD_SLOTS` offers, every field a `mix32`
 * hash of `(seed, day, slot)` — never `world.rng` (ADR-022 §1, ADR-031 §2).
 * Derivation is tier-blind: the later slots are GATED by standing at the
 * command boundary (ADR-034 §2), not hidden from derivation, so every
 * player sees what the town would ask of a proven name.
 * Offers are never stored: a reload recomputes the same board, and only what
 * the player ACCEPTS becomes state (`world/contracts.ts`).
 *
 * The item pool is the crops plantable in the offer day's season, so a
 * contract is always an invitation the player can act on from a standing
 * start; the turnip's year-round eligibility guarantees the pool is never
 * empty (ADR-021 §4's load-bearing turnip, in a second role).
 */

import { mix32 } from '../../shared/hash';
import type { ContentId } from '../../shared/ids';
import { isInSeason, type CropRegistry } from '../content/crops';
import type { ItemRegistry } from '../content/items';
import { RESIDENTS } from '../content/residents';
import { dayFor, seasonFor } from '../time/game-clock';
import { demandAtSpell, DEMAND_SPELL_DAYS } from '../world/economy';
import type { Standing } from '../world/reputation';

/**
 * Slots derived per day (ADR-034 §2–§3). Four, and frozen into offer
 * identity: `offerId = day × BOARD_SLOTS + slot`, so widening the board
 * again is another re-key migration (v10 was this one's).
 */
export const BOARD_SLOTS = 4;

/**
 * The standing each slot asks of the player (ADR-034 §2). Slots 0–1 are
 * phase-20's open board; slot 2 opens to a Friend, slot 3 — the grand
 * order — to a Pillar. The gate holds at the command boundary; derivation
 * is tier-blind so every player sees what the town WOULD ask.
 */
export const SLOT_STANDING: readonly Standing[] = ['newcomer', 'newcomer', 'friend', 'pillar'];

/** The standing an offer requires, from its identity alone. */
export function requiredStandingFor(offerId: number): Standing {
  return SLOT_STANDING[offerId % BOARD_SLOTS] ?? 'newcomer';
}

/** Days from the posting day's start to the deadline (ADR-032 §2). */
export const CONTRACT_DAYS = 3;

/**
 * The declared premium band [1.25, 1.50] in 5% steps (ADR-032 §3). A
 * contract always pays more than base and never more than half again — the
 * second memorizable price rule, beside the spot channel's.
 */
export const PREMIUM_STEPS = [1.25, 1.3, 1.35, 1.4, 1.45, 1.5] as const;

/** The value band an offer aims for, in coins of base price. */
const TARGET_VALUE_MIN = 150;
const TARGET_VALUE_RANGE = 451;

/**
 * The grand band slot 3 draws from (ADR-034 §2): 400–900 coins of base
 * value — the town trusting its biggest orders to a proven name. The
 * premium stays inside [1.25, 1.50]: tiers unlock more and bigger deals,
 * never better prices.
 */
const GRAND_VALUE_MIN = 400;
const GRAND_VALUE_RANGE = 501;

/** The slot whose order draws from the grand band. */
export const GRAND_SLOT = 3;

/** No offer asks for fewer than this many units — a delivery, not an errand. */
const MIN_QUANTITY = 2;

export interface ContractOffer {
  /** `day × BOARD_SLOTS + slot` — identity for acceptance (ADR-032 §2). */
  readonly offerId: number;
  readonly day: number;
  readonly item: ContentId;
  readonly quantity: number;
  /** The frozen-on-acceptance reward: `quantity × floor(base × premium)`. */
  readonly rewardCoins: number;
  readonly deadlineTick: number;
  readonly requester: ContentId;
}

/** What offer derivation reads. `World` satisfies this structurally. */
export interface OfferSource {
  readonly seed: number;
  readonly ticksPerDay: number;
  readonly daysPerSeason: number;
  readonly seasons: readonly string[];
  readonly cropRegistry: CropRegistry;
  readonly itemRegistry: ItemRegistry;
}

/** The offer day of a tick — the board a player standing at `tick` sees. */
export function offerDayOf(source: { readonly ticksPerDay: number }, tick: number): number {
  return dayFor(tick, source.ticksPerDay);
}

/**
 * The board for one day. Pure and total: a content set with no in-season
 * yielding crop returns an empty board rather than inventing an item —
 * missing content degrades to a quiet day (ADR-022 §5's rule).
 */
export function offersForDay(source: OfferSource, day: number): readonly ContractOffer[] {
  const season = seasonFor(day, source.daysPerSeason, source.seasons);

  // Crops plantable this season whose yield is a registered item, in
  // registration order — deterministic, like every content walk.
  const eligible = source.cropRegistry.all().filter((crop) => {
    const yieldItem = crop.harvestYield[0]?.item;
    return (
      yieldItem !== undefined && isInSeason(crop, season) && source.itemRegistry.has(yieldItem)
    );
  });
  if (eligible.length === 0) return [];

  // The board leans with the town's wants (ADR-033 §4): a wanted crop enters
  // the draw three times, steady twice, quiet once. Derived from derived —
  // still a pure function of (seed, day).
  const spell = Math.floor(day / DEMAND_SPELL_DAYS);
  const pool = eligible.flatMap((crop) => {
    const yieldItem = crop.harvestYield[0]?.item;
    const demand = yieldItem === undefined ? 1 : demandAtSpell(source, yieldItem, spell);
    const weight = demand >= 1.05 ? 3 : demand >= 0.95 ? 2 : 1;
    return Array.from({ length: weight }, () => crop);
  });

  const offers: ContractOffer[] = [];
  for (let slot = 0; slot < BOARD_SLOTS; slot += 1) {
    const h = (k: number): number => mix32(mix32(mix32(source.seed, day), slot + 1), k) >>> 0;

    const crop = pool[h(0) % pool.length];
    const yieldItem = crop?.harvestYield[0]?.item;
    if (crop === undefined || yieldItem === undefined) continue;
    const definition = source.itemRegistry.get(yieldItem);
    if (!definition.ok) continue;

    const basePrice = definition.value.basePrice;
    const targetValue =
      slot === GRAND_SLOT
        ? GRAND_VALUE_MIN + (h(1) % GRAND_VALUE_RANGE)
        : TARGET_VALUE_MIN + (h(1) % TARGET_VALUE_RANGE);
    const quantity = Math.max(MIN_QUANTITY, Math.round(targetValue / basePrice));
    const premium = PREMIUM_STEPS[h(2) % PREMIUM_STEPS.length] ?? PREMIUM_STEPS[0];
    const requester = RESIDENTS[h(3) % RESIDENTS.length]?.id;
    if (requester === undefined) continue;

    offers.push({
      offerId: day * BOARD_SLOTS + slot,
      day,
      item: yieldItem,
      quantity,
      // Per-unit flooring, matching the spot path exactly (ADR-032 §3).
      rewardCoins: quantity * Math.floor(basePrice * premium),
      deadlineTick: (day + CONTRACT_DAYS) * source.ticksPerDay,
      requester,
    });
  }
  return offers;
}

/** One day's offer by id, or undefined — the acceptance validator's lookup. */
export function offerById(source: OfferSource, offerId: number): ContractOffer | undefined {
  const day = Math.floor(offerId / BOARD_SLOTS);
  return offersForDay(source, day).find((offer) => offer.offerId === offerId);
}
