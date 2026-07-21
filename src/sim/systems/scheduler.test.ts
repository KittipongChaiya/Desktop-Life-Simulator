/**
 * Scheduler and ID allocator tests. ADR-007 §4, ADR-004.
 */

import { describe, expect, it, vi } from 'vitest';

import { createIdAllocator, EntityKind } from '../entities/id-allocator';
import { tickOrder } from '../tick';
import { createWorld, type World } from '../world/world';

import { createScheduler, PHASE_ORDER, type Phase } from './scheduler';

function system(name: string, phase: Phase, run: (world: World) => void = () => undefined) {
  return { name, phase, run };
}

describe('phase ordering', () => {
  it('runs phases in the declared order regardless of registration order', () => {
    // THE point of the scheduler: registering late must not run late.
    const scheduler = createScheduler();
    const seen: string[] = [];

    scheduler.register(system('last', 'postUpdate', () => seen.push('last')));
    scheduler.register(system('first', 'preUpdate', () => seen.push('first')));
    scheduler.register(system('middle', 'crops', () => seen.push('middle')));

    scheduler.step(createWorld(1));

    expect(seen).toEqual(['first', 'middle', 'last']);
  });

  it('preserves registration order within one phase', () => {
    const scheduler = createScheduler();
    const seen: string[] = [];

    scheduler.register(system('a', 'crops', () => seen.push('a')));
    scheduler.register(system('b', 'crops', () => seen.push('b')));

    scheduler.step(createWorld(1));
    expect(seen).toEqual(['a', 'b']);
  });

  it('reports execution order', () => {
    const scheduler = createScheduler();
    scheduler.register(system('z', 'postUpdate'));
    scheduler.register(system('a', 'preUpdate'));

    expect(scheduler.order()).toEqual(['a', 'z']);
  });

  it('declares phases in a fixed sequence', () => {
    expect(PHASE_ORDER).toEqual([
      'preUpdate',
      'world',
      'crops',
      'workers',
      'economy',
      'postUpdate',
    ]);
  });
});

describe('validation fails fast', () => {
  it('rejects a duplicate system name', () => {
    const scheduler = createScheduler();
    scheduler.register(system('growth', 'crops'));

    expect(() => scheduler.register(system('growth', 'workers'))).toThrow(/already registered/);
  });

  it('rejects an unknown phase', () => {
    const scheduler = createScheduler();

    expect(() => scheduler.register(system('x', 'nope' as Phase))).toThrow(/unknown phase/);
  });

  it('names the valid phases in the error', () => {
    const scheduler = createScheduler();

    expect(() => scheduler.register(system('x', 'bad' as Phase))).toThrow(/preUpdate/);
  });
});

describe('execution', () => {
  it('runs every system once per step', () => {
    const scheduler = createScheduler();
    const run = vi.fn();
    scheduler.register(system('a', 'world', run));

    scheduler.step(createWorld(1));
    scheduler.step(createWorld(1));

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs nothing when empty', () => {
    expect(() => createScheduler().step(createWorld(1))).not.toThrow();
  });

  it('registerAll preserves declared order', () => {
    const scheduler = createScheduler();
    scheduler.registerAll([system('b', 'crops'), system('a', 'preUpdate')]);

    expect(scheduler.order()).toEqual(['a', 'b']);
    expect(scheduler.size).toBe(2);
  });
});

describe('the live tick schedule', () => {
  it('ends with snapshot so views observe settled state', () => {
    // ADR-007 §4. If snapshot stops being last, views can read a half-stepped
    // world and the failure is intermittent and near-impossible to trace.
    const order = tickOrder();
    expect(order.at(-1)).toBe('snapshot');
  });

  it('flushes events before snapshotting', () => {
    const order = tickOrder();
    expect(order.indexOf('eventFlush')).toBeLessThan(order.indexOf('snapshot'));
  });

  it('publishes the tick event before flushing it', () => {
    const order = tickOrder();
    expect(order.indexOf('tickEvent')).toBeLessThan(order.indexOf('eventFlush'));
  });
});

describe('id allocator', () => {
  it('issues stable, monotonic ids starting at 1', () => {
    // Zero is reserved as "no entity" so a zeroed field never reads as valid.
    const ids = createIdAllocator();
    expect(ids.allocateWorker()).toBe(1);
    expect(ids.allocateWorker()).toBe(2);
    expect(ids.allocateWorker()).toBe(3);
  });

  it('keeps counters independent per kind', () => {
    const ids = createIdAllocator();
    ids.allocateWorker();
    ids.allocateWorker();

    expect(ids.allocateBuilding()).toBe(1);
  });

  it('never reuses an id', () => {
    // A recycled id would let a stale reference resolve to a different entity.
    const ids = createIdAllocator();
    const first = ids.allocateWorker();
    ids.allocateWorker();

    expect(ids.allocateWorker()).toBeGreaterThan(first);
    expect(ids.issued(EntityKind.Worker)).toBe(3);
  });

  it('allocates deterministically for identical call sequences', () => {
    const a = createIdAllocator();
    const b = createIdAllocator();

    for (let i = 0; i < 100; i += 1) {
      expect(a.allocateWorker()).toBe(b.allocateWorker());
    }
  });

  it('round-trips state without reissuing ids', () => {
    const ids = createIdAllocator();
    for (let i = 0; i < 5; i += 1) ids.allocateWorker();

    const restored = createIdAllocator();
    restored.setState(
      JSON.parse(JSON.stringify(ids.getState())) as ReturnType<typeof ids.getState>,
    );

    expect(restored.allocateWorker()).toBe(6);
  });

  it('reports whether an id was issued', () => {
    const ids = createIdAllocator();
    ids.allocateWorker();

    expect(ids.isAllocated(EntityKind.Worker, 1)).toBe(true);
    expect(ids.isAllocated(EntityKind.Worker, 2)).toBe(false);
    expect(ids.isAllocated(EntityKind.Worker, 0)).toBe(false);
  });

  it('clamps a corrupt restored counter rather than reissuing ids', () => {
    const ids = createIdAllocator();
    ids.setState({ worker: -5, building: Number.NaN });

    expect(ids.allocateWorker()).toBe(1);
    expect(ids.allocateBuilding()).toBe(1);
  });
});
