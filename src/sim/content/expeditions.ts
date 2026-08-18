/**
 * Expedition destinations. Phase-28 — ADR-038 §1, §4, ADR-004 §5.
 *
 * A destination is a place the farm can REACH but nobody can walk to: a name,
 * a distance expressed as ticks, what it costs to outfit, what it brings back,
 * and the standing it asks for. Registered once at startup, never mutated, and
 * — like every other content kind — never saved.
 *
 * ## The map is a list, not more grid (§1)
 *
 * The obvious reading of "world map" is more tiles, and the grid is already
 * 112×64 after two relayout migrations. A third would be the most expensive
 * possible way to express *far away*, which `travelTicks` expresses in one
 * integer. The cost is stated rather than hidden: **you never see the place.**
 *
 * ## The haul is derived from the departure (§4)
 *
 * `haulFor` scales the declared yields by a factor hashed from the seed, the
 * worker, and the tick it left — so the answer at tick T is the same whether
 * the game ran every tick of the trip or was closed for all of it. That is what
 * lets an eight-hour absence resolve with no catch-up model: "has it returned"
 * is a comparison, and "what did it bring" does not depend on how many ticks
 * were simulated in between.
 *
 * It consumes **no RNG draw**, for the third time in this project and the same
 * reason (ADR-037 §3, ADR-022 §1): `world.rng` is a stream whose position is
 * part of the save, so a draw here would make an expedition's result depend on
 * how many other things had happened first.
 */

import { mix32 } from '../../shared/hash';
import { asContentId, type ContentId, type WorkerId } from '../../shared/ids';
import type { ItemStack } from '../world/container';
import type { Standing } from '../world/reputation';
import { WORKER_CARRY_CAPACITY } from '../world/worker';

import { createContentRegistry, type ContentRegistry } from './registry';

/**
 * The band the derived haul falls in, around the declared yields.
 *
 * **It never includes zero.** A trip that returned nothing would punish a
 * decision the player made an hour ago, which `VISION.md` §2.2 forbids in as
 * many words — variance is in HOW MUCH, never in WHETHER (ADR-038 §4).
 *
 * A quarter either way is wide enough to be felt and narrow enough that the
 * UI's stated range is a promise the game keeps.
 */
export const HAUL_MIN = 0.75;
export const HAUL_MAX = 1.25;

export interface ExpeditionDestination {
  readonly id: ContentId;
  /** What a player reads. Presentation only — no rule may branch on it. */
  readonly displayName: string;
  /** Sprite key from the generated manifest (`ASSETS.md` §5). */
  readonly sprite: string;
  /** One line of flavour for the map panel. Presentation only. */
  readonly description: string;
  /** How long a worker is away. Integer (ADR-007 §7); distance IS this number. */
  readonly travelTicks: number;
  /** Consumed from farm stock at departure — a declared sink (ADR-011 §4). */
  readonly supplies: readonly ItemStack[];
  /** Brought back at return, scaled by `haulFor` — a declared source. */
  readonly yields: readonly ItemStack[];
  /** Minimum standing with the town. `newcomer` means open from the start. */
  readonly requires: Standing;
}

export const CORE_RIVER_DELTA = asContentId('core:river_delta');
export const CORE_OLD_QUARRY = asContentId('core:old_quarry');
export const CORE_HIGHLANDS = asContentId('core:highlands');

export type ExpeditionRegistry = ContentRegistry<ExpeditionDestination>;

export function createExpeditionRegistry(): ExpeditionRegistry {
  return createContentRegistry<ExpeditionDestination>('expedition');
}

/**
 * Whether a destination could ever be sent to and ever return anything.
 *
 * Refused at REGISTRATION, where the author is told — the rule
 * `isRunnableRecipe`, `isSatisfiableRole` and `isSpawnableNode` all follow. A
 * destination with no yields is a worker sent away for nothing; one with no
 * travel time returns on the tick it left, which would let a player farm the
 * haul by sending the same worker repeatedly.
 *
 * THE LAST CHECK IS THE ONE THAT KEEPS ADR-011 §7. A worker leaves with an
 * empty hold and comes back carrying the haul, so a destination whose BIGGEST
 * possible haul cannot fit would have to drop the remainder — silently
 * discarding a conserved quantity, which §7 forbids outright. Refusing it here
 * makes "the haul always fits" structural rather than a runtime hope, and the
 * bound is the top of the band, never the declared figure.
 */
export function isReachableDestination(destination: ExpeditionDestination): boolean {
  if (!Number.isInteger(destination.travelTicks) || destination.travelTicks <= 0) return false;
  if (destination.yields.length === 0) return false;
  if (
    ![...destination.yields, ...destination.supplies].every(
      (stack) => Number.isInteger(stack.quantity) && stack.quantity > 0,
    )
  ) {
    return false;
  }

  const biggest = destination.yields.reduce(
    (total, stack) => total + Math.max(1, Math.floor(stack.quantity * HAUL_MAX)),
    0,
  );
  return biggest <= WORKER_CARRY_CAPACITY;
}

/**
 * What this worker brings back from this departure.
 *
 * PURE and total: same seed, worker and departure tick, same haul, for ever.
 * Floored per item, so the result is integer quantities (ADR-007 §7) — and
 * floored to **at least one** of anything declared, because `floor(1 × 0.75)`
 * is zero and a stated yield of one that comes back as nothing is the failure
 * outcome §4 refuses.
 */
export function haulFor(
  destination: ExpeditionDestination,
  seed: number,
  worker: WorkerId,
  departedTick: number,
): readonly ItemStack[] {
  // Two integers into the mixer, the departure folded with the worker so two
  // hands leaving on the same tick do not come back with identical loads.
  const roll = mix32(seed, mix32(worker, departedTick)) / 0x1_0000_0000;
  const factor = HAUL_MIN + roll * (HAUL_MAX - HAUL_MIN);

  return destination.yields.map((stack) => ({
    item: stack.item,
    quantity: Math.max(1, Math.floor(stack.quantity * factor)),
  }));
}

/** Tick a departure returns on. */
export function returnTickOf(destination: ExpeditionDestination, departedTick: number): number {
  return departedTick + destination.travelTicks;
}
