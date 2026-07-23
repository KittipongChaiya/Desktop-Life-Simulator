/**
 * Worker long-run and determinism. Phase-04 acceptance criteria 23 & 24.
 *
 * These are the two tests the phase hinges on. Criterion 23 — automation must
 * never jam while the player is away — is the product thesis (`VISION.md` §2.2);
 * it is also the bug a five-minute test never catches, so it is run accelerated
 * over 8 simulated hours. Criterion 24 pins the determinism ADR-002/004/007 all
 * depend on: identical seed and inputs produce byte-identical worker state.
 */

import { describe, expect, it } from 'vitest';

import { OFFLINE_CAP_TICKS } from '../src/shared/constants';
import { CommandSource } from '../src/sim/commands/types';
import { CORE_TURNIP_SEED, DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems, containerTotal } from '../src/sim/world/container';
import { addCoins } from '../src/sim/world/wallet';
import { createWorld, type World } from '../src/sim/world/world';
import { MAX_ENERGY } from '../src/sim/world/worker';

function withWorkers(seed: number, count: number): World {
  const world = createWorld(seed);
  // Planting consumes seeds (06b) and hiring charges (06c); stock and fund
  // the farm generously so the subject under test stays automation, not
  // procurement. Exhausting the stock mid-run is a valid end state — workers
  // idle, never jam.
  addItems(world.inventory, CORE_TURNIP_SEED, 5 * DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
  addCoins(world.wallet, 5_000);
  for (let i = 0; i < count; i += 1) {
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
  }
  stepSimulationBy(world, 1); // drain the hires so the workers exist
  return world;
}

function snapshotWorkers(world: World): unknown {
  return [...world.workers.values()]
    .sort((a, b) => a.id - b.id)
    .map((w) => ({
      id: w.id,
      position: w.position,
      state: w.state,
      task: w.task,
      energy: w.energy,
      energyTimer: w.energyTimer,
      actionProgress: w.actionProgress,
      carrying: w.carrying,
      replanTick: w.replanTick,
    }));
}

function snapshotCrops(world: World): unknown {
  return [...world.crops.entries()].sort((a, b) => a[0] - b[0]);
}

describe('5 workers run unattended for 8 simulated hours (crit 23)', () => {
  it('runs unattended without jamming; the bounded farm fills and workers idle', () => {
    const world = withWorkers(20260722, 5);

    // The whole 8 hours must not throw. With no selling wired into this run,
    // the farm winds down when the seed stock exhausts or the bounded
    // inventory fills and blocks harvest — either is the correct end state
    // (§7, 06b): workers wait rather than deadlock, jam, or crash.
    expect(() => stepSimulationBy(world, OFFLINE_CAP_TICKS)).not.toThrow();

    // Work happened, and it flowed all the way to the inventory: harvest ->
    // worker hold -> deposit -> player inventory (ADR-011).
    expect(world.cropStats.planted).toBeGreaterThan(0);
    expect(world.cropStats.harvested).toBeGreaterThan(0);
    expect(containerTotal(world.inventory)).toBeGreaterThan(0);

    // No jam: five workers, each in a valid state with bounded energy.
    expect(world.workers.size).toBe(5);
    for (const worker of world.workers.values()) {
      expect(worker.energy).toBeGreaterThanOrEqual(0);
      expect(worker.energy).toBeLessThanOrEqual(MAX_ENERGY);
    }
  }, 120_000);
});

describe('determinism over 100k ticks with 5 workers (crit 24)', () => {
  it('produces byte-identical worker and crop state from an identical run', () => {
    const a = withWorkers(31337, 5);
    const b = withWorkers(31337, 5);

    stepSimulationBy(a, 100_000);
    stepSimulationBy(b, 100_000);

    expect(a.tick).toBe(b.tick);
    expect(snapshotWorkers(a)).toEqual(snapshotWorkers(b));
    expect(snapshotCrops(a)).toEqual(snapshotCrops(b));
    expect([...a.tiles.tilledAt]).toEqual([...b.tiles.tilledAt]);
    expect(a.cropStats).toEqual(b.cropStats);
    expect(a.rng.getState()).toEqual(b.rng.getState());
  }, 120_000);
});
