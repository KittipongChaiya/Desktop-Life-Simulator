/**
 * Event monitor — the ring and the observer. Phase-07.8e, ADR-018 §10.
 *
 * Two properties carry this milestone, and both are asserted here rather than
 * trusted: the ring is BOUNDED (in entries and in the size of each), and the
 * observer is a CONSUMER ONLY — it subscribes, and there is no path by which it
 * publishes, replays, or synthesises an event.
 */

import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from '../../sim/events/bus';

import { observeEvents, OBSERVED_EVENTS } from './observer';
import { createEventRing, SUMMARY_LIMIT } from './ring';

describe('event ring', () => {
  it('starts empty', () => {
    const ring = createEventRing(4);

    expect(ring.entries()).toHaveLength(0);
    expect(ring.observed()).toBe(0);
  });

  it('records in order, numbering every observation', () => {
    const ring = createEventRing(4);
    ring.record('cropPlanted', 10, { tile: 1 });
    ring.record('cropHarvested', 12, { tile: 1 });

    expect(ring.entries().map((e) => [e.seq, e.name, e.tick])).toEqual([
      [1, 'cropPlanted', 10],
      [2, 'cropHarvested', 12],
    ]);
  });

  it('evicts the oldest at capacity and keeps the newest', () => {
    const ring = createEventRing(3);
    for (let i = 1; i <= 5; i += 1) ring.record('tileTilled', i, { tile: i });

    expect(ring.entries().map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(ring.entries()).toHaveLength(3);
  });

  it('counts everything observed, including what it had to drop', () => {
    // A monitor that shows 200 of 4,000 events and says "200" is lying about
    // what it saw.
    const ring = createEventRing(2);
    for (let i = 0; i < 9; i += 1) ring.record('tileTilled', i, { tile: i });

    expect(ring.observed()).toBe(9);
    expect(ring.entries()).toHaveLength(2);
  });

  it('keeps the same entries reference until something changes', () => {
    // useSyncExternalStore compares by identity: a fresh array per read would
    // re-render the panel on every sample forever.
    const ring = createEventRing(4);
    ring.record('tileTilled', 1, { tile: 1 });

    expect(ring.entries()).toBe(ring.entries());

    const before = ring.entries();
    ring.record('tileTilled', 2, { tile: 2 });
    expect(ring.entries()).not.toBe(before);
  });

  it('hands out frozen entries', () => {
    const ring = createEventRing(4);
    ring.record('tileTilled', 1, { tile: 1 });

    expect(() => {
      (ring.entries() as unknown[]).push('x');
    }).toThrow();
  });

  it('notifies on record, and stops when unsubscribed', () => {
    const ring = createEventRing(4);
    const listener = vi.fn();
    const stop = ring.subscribe(listener);

    ring.record('tileTilled', 1, { tile: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    ring.record('tileTilled', 2, { tile: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('summarises the payload as data, not as a shape', () => {
    const ring = createEventRing(4);
    ring.record('itemSold', 5, { item: 'core:wheat', quantity: 3, coins: 12 });

    expect(ring.entries()[0]?.summary).toContain('core:wheat');
    expect(ring.entries()[0]?.summary).toContain('12');
  });

  it('bounds the size of each entry, not just their number', () => {
    // Bounded count times unbounded size is unbounded. A harvest with a long
    // yield list must not be able to grow the ring's footprint without limit.
    const ring = createEventRing(4);
    ring.record('cropHarvested', 1, { yields: Array.from({ length: 500 }, () => 'core:wheat') });

    const summary = ring.entries()[0]?.summary ?? '';
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_LIMIT + 1);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('records a payload it cannot serialise rather than dropping it', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    const ring = createEventRing(4);

    expect(() => {
      ring.record('appStarted', 1, cyclic);
    }).not.toThrow();
    expect(ring.entries()).toHaveLength(1);
  });

  it('clears, and says so', () => {
    const ring = createEventRing(4);
    const listener = vi.fn();
    ring.record('tileTilled', 1, { tile: 1 });
    ring.subscribe(listener);

    ring.clear();

    expect(ring.entries()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('observeEvents (ADR-018 §10)', () => {
  it('records what the bus dispatches', () => {
    const bus = createEventBus();
    const ring = createEventRing(8);
    observeEvents(bus, ring, () => 42);

    bus.publish('tileTilled', { tile: 7, tick: 42 });
    bus.flush();

    expect(ring.entries().map((e) => [e.name, e.tick])).toEqual([['tileTilled', 42]]);
  });

  it('never publishes — it is a consumer and has no other mode', () => {
    const bus = createEventBus();
    const publish = vi.spyOn(bus, 'publish');
    const ring = createEventRing(8);
    observeEvents(bus, ring, () => 1);

    bus.publish('cropPlanted', { tile: 1, cropId: 'core:wheat', plantedTick: 1 });
    bus.flush();
    publish.mockClear();
    bus.flush();

    expect(publish).not.toHaveBeenCalled();
    expect(bus.pending()).toBe(0);
  });

  it('does not observe simulationTick, which would evict everything else', () => {
    // It fires 20x/second. A ring that recorded it would hold ten seconds of
    // heartbeat and nothing else — a monitor whose default configuration
    // destroys what it monitors. Every entry carries its tick anyway, so
    // recording the tick EVENT adds nothing the records do not already say.
    expect(OBSERVED_EVENTS).not.toContain('simulationTick');
    expect(OBSERVED_EVENTS).toContain('cropHarvested');

    const bus = createEventBus();
    const ring = createEventRing(8);
    observeEvents(bus, ring, () => 1);

    bus.publish('simulationTick', { tick: 1 });
    bus.flush();

    expect(ring.entries()).toHaveLength(0);
  });

  it('detaches completely, leaving no subscriber behind', () => {
    const bus = createEventBus();
    const ring = createEventRing(8);
    const stop = observeEvents(bus, ring, () => 1);

    stop();

    for (const name of OBSERVED_EVENTS) expect(bus.subscriberCount(name)).toBe(0);

    bus.publish('tileTilled', { tile: 1, tick: 1 });
    bus.flush();
    expect(ring.entries()).toHaveLength(0);
  });

  it('records the tick the observation happened on', () => {
    const bus = createEventBus();
    const ring = createEventRing(8);
    let tick = 100;
    observeEvents(bus, ring, () => tick);

    bus.publish('tileTilled', { tile: 1, tick: 100 });
    bus.flush();

    tick = 220;
    bus.publish('tileTilled', { tile: 2, tick: 220 });
    bus.flush();

    expect(ring.entries().map((e) => e.tick)).toEqual([100, 220]);
  });
});
