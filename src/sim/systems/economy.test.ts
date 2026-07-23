/**
 * The economy system. Phase-06, GAME_DESIGN.md §6.2, ADR-013.
 *
 * Owns price recovery: every 20 ticks, each depressed multiplier climbs 0.005
 * toward 1.00. Recovery is aligned to the tick counter (`tick % 20`), never to
 * a private timer — that is what lets phase-07's catchUp derive offline
 * recovery from elapsed ticks alone (ADR-009's pattern).
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asContentId } from '../../shared/ids';
import { CommandSource } from '../commands/types';
import { CORE_MARKET_STALL } from '../content/buildings';
import { DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation } from '../tick';
import { addItems, containerTotal, type Container } from '../world/container';
import { multiplierOf, recordSale } from '../world/economy';
import { addCoins, STARTING_COINS } from '../world/wallet';
import { createWorld, type World } from '../world/world';

import { economySystem } from './economy';

const WHEAT = asContentId('core:wheat');
const TURNIP = asContentId('core:turnip');

describe('world wiring', () => {
  it('a new world opens with the declared starting capital (§6.4)', () => {
    const world = createWorld(42);
    expect(world.wallet.coins).toBe(STARTING_COINS);
  });

  it('a new world opens with an undepressed market', () => {
    const world = createWorld(42);
    expect(world.economy.multipliers.size).toBe(0);
    expect(world.economy.expansionsPurchased).toBe(0);
  });
});

describe('economySystem', () => {
  it('recovers depressed multipliers on the period boundary', () => {
    const world = createWorld(42);
    recordSale(world.economy, WHEAT, 100); // 0.80
    world.tick = 20;
    economySystem(world);
    expect(multiplierOf(world.economy, WHEAT)).toBe(0.805);
  });

  it('does nothing between period boundaries', () => {
    const world = createWorld(42);
    recordSale(world.economy, WHEAT, 100); // 0.80
    for (const tick of [1, 7, 19, 21, 39]) {
      world.tick = tick;
      economySystem(world);
    }
    expect(multiplierOf(world.economy, WHEAT)).toBe(0.8);
  });

  it('does not recover at tick 0 — a fresh world has nothing to recover anyway', () => {
    const world = createWorld(42);
    recordSale(world.economy, WHEAT, 100);
    world.tick = 0;
    economySystem(world);
    expect(multiplierOf(world.economy, WHEAT)).toBe(0.8);
  });

  it('the §6.2 arithmetic checkpoint: a 100-wheat dump recovers in ~40 seconds', () => {
    const world = createWorld(42);
    recordSale(world.economy, WHEAT, 100); // 0.80
    // 40 seconds = 800 ticks = 40 recovery periods (ADR-013 validation checkpoint 3).
    for (let tick = 1; tick <= 800; tick += 1) {
      world.tick = tick;
      economySystem(world);
    }
    expect(multiplierOf(world.economy, WHEAT)).toBe(1.0);
    expect(world.economy.multipliers.size).toBe(0);
  });

  it('one period short of the full recovery is still depressed', () => {
    const world = createWorld(42);
    recordSale(world.economy, WHEAT, 100); // 0.80
    for (let tick = 1; tick <= 780; tick += 1) {
      world.tick = tick;
      economySystem(world);
    }
    expect(multiplierOf(world.economy, WHEAT)).toBe(0.995);
  });

  it('is deterministic — two worlds stepped identically agree exactly', () => {
    const run = (): number => {
      const world = createWorld(7);
      recordSale(world.economy, WHEAT, 63);
      for (let tick = 1; tick <= 500; tick += 1) {
        world.tick = tick;
        economySystem(world);
      }
      return multiplierOf(world.economy, WHEAT);
    };
    expect(run()).toBe(run());
  });
});

describe('the market stall sweep (06c, §5.1)', () => {
  /** A world with a stall placed; returns its container. */
  function stallWorld(): { world: World; stall: Container } {
    const world = createWorld(1);
    addCoins(world.wallet, 1_200); // 1,300 total
    world.commands.dispatch(
      { type: 'placeBuilding', tile: toIndexUnchecked(30, 30), buildingId: CORE_MARKET_STALL },
      { source: CommandSource.Player },
    );
    stepSimulation(world); // -> 100 coins, stall standing
    const stall = world.buildingStorage.get([...world.buildingStorage.keys()][0]!);
    if (stall === undefined) throw new Error('setup failed');
    return { world, stall };
  }

  it('auto-sells deposited crops at exactly 90% of the current price (crit 12)', () => {
    const { world, stall } = stallWorld();
    addItems(stall, WHEAT, 10, DEFAULT_STACK_SIZE);

    world.tick += 1;
    economySystem(world);

    // floor(0.9 × floor(34 × 1.0)) = 30 per unit — not 34: the 10% tax is
    // deliberate (§5.1). Do not "optimize" it away.
    expect(world.wallet.coins).toBe(100 + 10 * 30);
    expect(containerTotal(stall)).toBe(0);
  });

  it('applies the same multiplier decay as manual selling', () => {
    const { world, stall } = stallWorld();
    addItems(stall, WHEAT, 50, DEFAULT_STACK_SIZE);

    world.tick += 1;
    economySystem(world);

    expect(multiplierOf(world.economy, WHEAT)).toBe(0.9);
  });

  it('publishes itemSold marked automatic', () => {
    const { world, stall } = stallWorld();
    const seen: { item: string; quantity: number; coins: number; automatic: boolean }[] = [];
    world.events.subscribe('itemSold', (event) => seen.push({ ...event }));
    addItems(stall, WHEAT, 4, DEFAULT_STACK_SIZE);

    world.tick += 1;
    economySystem(world);
    world.events.flush();

    expect(seen).toEqual([{ item: 'core:wheat', quantity: 4, coins: 120, automatic: true }]);
  });

  it('sweeps every stack, each priced at its own pre-sale multiplier', () => {
    const { world, stall } = stallWorld();
    addItems(stall, WHEAT, 10, DEFAULT_STACK_SIZE);
    addItems(stall, TURNIP, 10, DEFAULT_STACK_SIZE);

    world.tick += 1;
    economySystem(world);

    // wheat: 10 × floor(0.9 × 34) = 300; turnip: 10 × floor(0.9 × 12) = 100.
    expect(world.wallet.coins).toBe(100 + 300 + 100);
    expect(containerTotal(stall)).toBe(0);
    expect(multiplierOf(world.economy, WHEAT)).toBe(0.98);
    expect(multiplierOf(world.economy, TURNIP)).toBe(0.98);
  });

  it('an empty stall costs the tick nothing and changes nothing', () => {
    const { world } = stallWorld();
    world.tick += 1;
    economySystem(world);
    expect(world.wallet.coins).toBe(100);
  });
});
