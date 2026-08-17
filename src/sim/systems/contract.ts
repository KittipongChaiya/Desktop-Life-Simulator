/**
 * Contract expiry. Phase-20 — ADR-032 §4.
 *
 * Retires any contract whose deadline has passed: removed from the store,
 * counted in `contractStats.expired`, and nothing else — no fee, no penalty,
 * no message chasing the player. A missed contract is a missed premium,
 * which is `VISION.md` §2.2's only permitted pressure.
 *
 * Because this is a comparison against the tick, offline needs no model: a
 * save loaded days later sweeps its overdue contracts on the first live
 * tick. The scan is over at most `MAX_ACTIVE_CONTRACTS` records, so running
 * every tick costs less than guarding it with a day-boundary check would.
 */

import type { World } from '../world/world';

export function contractSystem(world: World): void {
  for (const [offerId, contract] of world.contracts) {
    if (world.tick < contract.deadlineTick) continue;
    world.contracts.delete(offerId);
    world.contractStats.expired += 1;
  }
}
