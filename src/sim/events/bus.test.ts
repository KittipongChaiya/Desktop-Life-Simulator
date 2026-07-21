/**
 * Event bus tests. ADR-008.
 */

import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from './bus';

describe('subscribe and publish', () => {
  it('does not dispatch until flush', () => {
    // Immediate dispatch would let a subscriber mutate state a system is still
    // iterating (ARCHITECTURE.md §3.5).
    const bus = createEventBus();
    const handler = vi.fn();
    bus.subscribe('simulationTick', handler);

    bus.publish('simulationTick', { tick: 1 });
    expect(handler).not.toHaveBeenCalled();
    expect(bus.pending()).toBe(1);

    bus.flush();
    expect(handler).toHaveBeenCalledWith({ tick: 1 });
  });

  it('delivers events in publish order', () => {
    const bus = createEventBus();
    const seen: number[] = [];
    bus.subscribe('simulationTick', (payload) => seen.push(payload.tick));

    for (const tick of [1, 2, 3]) bus.publish('simulationTick', { tick });
    bus.flush();

    expect(seen).toEqual([1, 2, 3]);
  });

  it('invokes subscribers in registration order', () => {
    // Deterministic subscriber order is required by ADR-007.
    const bus = createEventBus();
    const seen: string[] = [];
    bus.subscribe('appStarted', () => seen.push('first'));
    bus.subscribe('appStarted', () => seen.push('second'));

    bus.publish('appStarted', { version: '0.1.0' });
    bus.flush();

    expect(seen).toEqual(['first', 'second']);
  });

  it('reports how many events were dispatched', () => {
    const bus = createEventBus();
    bus.publish('simulationTick', { tick: 1 });
    bus.publish('simulationTick', { tick: 2 });

    expect(bus.flush()).toBe(2);
    expect(bus.flush()).toBe(0);
  });

  it('drops events with no subscriber without error', () => {
    const bus = createEventBus();
    bus.publish('appStarted', { version: '0.1.0' });

    expect(() => bus.flush()).not.toThrow();
  });
});

describe('duplicate protection', () => {
  it('registers the same handler once, however many times it subscribes', () => {
    // A double subscription silently doubles every side effect.
    const bus = createEventBus();
    const handler = vi.fn();

    bus.subscribe('simulationTick', handler);
    bus.subscribe('simulationTick', handler);
    bus.subscribe('simulationTick', handler);

    expect(bus.subscriberCount('simulationTick')).toBe(1);

    bus.publish('simulationTick', { tick: 1 });
    bus.flush();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps distinct handlers separate', () => {
    const bus = createEventBus();
    bus.subscribe('simulationTick', vi.fn());
    bus.subscribe('simulationTick', vi.fn());

    expect(bus.subscriberCount('simulationTick')).toBe(2);
  });
});

describe('unsubscribe safety', () => {
  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const off = bus.subscribe('simulationTick', handler);
    off();

    bus.publish('simulationTick', { tick: 1 });
    bus.flush();

    expect(handler).not.toHaveBeenCalled();
    expect(bus.subscriberCount('simulationTick')).toBe(0);
  });

  it('tolerates unsubscribing twice', () => {
    const bus = createEventBus();
    const off = bus.subscribe('simulationTick', vi.fn());

    off();
    expect(() => {
      off();
    }).not.toThrow();
  });

  it('tolerates unsubscribing a handler that was never subscribed', () => {
    const bus = createEventBus();
    expect(() => {
      bus.unsubscribe('simulationTick', vi.fn());
    }).not.toThrow();
  });

  it('lets a handler unsubscribe itself during dispatch', () => {
    // Mutating the subscriber set mid-iteration would otherwise skip handlers.
    const bus = createEventBus();
    const calls: string[] = [];

    const off = bus.subscribe('simulationTick', () => {
      calls.push('self');
      off();
    });
    bus.subscribe('simulationTick', () => calls.push('other'));

    bus.publish('simulationTick', { tick: 1 });
    bus.flush();

    expect(calls).toEqual(['self', 'other']);
    expect(bus.subscriberCount('simulationTick')).toBe(1);
  });
});

describe('re-entrancy', () => {
  it('defers events published during a flush to the next flush', () => {
    // Appending to the batch in progress would allow an unbounded loop.
    const bus = createEventBus();
    const seen: number[] = [];

    bus.subscribe('simulationTick', (payload) => {
      seen.push(payload.tick);
      if (payload.tick < 3) bus.publish('simulationTick', { tick: payload.tick + 1 });
    });

    bus.publish('simulationTick', { tick: 1 });

    expect(bus.flush()).toBe(1);
    expect(seen).toEqual([1]);
    expect(bus.pending()).toBe(1);

    bus.flush();
    expect(seen).toEqual([1, 2]);
  });
});

describe('error handling', () => {
  it('keeps dispatching after a handler throws', () => {
    const bus = createEventBus({ onHandlerError: vi.fn() });
    const after = vi.fn();

    bus.subscribe('simulationTick', () => {
      throw new Error('boom');
    });
    bus.subscribe('simulationTick', after);

    bus.publish('simulationTick', { tick: 1 });
    expect(() => bus.flush()).not.toThrow();
    expect(after).toHaveBeenCalled();
  });

  it('reports the failure rather than swallowing it', () => {
    const onHandlerError = vi.fn();
    const bus = createEventBus({ onHandlerError });

    bus.subscribe('simulationTick', () => {
      throw new Error('boom');
    });
    bus.publish('simulationTick', { tick: 1 });
    bus.flush();

    expect(onHandlerError).toHaveBeenCalledWith('simulationTick', expect.any(Error));
  });
});

describe('no shared state', () => {
  it('gives each bus its own subscribers', () => {
    // No module singleton: two worlds in one process never cross-talk.
    const a = createEventBus();
    const b = createEventBus();
    a.subscribe('simulationTick', vi.fn());

    expect(a.subscriberCount('simulationTick')).toBe(1);
    expect(b.subscriberCount('simulationTick')).toBe(0);
  });

  it('clears subscribers and queued events', () => {
    const bus = createEventBus();
    bus.subscribe('simulationTick', vi.fn());
    bus.publish('simulationTick', { tick: 1 });

    bus.clear();

    expect(bus.subscriberCount('simulationTick')).toBe(0);
    expect(bus.pending()).toBe(0);
  });
});
