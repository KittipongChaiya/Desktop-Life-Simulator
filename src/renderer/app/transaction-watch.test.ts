/**
 * The major-transaction save trigger. Phase-07e — `SAVE_FORMAT.md` §7.2,
 * acceptance criterion 19.
 *
 * The point of this trigger is the coins-to-permanent-thing conversion: a
 * hire, a building, an expansion. Everything else waits for the cadence.
 */

import { describe, expect, it, vi } from 'vitest';

import type { SliceMap, SliceName } from '../../sim/snapshot/slices';
import type { SnapshotStore } from '../../sim/snapshot/store-contract';

import { isMajorTransaction, readTotals, watchMajorTransactions } from './transaction-watch';

interface StubStore extends SnapshotStore {
  /** Publishes new slice values, as a pump would. */
  publish(next: Partial<SliceMap>): void;
}

function stubStore(initial: Partial<SliceMap> = {}): StubStore {
  const listeners = new Map<SliceName, Set<() => void>>();
  let slices: SliceMap = {
    status: { tick: 0, uptimeSeconds: 0 },
    workers: [],
    buildings: [],
    inventory: { stacks: [], used: 0, capacity: 0 },
    wallet: { coins: 0 },
    economy: { prices: [], expansionsPurchased: 0, nextExpansionCost: 100 },
    ...initial,
  };

  return {
    subscribe(slice, listener) {
      const set = listeners.get(slice) ?? new Set();
      set.add(listener);
      listeners.set(slice, set);
      return () => set.delete(listener);
    },
    get: (slice) => slices[slice],
    pump: () => undefined,
    activeSubscriptions: () => listeners.size,
    publish(next) {
      slices = { ...slices, ...next };
      for (const slice of Object.keys(next) as SliceName[]) {
        for (const listener of listeners.get(slice) ?? []) listener();
      }
    },
  };
}

const worker = (id: number): SliceMap['workers'][number] => ({
  id,
  tile: 0,
  toTile: 0,
  moveFraction: 0,
  facing: 'south',
  state: 'idle',
  task: null,
  energy: 100,
});

const building = (id: number): SliceMap['buildings'][number] => ({
  id,
  tile: id,
  sprite: 'shed',
});

describe('readTotals', () => {
  it('reads the three §7.2 totals off the snapshot', () => {
    const store = stubStore({
      workers: [worker(1), worker(2)],
      buildings: [building(1)],
      economy: { prices: [], expansionsPurchased: 3, nextExpansionCost: 400 },
    });

    expect(readTotals(store)).toEqual({ workers: 2, buildings: 1, expansions: 3 });
  });
});

describe('isMajorTransaction', () => {
  const none = { workers: 1, buildings: 1, expansions: 1 };

  it.each([
    ['a worker hire', { ...none, workers: 2 }],
    ['a building purchase', { ...none, buildings: 2 }],
    ['a land expansion', { ...none, expansions: 2 }],
  ])('fires on %s', (_label, next) => {
    expect(isMajorTransaction(none, next)).toBe(true);
  });

  it('does not fire when nothing was bought', () => {
    expect(isMajorTransaction(none, { ...none })).toBe(false);
  });

  it('does not fire on a shrink — only a purchase is a transaction', () => {
    // Nothing shrinks these in v0.1. Stated as a rule so the day something
    // does (firing a worker, v0.3), it does not masquerade as a purchase.
    expect(isMajorTransaction(none, { workers: 0, buildings: 0, expansions: 0 })).toBe(false);
  });
});

describe('watchMajorTransactions', () => {
  it('triggers a save when a worker is hired', () => {
    const store = stubStore();
    const onTransaction = vi.fn();
    watchMajorTransactions(store, onTransaction);

    store.publish({ workers: [worker(1)] });

    expect(onTransaction).toHaveBeenCalledTimes(1);
  });

  it('triggers when a building is placed and when land is expanded', () => {
    const store = stubStore();
    const onTransaction = vi.fn();
    watchMajorTransactions(store, onTransaction);

    store.publish({ buildings: [building(1)] });
    store.publish({ economy: { prices: [], expansionsPurchased: 1, nextExpansionCost: 200 } });

    expect(onTransaction).toHaveBeenCalledTimes(2);
  });

  it('stays silent for the changes that happen constantly', () => {
    // Workers move, prices recover, coins tick up from auto-sell. If any of
    // those counted, "after a major transaction" would mean "every frame".
    const store = stubStore({ workers: [worker(1)] });
    const onTransaction = vi.fn();
    watchMajorTransactions(store, onTransaction);

    store.publish({ workers: [{ ...worker(1), tile: 9, state: 'moving' }] });
    store.publish({ wallet: { coins: 500 } });
    store.publish({
      economy: {
        prices: [{ item: 'wheat', price: 9, basePrice: 10 }],
        expansionsPurchased: 0,
        nextExpansionCost: 100,
      },
    });

    expect(onTransaction).not.toHaveBeenCalled();
  });

  it('counts one transaction per purchase, not one per subscribed slice', () => {
    const store = stubStore();
    const onTransaction = vi.fn();
    watchMajorTransactions(store, onTransaction);

    store.publish({ workers: [worker(1)], buildings: [building(1)] });

    expect(onTransaction).toHaveBeenCalledTimes(1);
  });

  it('stops watching on teardown', () => {
    const store = stubStore();
    const onTransaction = vi.fn();
    const stop = watchMajorTransactions(store, onTransaction);

    stop();
    store.publish({ workers: [worker(1)] });

    expect(onTransaction).not.toHaveBeenCalled();
  });
});
