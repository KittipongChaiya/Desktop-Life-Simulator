/**
 * Worker hiring command. Phase-04, GAME_DESIGN.md §4.1.
 *
 * Hiring is a player intent that writes the worker store, so it flows through
 * the dispatcher like every other write (ADR-010 §1). Cost escalates and is
 * charged since 06c — these tests fund their hires so the subject stays the
 * spawn mechanics; affordability itself is covered in building-economy.test.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { stepSimulation } from '../tick';
import { addCoins } from '../world/wallet';
import { MAX_ENERGY } from '../world/worker';
import { createWorld, type World } from '../world/world';

import { CommandSource } from './types';
import { hireCost } from './worker-commands';

/** A world that can afford several escalating hires. */
function fundedWorld(): World {
  const world = createWorld(1);
  addCoins(world.wallet, 2_000);
  return world;
}

describe('hireCost (§4.1)', () => {
  it('matches the published escalation table', () => {
    expect(hireCost(0)).toBe(150); // 1st worker
    expect(hireCost(1)).toBe(240); // 2nd
    expect(hireCost(2)).toBe(384); // 3rd
    expect(hireCost(3)).toBe(614); // 4th
    expect(hireCost(4)).toBe(983); // 5th
  });

  it('is floor(150 × 1.6^n) across ten workers', () => {
    for (let n = 0; n < 10; n += 1) {
      expect(hireCost(n)).toBe(Math.floor(150 * 1.6 ** n));
    }
  });
});

describe('hireWorker command', () => {
  it('spawns a worker on the next tick', () => {
    const world = fundedWorld();
    expect(world.workers.size).toBe(0);
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    stepSimulation(world);
    expect(world.workers.size).toBe(1);
  });

  it('allocates deterministic ascending ids', () => {
    const world = fundedWorld();
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    stepSimulation(world);
    expect([...world.workers.keys()].map(Number).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('spawns a full-energy worker at the plot centre', () => {
    const world = fundedWorld();
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    stepSimulation(world);
    const worker = [...world.workers.values()][0];
    expect(worker?.position).toBe(toIndexUnchecked(32, 32));
    expect(worker?.energy).toBe(MAX_ENERGY);
  });

  it('a spawned worker then farms on its own', () => {
    const world = fundedWorld();
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    stepSimulation(world);
    // Given only the hire, the worker should start tilling with no further input.
    for (let i = 0; i < 60; i += 1) stepSimulation(world);
    expect([...world.tiles.tilledAt].some((v) => v > 0)).toBe(true);
  });
});
