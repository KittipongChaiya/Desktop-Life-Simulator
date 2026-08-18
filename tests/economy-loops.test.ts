/**
 * Can the economy be farmed for free money? Phase-30 — the v0.4 RC.
 *
 * v0.4 added three new ways for value to enter the world — a factory that turns
 * goods into more valuable goods, a wilderness that produces goods from
 * nothing, and expeditions that trade supplies for a haul — and each of them is
 * a place where a closed loop could pay more than it costs. A loop like that is
 * not a balance problem; it is the end of the game, because the correct play
 * becomes to run it and nothing else.
 *
 * ## What "no infinite money" actually means here
 *
 * Not "nothing profits" — the whole game is meant to profit. The claim is
 * narrower and checkable:
 *
 * > **Every profitable loop is gated by TIME, and every loop gated only by
 * > COINS is at best break-even.**
 *
 * A player with a million coins and no workers must not be able to click
 * themselves richer. A player with workers is supposed to get richer; that is
 * what workers are for.
 *
 * ## The four gates below
 *
 * 1. Buying and selling the same thing never profits — the only loop the
 *    player can run at will, with no worker and no clock.
 * 2. The recipe graph has no cycle, so no chain turns X into more X.
 * 3. Selling drives its own price down, so any repeated loop decays.
 * 4. Every declared source is bounded by something other than coins.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { buySeeds, sellItems } from '../src/sim/commands/commerce-commands';
import { createInstalledRegistries } from '../src/sim/content/installed';
import { multiplierOf, salePrice } from '../src/sim/world/economy';
import { addItems, containerCount } from '../src/sim/world/container';
import { createWorld } from '../src/sim/world/world';

const registries = createInstalledRegistries();

describe('the only loop a player can run with no workers and no clock', () => {
  it('buying a seed and selling it back never profits', () => {
    // THE ONE THAT MATTERS. Buying is instant, unlimited, and needs nobody —
    // so if a seed ever sold for more than it cost, the game would be over.
    // The prices are set so a round trip is a LOSS after the sale decay, and
    // exactly break-even before it (`basePrice = seed cost`, phase-06b).
    for (const crop of registries.crops.all()) {
      const world = createWorld(7);
      world.wallet.coins = 100_000;
      const before = world.wallet.coins;

      const bought = buySeeds(world, crop.id, 10);
      expect(bought.ok, `${crop.id} seeds must be buyable`).toBe(true);

      const seedItem = registries.items.all().find((item) => item.id === `${String(crop.id)}_seed`);
      expect(seedItem, `${crop.id} must have a seed item`).toBeDefined();
      if (seedItem === undefined) continue;

      expect(sellItems(world, seedItem.id, 10).ok).toBe(true);

      expect(
        world.wallet.coins,
        `${String(crop.id)}: a seed round trip must never leave the player richer`,
      ).toBeLessThanOrEqual(before);
    }
  });

  it('holds however many times it is repeated', () => {
    // A single round trip breaking even is not enough: the multiplier recovers
    // between sales, so a patient player could otherwise grind the boundary.
    const world = createWorld(7);
    world.wallet.coins = 1_000_000;
    const crop = registries.crops.all()[0]!;
    const seedItem = registries.items.all().find((i) => i.id === `${String(crop.id)}_seed`)!;
    const before = world.wallet.coins;

    for (let i = 0; i < 50; i += 1) {
      expect(buySeeds(world, crop.id, 5).ok).toBe(true);
      expect(sellItems(world, seedItem.id, 5).ok).toBe(true);
    }

    expect(world.wallet.coins).toBeLessThanOrEqual(before);
  });
});

describe('no chain turns a thing into more of itself', () => {
  it('the recipe graph has no cycle', () => {
    // A cycle — even a long one — would be a machine that produces its own
    // input, so a player could run it forever on one delivery. This walks the
    // item graph rather than the recipe list, because a cycle can span
    // several recipes and no single one would look wrong.
    const edges = new Map<string, Set<string>>();
    for (const recipe of registries.recipes.all()) {
      for (const input of recipe.inputs) {
        const from = String(input.item);
        const to = edges.get(from) ?? new Set<string>();
        for (const output of recipe.outputs) to.add(String(output.item));
        edges.set(from, to);
      }
    }

    const state = new Map<string, 'visiting' | 'done'>();
    const cycleFrom = (node: string, trail: readonly string[]): string[] | null => {
      if (state.get(node) === 'visiting') return [...trail, node];
      if (state.get(node) === 'done') return null;
      state.set(node, 'visiting');
      for (const next of edges.get(node) ?? []) {
        const found = cycleFrom(next, [...trail, node]);
        if (found !== null) return found;
      }
      state.set(node, 'done');
      return null;
    };

    for (const node of edges.keys()) {
      expect(cycleFrom(node, []), 'a recipe cycle is a machine that feeds itself').toBeNull();
    }
  });

  it('every recipe consumes something', () => {
    // A recipe with no inputs would produce value out of nothing, forever, for
    // the price of one building. `isRunnableRecipe` refuses it at registration;
    // this is the shipped content actually obeying that.
    for (const recipe of registries.recipes.all()) {
      expect(recipe.inputs.length, `${String(recipe.id)} produces from nothing`).toBeGreaterThan(0);
    }
  });
});

describe('selling the same thing repeatedly pays less each time', () => {
  it('the multiplier falls as units go out', () => {
    // The brake under every loop in the game (ADR-013). Whatever a player
    // finds to sell in volume — crops, bread, ore, an expedition haul — the
    // price falls as they sell it, so no loop stays as profitable as its
    // first turn.
    const world = createWorld(7);
    const item = registries.items.all().find((i) => i.basePrice > 0)!;
    addItems(world.inventory, item.id, 99, 99);

    const first = salePrice(item.basePrice, multiplierOf(world.economy, item.id));
    expect(sellItems(world, item.id, 40).ok).toBe(true);
    const later = salePrice(item.basePrice, multiplierOf(world.economy, item.id));

    expect(later).toBeLessThan(first);
  });

  it('a repeated sell-and-refill loop never earns MORE, and ends up earning less', () => {
    // The same claim end to end: refill the stock for free (as if a farm had
    // produced it) and sell again.
    //
    // NON-INCREASING, not strictly decreasing. The first version asserted a
    // strict fall every round and failed at round four — because the
    // multiplier has a FLOOR (ADR-013), so a player selling in volume reaches
    // a worst price and stays there rather than falling to zero. That is the
    // design: the brake is a floor, not a cliff, so a glut is worth less
    // rather than worthless.
    //
    // What matters for this file's claim is that no round ever pays MORE than
    // an earlier one, and that the decay is real rather than nominal.
    const world = createWorld(7);
    const item = registries.items.all().find((i) => i.basePrice > 0)!;

    const earned: number[] = [];
    for (let round = 0; round < 6; round += 1) {
      addItems(world.inventory, item.id, 20, 99);
      const before = world.wallet.coins;
      expect(sellItems(world, item.id, 20).ok).toBe(true);
      earned.push(world.wallet.coins - before);
    }

    for (let i = 1; i < earned.length; i += 1) {
      expect(
        earned[i]!,
        `round ${String(i)} paid more than round ${String(i - 1)}`,
      ).toBeLessThanOrEqual(earned[i - 1]!);
    }
    expect(earned.at(-1)!, 'the decay never bit at all').toBeLessThan(earned[0]!);
  });
});

describe('every source is bounded by something other than coins', () => {
  it('a wild node cannot be re-worked without waiting', () => {
    // Time, not money: `regrowTicks` is what stops a crew stripping the wilds.
    for (const node of registries.resourceNodes.all()) {
      expect(node.regrowTicks, `${String(node.id)} regrows instantly`).toBeGreaterThan(0);
      expect(node.gatherTicks, `${String(node.id)} is worked instantly`).toBeGreaterThan(0);
    }
  });

  it('an expedition cannot return without a worker being gone for it', () => {
    // Time again, and a WORKER — the scarce thing. `travelTicks > 0` is what
    // stops a player with coins buying supplies and cycling a trip on the spot.
    for (const destination of registries.expeditions.all()) {
      expect(
        destination.travelTicks,
        `${String(destination.id)} returns instantly`,
      ).toBeGreaterThan(0);
    }
  });

  it('a factory cannot craft without time passing', () => {
    for (const recipe of registries.recipes.all()) {
      expect(recipe.craftTicks, `${String(recipe.id)} crafts instantly`).toBeGreaterThan(0);
    }
  });

  it('a crop cannot be harvested the tick it is planted', () => {
    for (const crop of registries.crops.all()) {
      expect(crop.growthTicks, `${String(crop.id)} grows instantly`).toBeGreaterThan(0);
    }
  });
});

describe('the coins-only player', () => {
  it('cannot get richer with no workers, no buildings, and no land', () => {
    // The whole claim in one run: a player who does nothing but trade with the
    // shop, as fast as they like, ends up poorer. Everything else in the
    // economy costs time, a worker, or both.
    const world = createWorld(7);
    world.wallet.coins = 500_000;
    const start = world.wallet.coins;

    for (let i = 0; i < 200; i += 1) {
      const crop = registries.crops.all()[i % registries.crops.size]!;
      const seedItem = registries.items.all().find((s) => s.id === `${String(crop.id)}_seed`)!;
      if (!buySeeds(world, crop.id, 3).ok) break;
      if (containerCount(world.inventory, seedItem.id) > 0) {
        sellItems(world, seedItem.id, containerCount(world.inventory, seedItem.id));
      }
    }

    expect(world.wallet.coins).toBeLessThan(start);
  });
});
