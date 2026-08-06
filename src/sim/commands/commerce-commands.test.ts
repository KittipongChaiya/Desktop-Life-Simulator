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
import { toIndexUnchecked } from '../../shared/geometry';
import { CORE_STORAGE_SHED } from '../content/buildings';
import { CORE_TURNIP, CORE_WHEAT } from '../content/crops';
import { CORE_TURNIP_SEED, CORE_WHEAT_SEED, DEFAULT_STACK_SIZE } from '../content/items';
import { projectInventory } from '../snapshot/inventory-slice';
import { stepSimulation } from '../tick';
import { addItems, containerCount, type Container } from '../world/container';
import { multiplierOf } from '../world/economy';
import { addCoins } from '../world/wallet';
import { createWorld, type World } from '../world/world';

import { CommandSource } from './types';

/** Places a storage shed and returns its container — where worker deposits go. */
function shedContainer(world: World): Container {
  addCoins(world.wallet, 900);
  world.commands.dispatch(
    { type: 'placeBuilding', tile: toIndexUnchecked(32, 32), buildingId: CORE_STORAGE_SHED },
    { source: CommandSource.Player },
  );
  stepSimulation(world);
  const container = world.buildingStorage.get([...world.buildingStorage.keys()][0]!);
  if (container === undefined) throw new Error('the shed was not placed');
  return container;
}

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

  /**
   * Selling what the panel actually shows. Phase-07.9.
   *
   * THE BUG THESE COVER. `projectInventory` aggregates the player inventory AND
   * every storage building into the one list the inventory panel renders — that
   * is deliberate, it is how a shed's "+50 slots" and a worker's deposits become
   * visible. But selling counted and removed from `world.inventory` alone. So
   * goods a WORKER harvested — which go to the nearest shed with room, never to
   * the player inventory — appeared in the panel with live prices and working
   * `Sell 1` / `All` buttons that were silently rejected as `MissingItem`.
   *
   * Reported as "nothing happens when I click sell". From a real save: 135 crops
   * harvested, 23 goods sitting in a shed, player inventory empty, 28 coins, and
   * every sell button dead. Hiring a worker and building a shed — the two things
   * the game most encourages — is what turns selling off.
   */
  it('sells goods that live only in a storage shed (07.9)', () => {
    const world = createWorld(1);
    const shed = shedContainer(world);
    addItems(shed, CORE_WHEAT, 10, DEFAULT_STACK_SIZE);
    const before = world.wallet.coins;

    const result = world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 10 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    expect(result.ok).toBe(true);
    expect(world.wallet.coins).toBe(before + 10 * 34);
    expect(containerCount(shed, CORE_WHEAT)).toBe(0);
  });

  it('draws from the player inventory first, then the sheds', () => {
    const world = createWorld(1);
    const shed = shedContainer(world);
    addItems(world.inventory, CORE_WHEAT, 4, DEFAULT_STACK_SIZE);
    addItems(shed, CORE_WHEAT, 10, DEFAULT_STACK_SIZE);

    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 6 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    // The carried four go first, then two out of the shed — so a player who
    // sells a little does not have their shed raided while holding the goods.
    expect(containerCount(world.inventory, CORE_WHEAT)).toBe(0);
    expect(containerCount(shed, CORE_WHEAT)).toBe(8);
  });

  it('prices a split sale as ONE batch at the pre-sale multiplier', () => {
    const world = createWorld(1);
    const shed = shedContainer(world);
    addItems(world.inventory, CORE_WHEAT, 50, DEFAULT_STACK_SIZE);
    addItems(shed, CORE_WHEAT, 50, DEFAULT_STACK_SIZE);
    const before = world.wallet.coins;

    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 100 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    // All 100 at multiplier 1.0 — splitting across containers must not become
    // two batches at two prices (interpretation 1).
    expect(world.wallet.coins).toBe(before + 100 * 34);
    expect(multiplierOf(world.economy, CORE_WHEAT)).toBe(0.8);
  });

  it('rejects more than the COMBINED holdings and mutates nothing', () => {
    const world = createWorld(1);
    const shed = shedContainer(world);
    addItems(world.inventory, CORE_WHEAT, 3, DEFAULT_STACK_SIZE);
    addItems(shed, CORE_WHEAT, 4, DEFAULT_STACK_SIZE);
    const before = world.wallet.coins;

    const result = world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 8 },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.MissingItem);
    stepSimulation(world);

    expect(world.wallet.coins).toBe(before);
    expect(containerCount(world.inventory, CORE_WHEAT)).toBe(3);
    expect(containerCount(shed, CORE_WHEAT)).toBe(4);
  });

  it('sells the exact quantity the inventory panel offers', () => {
    // The panel's `All` button submits the AGGREGATED quantity, so the command
    // has to accept the same number the projection published. This is the two
    // halves agreeing, stated as a test.
    const world = createWorld(1);
    const shed = shedContainer(world);
    addItems(world.inventory, CORE_WHEAT, 7, DEFAULT_STACK_SIZE);
    addItems(shed, CORE_WHEAT, 11, DEFAULT_STACK_SIZE);

    const offered = projectInventory(world).stacks.find((s) => s.item === CORE_WHEAT)?.quantity;
    expect(offered).toBe(18);

    const result = world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: offered ?? 0 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    expect(result.ok).toBe(true);
    expect(projectInventory(world).stacks).toEqual([]);
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
