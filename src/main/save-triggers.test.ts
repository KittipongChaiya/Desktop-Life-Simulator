/**
 * Save triggers. Phase-07e — `SAVE_FORMAT.md` §7.2, acceptance criterion 19.
 *
 * The coordinator owns WHEN a save is asked for; the renderer owns what a
 * save IS. Every trigger here becomes the same `save:requested` event, which
 * is why this file tests cadence, rendezvous, and deadlines — never document
 * content.
 */

import { describe, expect, it } from 'vitest';

import { AUTOSAVE_INTERVAL_TICKS, TICK_MS } from '../shared/constants';

import {
  AUTOSAVE_INTERVAL_MS,
  createSaveCoordinator,
  type SaveCoordinatorPorts,
} from './save-triggers';

interface Harness {
  readonly ports: SaveCoordinatorPorts;
  /** Requests sent to the renderer so far. */
  requests(): number;
  /** Runs the repeating handler once, as the real timer would. */
  tickInterval(): void;
  /** Runs the pending one-shot handler, as its deadline passing would. */
  fireTimeout(): void;
  intervalMs(): number | null;
  timeoutMs(): number | null;
  /** Cancellations observed, by kind — a leaked timer is a real defect. */
  cancelled(): { interval: number; timeout: number };
}

function harness(options: { available?: boolean } = {}): Harness {
  const available = options.available ?? true;
  let requests = 0;
  let intervalHandler: (() => void) | null = null;
  let intervalMs: number | null = null;
  let timeoutHandler: (() => void) | null = null;
  let timeoutMs: number | null = null;
  const cancelled = { interval: 0, timeout: 0 };

  return {
    ports: {
      request: () => {
        if (!available) return false;
        requests += 1;
        return true;
      },
      startInterval: (handler, ms) => {
        intervalHandler = handler;
        intervalMs = ms;
        return () => {
          cancelled.interval += 1;
          intervalHandler = null;
        };
      },
      startTimeout: (handler, ms) => {
        timeoutHandler = handler;
        timeoutMs = ms;
        return () => {
          cancelled.timeout += 1;
          timeoutHandler = null;
        };
      },
    },
    requests: () => requests,
    tickInterval: () => intervalHandler?.(),
    fireTimeout: () => timeoutHandler?.(),
    intervalMs: () => intervalMs,
    timeoutMs: () => timeoutMs,
    cancelled: () => ({ ...cancelled }),
  };
}

describe('the autosave cadence', () => {
  it('derives its period from the one autosave constant', () => {
    // 1,200 ticks at 20 Hz IS 60 s (`SAVE_FORMAT.md` §7.2). Deriving rather
    // than restating means the cadence cannot drift from the constant.
    expect(AUTOSAVE_INTERVAL_MS).toBe(AUTOSAVE_INTERVAL_TICKS * TICK_MS);
    expect(AUTOSAVE_INTERVAL_MS).toBe(60_000);
  });

  it('requests a save on every period once started', () => {
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    coordinator.start();
    expect(h.intervalMs()).toBe(AUTOSAVE_INTERVAL_MS);
    expect(h.requests()).toBe(0); // starting is not itself a save

    h.tickInterval();
    h.tickInterval();
    expect(h.requests()).toBe(2);
  });

  it('starting twice does not double the cadence', () => {
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    coordinator.start();
    coordinator.start();
    h.tickInterval();

    expect(h.requests()).toBe(1);
  });

  it('stops cleanly, and stopping twice is harmless', () => {
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    coordinator.start();
    coordinator.stop();
    coordinator.stop();

    expect(h.cancelled().interval).toBe(1);
    h.tickInterval();
    expect(h.requests()).toBe(0);
  });
});

describe('discrete triggers', () => {
  it('fires one request', () => {
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    coordinator.fire();

    expect(h.requests()).toBe(1);
  });

  it('never coalesces here — in-flight collapsing is the renderer’s job', () => {
    // Main knows nothing about a write being in flight; the ONE serialization
    // site does (`save-controller.ts`). Deduplicating in both places would
    // silently drop the quit save behind an autosave.
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    coordinator.fire();
    coordinator.fire();
    coordinator.fire();

    expect(h.requests()).toBe(3);
  });
});

describe('fireAndWait — the quit rendezvous', () => {
  it('resolves once the write settles', async () => {
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    const settled = coordinator.fireAndWait(3_000);
    expect(h.requests()).toBe(1);
    expect(h.timeoutMs()).toBe(3_000);

    coordinator.writeSettled();

    await expect(settled).resolves.toBe('saved');
    // The deadline timer must not outlive the wait it guards.
    expect(h.cancelled().timeout).toBe(1);
  });

  it('resolves on the deadline when the renderer never answers', async () => {
    // A wedged renderer must never hold the process open (§7.3 — a failed
    // save keeps the game playable; here, it keeps quit possible).
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    const settled = coordinator.fireAndWait(3_000);
    h.fireTimeout();

    await expect(settled).resolves.toBe('timed-out');
  });

  it('a late settlement after the deadline changes nothing', async () => {
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    const settled = coordinator.fireAndWait(3_000);
    h.fireTimeout();
    await expect(settled).resolves.toBe('timed-out');

    expect(() => {
      coordinator.writeSettled();
    }).not.toThrow();
  });

  it('resolves immediately when there is no renderer to ask', async () => {
    // Quit after a boot failure, or after the window is gone: there is nobody
    // holding a world, so waiting would be waiting for nothing.
    const h = harness({ available: false });
    const coordinator = createSaveCoordinator(h.ports);

    await expect(coordinator.fireAndWait(3_000)).resolves.toBe('unavailable');
    expect(h.timeoutMs()).toBeNull(); // no deadline was ever armed
  });

  it('settles every waiter at once', async () => {
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    const first = coordinator.fireAndWait(3_000);
    const second = coordinator.fireAndWait(3_000);
    coordinator.writeSettled();

    await expect(Promise.all([first, second])).resolves.toEqual(['saved', 'saved']);
  });
});

describe('writeSettled outside a wait', () => {
  it('is harmless — ordinary autosaves settle with nobody listening', () => {
    const h = harness();
    const coordinator = createSaveCoordinator(h.ports);

    coordinator.fire();
    expect(() => {
      coordinator.writeSettled();
    }).not.toThrow();
    expect(h.cancelled().timeout).toBe(0);
  });
});
