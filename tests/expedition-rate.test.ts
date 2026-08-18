/**
 * The rate rule. Phase-28 — ADR-038 §5.
 *
 * This is the phase's economic guard, and the reason it exists is stated in the
 * ADR: **the real cost of an expedition is the worker.** A hand on a trip is a
 * hand not harvesting, not hauling and not gathering for its whole duration.
 * Supplies are a sink and they are not the lever.
 *
 * > An expedition's expected value per tick of worker time must sit within the
 * > band of what the same worker earns otherwise — above the low end, so the
 * > trip is worth taking, and below the top end, so it never becomes the
 * > correct thing to do with every worker.
 *
 * A mechanic that pays better per worker-tick than everything else makes
 * everything else pointless; one that pays worse is content nobody uses.
 *
 * ## Two things about the units, both deliberate
 *
 * **The anchor is GATHERING, not farming.** Gathering is the directly
 * comparable mechanic — both send a worker away to fetch goods — and it is the
 * one this version shipped last phase. Farming was measured as the anchor
 * first and rejected on the number: a 24-tile wheat farm with three hands
 * earns about **0.0033 coins per worker-tick** over 200,000 ticks, which is
 * twenty times below a forager's rate at base price, because the farm's coin
 * figure is dominated by the sale multiplier decaying under its own volume
 * (ADR-013). Anchoring on a number that moves with how much you sell would
 * make this test a measure of the market, not of the mechanic.
 *
 * **Value is BASE price, never the sale price.** Every good an expedition
 * brings back leaves through the ordinary channel, at the ordinary decaying
 * multiplier, against the ordinary demand — so the decay applies equally to
 * both sides of the comparison and cancels. Including it would only add noise.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { createInstalledRegistries } from '../src/sim/content/installed';
import type { ExpeditionDestination } from '../src/sim/content/expeditions';
import type { ItemStack } from '../src/sim/world/container';
import { WORKER_CARRY_CAPACITY } from '../src/sim/world/worker';

const registries = createInstalledRegistries();

/**
 * Ticks a forager spends walking between nodes in the wilds.
 *
 * The wilds are 13.5% node density, so nodes sit about three tiles apart, and a
 * worker crosses a tile in ten ticks (`GAME_DESIGN.md` §4.3). Stated as a
 * constant because it is an ESTIMATE inside a balance test — the band is wide
 * enough that a tile either way cannot flip a verdict, and pretending to
 * precision here would be false confidence.
 */
const WILDS_STEP_TICKS = 30;

/** Base-price value of a stack list. The stable unit — see the header. */
function value(stacks: readonly ItemStack[]): number {
  return stacks.reduce((total, stack) => {
    const item = registries.items.get(stack.item);
    expect(item.ok, `${stack.item} is not a registered item`).toBe(true);
    return total + (item.ok ? item.value.basePrice : 0) * stack.quantity;
  }, 0);
}

/**
 * Base-price coins a forager brings home per tick of their time.
 *
 * Averaged over the node kinds by DENSITY, because that is the mix a worker
 * actually meets walking a circuit — averaging them flat would let one rare,
 * rich kind set the anchor for a wilderness that is mostly trees.
 */
function foragingRate(): number {
  const nodes = registries.resourceNodes.all();
  const totalDensity = nodes.reduce((sum, node) => sum + node.density, 0);
  expect(totalDensity, 'the wilds hold nothing to compare against').toBeGreaterThan(0);

  const coinsPerTick = nodes.reduce((sum, node) => {
    const share = node.density / totalDensity;
    return sum + share * (value(node.yields) / (node.gatherTicks + WILDS_STEP_TICKS));
  }, 0);
  return coinsPerTick;
}

/** Base-price coins a destination returns per tick the worker is away. */
function expeditionRate(destination: ExpeditionDestination): number {
  // NET of supplies: what the trip is worth is what comes back minus what it
  // cost to send. A destination that paid for itself in supplies alone would
  // read as profitable here and be worthless in the game.
  const net = value(destination.yields) - value(destination.supplies);
  return net / destination.travelTicks;
}

/** The band ADR-038 §5 declares, around the forager's rate. */
const FLOOR = 0.5;
const CEILING = 2;

describe('every shipped destination is worth going to', () => {
  it('the wilds give a rate to compare against at all', () => {
    expect(foragingRate()).toBeGreaterThan(0);
  });

  it.each(registries.expeditions.all().map((d) => [d.displayName, d] as const))(
    '%s pays enough to be worth a worker',
    (_name, destination) => {
      // Below this, nobody sends anyone: the same hand gathering in the wilds
      // brings home more, and the trip is content that exists to be ignored.
      expect(expeditionRate(destination)).toBeGreaterThan(foragingRate() * FLOOR);
    },
  );

  it.each(registries.expeditions.all().map((d) => [d.displayName, d] as const))(
    '%s never pays so well that the farm stops mattering',
    (_name, destination) => {
      // THE INFINITE-MONEY GUARD. Above this, the correct play is to send every
      // worker away for ever and let the farm rot — which is not a farming game.
      expect(expeditionRate(destination)).toBeLessThan(foragingRate() * CEILING);
    },
  );

  it.each(registries.expeditions.all().map((d) => [d.displayName, d] as const))(
    '%s returns more than it costs to outfit',
    (_name, destination) => {
      // A trip that consumed more value than it produced would be a coin sink
      // wearing an adventure's clothes.
      expect(value(destination.yields)).toBeGreaterThan(value(destination.supplies));
    },
  );

  it.each(registries.expeditions.all().map((d) => [d.displayName, d] as const))(
    '%s fits in one pair of hands',
    (_name, destination) => {
      // The structural cap on an expedition's value, and the reason the hauls
      // are scarce goods: a worker carries twenty items, so a destination
      // paying in wood would have to be two minutes away to earn its rate.
      const carried = destination.yields.reduce((sum, stack) => sum + stack.quantity, 0);
      expect(carried).toBeLessThanOrEqual(WORKER_CARRY_CAPACITY);
    },
  );
});

describe('the map opens as the town comes to trust you', () => {
  it('offers something from the very first day', () => {
    // A map whose every destination is locked is a panel that explains itself
    // and does nothing, which is worse than no panel.
    expect(registries.expeditions.all().some((d) => d.requires === 'newcomer')).toBe(true);
  });

  it('reaches every standing tier', () => {
    // Standing gets a second consumer beyond the notice board (ADR-038 §6),
    // which is the whole reason to gate on it rather than invent a new axis.
    expect(new Set(registries.expeditions.all().map((d) => d.requires))).toEqual(
      new Set(['newcomer', 'friend', 'pillar']),
    );
  });

  it('asks more of a further trip', () => {
    // Distance and trust should move together, or the map reads as arbitrary.
    const byTier = { newcomer: 0, friend: 1, pillar: 2 } as const;
    const ordered = [...registries.expeditions.all()].sort(
      (a, b) => byTier[a.requires] - byTier[b.requires],
    );

    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]!.travelTicks).toBeGreaterThan(ordered[i - 1]!.travelTicks);
    }
  });
});
