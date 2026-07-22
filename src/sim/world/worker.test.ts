/**
 * Worker record + store. Phase-04, ADR-004 §1.
 */

import { describe, expect, it } from 'vitest';

import { asTileIndex, asWorkerId } from '../../shared/ids';

import {
  advanceEnergy,
  createWorker,
  createWorkerStore,
  ENERGY_DRAIN_PER_PERIOD,
  ENERGY_PERIOD_TICKS,
  ENERGY_RECOVER_PER_PERIOD,
  MAX_ENERGY,
  WorkerState,
  type Worker,
} from './worker';

describe('createWorkerStore', () => {
  it('starts empty', () => {
    expect(createWorkerStore().size).toBe(0);
  });

  it('is keyed by worker id', () => {
    const store = createWorkerStore();
    const worker = createWorker(asWorkerId(1), asTileIndex(2080));
    store.set(worker.id, worker);
    expect(store.get(asWorkerId(1))).toBe(worker);
  });
});

describe('createWorker', () => {
  const worker: Worker = createWorker(asWorkerId(7), asTileIndex(2080));

  it('spawns idle', () => {
    expect(worker.state).toBe(WorkerState.Idle);
  });

  it('spawns at the given tile with no task and no path', () => {
    expect(worker.position).toBe(asTileIndex(2080));
    expect(worker.task).toBeNull();
    expect(worker.path).toEqual([]);
    expect(worker.pathCursor).toBe(0);
    expect(worker.actionProgress).toBe(0);
  });

  it('spawns at full energy so a fresh hire works immediately', () => {
    expect(worker.energy).toBe(MAX_ENERGY);
    expect(worker.energyTimer).toBe(0);
  });

  it('spawns carrying nothing', () => {
    expect(worker.carrying).toBe(0);
  });
});

describe('advanceEnergy', () => {
  it('holds steady within a period, then changes by the whole-period amount', () => {
    // Nineteen ticks accumulate but do not yet move integer energy.
    let state = { energy: 50, timer: 0 };
    for (let i = 0; i < ENERGY_PERIOD_TICKS - 1; i += 1) {
      state = advanceEnergy(state.energy, state.timer, -ENERGY_DRAIN_PER_PERIOD);
    }
    expect(state.energy).toBe(50);

    // The twentieth completes the period.
    state = advanceEnergy(state.energy, state.timer, -ENERGY_DRAIN_PER_PERIOD);
    expect(state.energy).toBe(50 - ENERGY_DRAIN_PER_PERIOD);
    expect(state.timer).toBe(0);
  });

  it('recovers at the rest rate', () => {
    let state = { energy: 50, timer: 0 };
    for (let i = 0; i < ENERGY_PERIOD_TICKS; i += 1) {
      state = advanceEnergy(state.energy, state.timer, ENERGY_RECOVER_PER_PERIOD);
    }
    expect(state.energy).toBe(50 + ENERGY_RECOVER_PER_PERIOD);
  });

  it('never drops below zero', () => {
    let state = { energy: 0, timer: ENERGY_PERIOD_TICKS - 1 };
    state = advanceEnergy(state.energy, state.timer, -ENERGY_DRAIN_PER_PERIOD);
    expect(state.energy).toBe(0);
  });

  it('never exceeds the maximum', () => {
    let state = { energy: MAX_ENERGY, timer: ENERGY_PERIOD_TICKS - 1 };
    state = advanceEnergy(state.energy, state.timer, ENERGY_RECOVER_PER_PERIOD);
    expect(state.energy).toBe(MAX_ENERGY);
  });
});
