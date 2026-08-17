/**
 * The economy system. Phase-06, GAME_DESIGN.md §5.1, §6.2, ADR-013.
 *
 * Runs in the `economy` phase, after workers act and before events flush
 * (ADR-007 §4 — order is data, declared in `systems/index.ts`) — so a deposit
 * made this tick is swept this same tick and views observe settled prices.
 *
 * Two duties:
 *
 * 1. THE MARKET STALL SWEEP (every tick, 06c): everything in a stall's
 *    container sells at `floor(0.9 × salePrice)` — the deliberate 10% tax
 *    (§5.1); do not "optimize" it away — with the same multiplier decay as a
 *    manual sale, published as `itemSold {automatic: true}`.
 *
 * 2. PRICE RECOVERY (every 20 ticks): each depressed multiplier climbs 0.005
 *    toward 1.00. The boundary is `tick % 20 === 0` — derived from the tick
 *    counter, never a private timer — so phase-07's offline catchUp can
 *    reproduce any absence exactly from elapsed ticks (ADR-009's pattern).
 *    Tick 0 is excluded: a world begins there with nothing sold yet.
 */

import { CORE_MARKET_STALL } from '../content/buildings';
import { removeItems } from '../world/container';
import {
  demandMultiplier,
  seasonalMultiplier,
  multiplierOf,
  RECOVERY_PERIOD_TICKS,
  recordSale,
  recoverAll,
  salePrice,
} from '../world/economy';
import { addCoins } from '../world/wallet';
import type { World } from '../world/world';

/** The stall keeps 90% of the market price — the attentive edge (§5.1). */
export const STALL_SALE_FRACTION = 0.9;

/**
 * Sells everything deposited in market stalls at 90% of the current price.
 *
 * Iterates a snapshot of each stack list: selling mutates the container.
 * Each stack is one sale event — priced at ITS pre-sale multiplier, then the
 * decay applies (the same batch rule as `sellItems`, interpretation 1).
 */
function sweepStalls(world: World): void {
  for (const building of world.buildings.values()) {
    if (building.buildingId !== CORE_MARKET_STALL) continue;
    const container = world.buildingStorage.get(building.id);
    if (container === undefined || container.stacks.length === 0) continue;

    for (const stack of [...container.stacks]) {
      const definition = world.itemRegistry.get(stack.item);
      if (!definition.ok) continue; // unknown goods stay put — never destroyed

      const unit = Math.floor(
        STALL_SALE_FRACTION *
          salePrice(
            definition.value.basePrice,
            multiplierOf(world.economy, stack.item),
            seasonalMultiplier(world, stack.item),
            demandMultiplier(world, stack.item),
          ),
      );
      removeItems(container, stack.item, stack.quantity);
      addCoins(world.wallet, unit * stack.quantity);
      recordSale(world.economy, stack.item, stack.quantity);
      world.events.publish('itemSold', {
        item: stack.item,
        quantity: stack.quantity,
        coins: unit * stack.quantity,
        automatic: true,
      });
    }
  }
}

export function economySystem(world: World): void {
  sweepStalls(world);
  if (world.tick === 0 || world.tick % RECOVERY_PERIOD_TICKS !== 0) return;
  recoverAll(world.economy);
}
