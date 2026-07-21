/**
 * Snapshot bridge tests. Phase-01 acceptance criteria 17 and 18.
 *
 * These enforce ADR-005 §2. The failure they guard against is silent: a slice
 * that republishes every tick still *works*, it just drives the UI at 20 Hz
 * forever and blows the idle CPU budget. Nothing looks broken.
 */

import { describe, expect, it } from 'vitest';

import { TICKS_PER_SECOND, UI_UPDATE_HZ } from '../../shared/constants';
import { stepSimulationBy } from '../../sim/tick';
import { createWorld } from '../../sim/world/world';

import { createSnapshotStore } from './snapshot-store';

const FLUSH_INTERVAL_MS = 1000 / UI_UPDATE_HZ;

/**
 * Advances the world and pumps the store as a real frame loop would.
 *
 * Ticks are accumulated rather than divided per frame: at 60 fps and 20 Hz the
 * per-frame quotient rounds to zero, which would silently advance nothing.
 */
function run(
  world: ReturnType<typeof createWorld>,
  store: ReturnType<typeof createSnapshotStore>,
  seconds: number,
) {
  const frames = Math.round(seconds * 60);
  let ticksOwed = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    ticksOwed += TICKS_PER_SECOND / 60;
    const whole = Math.floor(ticksOwed);
    ticksOwed -= whole;

    if (whole > 0) stepSimulationBy(world, whole);
    store.pump(frame * (1000 / 60));
  }
}

describe('slices republish only on change (criterion 18)', () => {
  it('does not notify when the world is static', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    let notifications = 0;
    store.subscribe('status', () => {
      notifications += 1;
    });

    // Pump for 10 simulated seconds WITHOUT advancing the simulation.
    for (let frame = 0; frame < 600; frame += 1) {
      store.pump(frame * (1000 / 60));
    }

    expect(notifications).toBe(0);
  });

  it('does not notify on ticks that change nothing observable', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    let notifications = 0;
    store.subscribe('status', () => {
      notifications += 1;
    });

    // 19 ticks: under one second, so uptimeSeconds never changes.
    stepSimulationBy(world, TICKS_PER_SECOND - 1);
    store.pump(0);

    expect(notifications).toBe(0);
  });

  it('notifies once per observable change, not once per tick', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    let notifications = 0;
    store.subscribe('status', () => {
      notifications += 1;
    });

    run(world, store, 5);

    // 5 seconds of simulation is 100 ticks. A naive bridge would notify 100
    // times; the change gate reduces that to roughly one per second.
    expect(notifications).toBeGreaterThan(0);
    expect(notifications).toBeLessThanOrEqual(6);
  });
});

describe('throttling (ADR-005 §2)', () => {
  it('coalesces notifications to at most UI_UPDATE_HZ', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    let notifications = 0;
    store.subscribe('status', () => {
      notifications += 1;
    });

    // Drive one observable change per pump, far faster than the throttle.
    for (let i = 0; i < 100; i += 1) {
      stepSimulationBy(world, TICKS_PER_SECOND);
      store.pump(i); // 1ms apart
    }

    // 100ms of wall clock at 10 Hz allows at most ~2 flushes.
    expect(notifications).toBeLessThanOrEqual(2);
  });

  it('delivers again once the throttle interval has passed', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    let notifications = 0;
    store.subscribe('status', () => {
      notifications += 1;
    });

    for (let i = 0; i < 5; i += 1) {
      stepSimulationBy(world, TICKS_PER_SECOND);
      store.pump(i * FLUSH_INTERVAL_MS);
    }

    expect(notifications).toBe(5);
  });
});

describe('slice isolation', () => {
  it('returns a referentially stable value between changes', () => {
    // useSyncExternalStore loops forever if getSnapshot returns a new object
    // each call. This is the test that catches that.
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    const first = store.get('status');
    stepSimulationBy(world, 1);

    expect(store.get('status')).toBe(first);
  });

  it('returns a new value after an observable change', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    const first = store.get('status');
    stepSimulationBy(world, TICKS_PER_SECOND);

    expect(store.get('status')).not.toBe(first);
  });

  it('stops notifying after unsubscribe', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    let notifications = 0;
    const unsubscribe = store.subscribe('status', () => {
      notifications += 1;
    });
    unsubscribe();

    run(world, store, 3);

    expect(notifications).toBe(0);
    expect(store.activeSubscriptions()).toBe(0);
  });

  it('does not notify a fresh subscriber about changes that predate it', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    stepSimulationBy(world, TICKS_PER_SECOND * 5);

    let notifications = 0;
    store.subscribe('status', () => {
      notifications += 1;
    });
    store.pump(10_000);

    expect(notifications).toBe(0);
  });

  it('does no work when nothing is subscribed', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    stepSimulationBy(world, TICKS_PER_SECOND * 10);
    store.pump(0);

    expect(store.activeSubscriptions()).toBe(0);
  });
});
