/**
 * The economy system. Phase-06, GAME_DESIGN.md §6.2, ADR-013.
 *
 * Owns price recovery: every 20 ticks, each depressed multiplier climbs 0.005
 * toward 1.00. Recovery is aligned to the tick counter (`tick % 20`), never to
 * a private timer — that is what lets phase-07's catchUp derive offline
 * recovery from elapsed ticks alone (ADR-009's pattern).
 */

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';
import { multiplierOf, recordSale } from '../world/economy';
import { STARTING_COINS } from '../world/wallet';
import { createWorld } from '../world/world';

import { economySystem } from './economy';

const WHEAT = asContentId('core:wheat');

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
