/**
 * Commerce commands: selling goods, buying seeds. Phase-06b, GAME_DESIGN.md
 * §3.1, §6.2, §6.4, ADR-013.
 *
 * Selling is the market boundary where goods leave and coins enter (a boundary
 * event, ADR-013); buying seeds is the recurring sink that funds the loop's
 * entry edge. Both are all-or-nothing commands: a rejection mutates nothing.
 *
 * Batch pricing (phase doc, resolved interpretation 1): selling n units
 * credits `n × floor(basePrice × multiplier)` at the PRE-SALE multiplier, then
 * applies the decay once.
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../shared/errors';
import { CORE_TURNIP, CORE_WHEAT } from '../content/crops';
import { CORE_TURNIP_SEED, CORE_WHEAT_SEED, DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation } from '../tick';
import { addItems, containerCount } from '../world/container';
import { multiplierOf } from '../world/economy';
import { createWorld } from '../world/world';

import { CommandSource } from './types';

describe('seed linkage (§3.1)', () => {
  it('every crop names its seed item and fixed seed cost', () => {
    const world = createWorld(1);
    const expected = [
      { crop: 'core:turnip', seed: 'core:turnip_seed', cost: 5 },
      { crop: 'core:wheat', seed: 'core:wheat_seed', cost: 12 },
      { crop: 'core:carrot', seed: 'core:carrot_seed', cost: 25 },
      { crop: 'core:pumpkin', seed: 'core:pumpkin_seed', cost: 60 },
    ];
    for (const row of expected) {
      const definition = world.cropRegistry.get(row.crop as never);
      expect(definition.ok).toBe(true);
      if (definition.ok) {
        expect(definition.value.seedItem).toBe(row.seed);
        expect(definition.value.seedCost).toBe(row.cost);
      }
    }
  });

  it('every seed is a registered item priced at its purchase cost', () => {
    const world = createWorld(1);
    const seed = world.itemRegistry.get(CORE_TURNIP_SEED);
    expect(seed.ok).toBe(true);
    if (seed.ok) {
      expect(seed.value.basePrice).toBe(5);
      expect(seed.value.stackSize).toBe(DEFAULT_STACK_SIZE);
    }
  });
});

describe('buySeeds', () => {
  it('spends coins and adds seeds at the fixed §3.1 price', () => {
    const world = createWorld(1); // opens with 100 coins
    const result = world.commands.dispatch(
      { type: 'buySeeds', cropId: 'core:turnip', quantity: 10 },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(true);
    stepSimulation(world);

    expect(world.wallet.coins).toBe(50); // 100 - 10 × 5
    expect(containerCount(world.inventory, CORE_TURNIP_SEED)).toBe(10);
  });

  it('rejects insufficient funds and mutates nothing (crit 7)', () => {
    const world = createWorld(1);
    const result = world.commands.dispatch(
      { type: 'buySeeds', cropId: 'core:pumpkin', quantity: 2 }, // 120 > 100
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InsufficientFunds);
    stepSimulation(world);

    expect(world.wallet.coins).toBe(100);
    expect(containerCount(world.inventory, CORE_TURNIP_SEED)).toBe(0);
  });

  it('rejects a purchase the inventory cannot hold entirely', () => {
    const world = createWorld(1);
    // Fill every slot so no seed fits.
    for (let slot = 0; slot < world.inventory.capacity; slot += 1) {
      addItems(world.inventory, CORE_WHEAT, DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
    }
    const result = world.commands.dispatch(
      { type: 'buySeeds', cropId: 'core:turnip', quantity: 1 },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InventoryFull);
    expect(world.wallet.coins).toBe(100);
  });

  it('rejects a zero, negative, or fractional quantity', () => {
    const world = createWorld(1);
    for (const quantity of [0, -3, 1.5]) {
      const result = world.commands.dispatch(
        { type: 'buySeeds', cropId: 'core:turnip', quantity },
        { source: CommandSource.Player },
      );
      expect(result.ok).toBe(false);
    }
    expect(world.wallet.coins).toBe(100);
  });

  it('rejects an unknown crop', () => {
    const world = createWorld(1);
    const result = world.commands.dispatch(
      { type: 'buySeeds', cropId: 'core:kale', quantity: 1 },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
  });
});

describe('sellItems', () => {
  it('credits coins at the current dynamic price and removes the goods (crit 1)', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT, 10, DEFAULT_STACK_SIZE);

    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 10 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    expect(world.wallet.coins).toBe(100 + 10 * 34); // multiplier 1.0, base 34
    expect(containerCount(world.inventory, CORE_WHEAT)).toBe(0);
  });

  it('drops the multiplier by exactly n × 0.002 (crit 2)', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT, 50, DEFAULT_STACK_SIZE);

    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 50 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    expect(multiplierOf(world.economy, CORE_WHEAT)).toBe(0.9);
    expect(multiplierOf(world.economy, CORE_TURNIP)).toBe(1.0); // others untouched
  });

  it('prices the whole batch at the pre-sale multiplier (interpretation 1)', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT, 200, DEFAULT_STACK_SIZE);

    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 100 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);
    const afterFirst = world.wallet.coins;
    expect(afterFirst).toBe(100 + 100 * 34); // all 100 at multiplier 1.0

    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 100 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);
    // Second batch prices at the now-depressed 0.80: floor(34 × 0.8) = 27.
    expect(world.wallet.coins).toBe(afterFirst + 100 * 27);
    expect(multiplierOf(world.economy, CORE_WHEAT)).toBe(0.6);
  });

  it('rejects selling more than held and mutates nothing', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT, 5, DEFAULT_STACK_SIZE);

    const result = world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 6 },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.MissingItem);
    stepSimulation(world);

    expect(world.wallet.coins).toBe(100);
    expect(containerCount(world.inventory, CORE_WHEAT)).toBe(5);
    expect(multiplierOf(world.economy, CORE_WHEAT)).toBe(1.0);
  });

  it('rejects a zero, negative, or fractional quantity', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT, 5, DEFAULT_STACK_SIZE);
    for (const quantity of [0, -1, 0.5]) {
      const result = world.commands.dispatch(
        { type: 'sellItems', itemId: 'core:wheat', quantity },
        { source: CommandSource.Player },
      );
      expect(result.ok).toBe(false);
    }
  });

  it('publishes itemSold with the goods, quantity, and coins', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT, 10, DEFAULT_STACK_SIZE);
    const seen: { item: string; quantity: number; coins: number; automatic: boolean }[] = [];
    world.events.subscribe('itemSold', (event) => seen.push({ ...event }));

    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 10 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    expect(seen).toEqual([{ item: 'core:wheat', quantity: 10, coins: 340, automatic: false }]);
  });

  it('seeds sell back through the ordinary pipeline, never above cost (interpretation 3)', () => {
    const world = createWorld(1);
    world.commands.dispatch(
      { type: 'buySeeds', cropId: 'core:wheat', quantity: 5 }, // 60 coins
      { source: CommandSource.Player },
    );
    stepSimulation(world);
    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat_seed', quantity: 5 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    expect(containerCount(world.inventory, CORE_WHEAT_SEED)).toBe(0);
    // Bought at 12, sold at floor(12 × 1.0) = 12 — a wash, never a profit.
    expect(world.wallet.coins).toBe(100);
    expect(multiplierOf(world.economy, CORE_WHEAT_SEED)).toBe(0.99);
  });
});
