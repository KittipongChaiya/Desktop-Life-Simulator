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
import { stepSimulationBy } from '../src/sim/tick';
import { createWorld, type World } from '../src/sim/world/world';
import { MAX_ENERGY } from '../src/sim/world/worker';

function withWorkers(seed: number, count: number): World {
  const world = createWorld(seed);
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
    }));
}

function snapshotCrops(world: World): unknown {
  return [...world.crops.entries()].sort((a, b) => a[0] - b[0]);
}

describe('5 workers run unattended for 8 simulated hours (crit 23)', () => {
  it('never jams — work is still flowing at the very end of the run', () => {
    const world = withWorkers(20260722, 5);

    // Run almost the whole 8 hours, then measure progress across a final window.
    // If any worker had deadlocked, cumulative harvests would plateau.
    stepSimulationBy(world, OFFLINE_CAP_TICKS - 5000);
    const harvestedBeforeTail = world.cropStats.harvested;

    stepSimulationBy(world, 5000);

    expect(world.cropStats.planted).toBeGreaterThan(0);
    expect(world.cropStats.harvested).toBeGreaterThan(harvestedBeforeTail); // still progressing
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
