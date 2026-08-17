/**
 * The quest step. Phase-22 — ADR-034 §4.
 *
 * Compares the contract counters to each chain's declared thresholds, pays
 * any newly crossed steps through the wallet, advances the paid watermark,
 * and publishes the fact. The watermark is the whole idempotency mechanism:
 * a step below it never pays again, so a reward is exactly-once across
 * ticks, saves, and reloads.
 *
 * Runs after the contract sweep so a delivery and its consequences settle on
 * one tick. Several steps can cross at once by design — a migrated save is
 * paid what its recorded history earned on the first live tick (ADR-034 §4).
 * Offline needs no model: nothing fulfills while away, so no step can cross
 * while away.
 */

import { QUEST_CHAINS } from '../content/quests';
import { counterValue, stepsPaid } from '../world/quests';
import { addCoins } from '../world/wallet';
import type { World } from '../world/world';

export function questSystem(world: World): void {
  for (const chain of QUEST_CHAINS) {
    const value = counterValue(world.contractStats, chain.counter);
    let paid = stepsPaid(world.quests, chain.id);

    while (paid < chain.steps.length) {
      const step = chain.steps[paid];
      if (step === undefined || value < step.threshold) break;

      const credit = addCoins(world.wallet, step.rewardCoins);
      if (!credit.ok) break; // unreachable — rewards are declared non-negative integers

      paid += 1;
      world.quests.set(chain.id, paid);
      world.events.publish('questCompleted', {
        chain: chain.id,
        step: paid,
        rewardCoins: step.rewardCoins,
      });
    }
  }
}
