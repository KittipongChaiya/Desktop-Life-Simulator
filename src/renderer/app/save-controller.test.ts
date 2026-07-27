/**
 * The save controller. Phase-07e — `SAVE_FORMAT.md` §7.2/§7.3, acceptance
 * criteria 19 and 20.
 *
 * Two properties carry the milestone: a save NEVER runs inside a frame, and
 * triggers arriving during a write COALESCE into exactly one follow-up rather
 * than queueing a burst. The third is that a failure is survivable — the
 * player keeps playing, holding the state that actually matters.
 */

import { describe, expect, it, vi } from 'vitest';

import type { SaveWriteOutcome } from '../../shared/ipc/contract';

import { createSaveController, type SaveControllerPorts } from './save-controller';

interface Harness {
  readonly ports: SaveControllerPorts;
  /** Runs every deferred task queued so far, as leaving the frame would. */
  drain(): Promise<void>;
  /** Settles the oldest outstanding write. */
  settle(outcome: SaveWriteOutcome): void;
  writes(): number;
  deferrals(): number;
}

function harness(): Harness {
  const deferred: (() => void)[] = [];
  const pending: ((outcome: SaveWriteOutcome) => void)[] = [];
  let writes = 0;
  let deferrals = 0;

  return {
    ports: {
      write: () => {
        writes += 1;
        return new Promise<SaveWriteOutcome>((resolve) => pending.push(resolve));
      },
      defer: (run) => {
        deferrals += 1;
        deferred.push(run);
      },
    },
    async drain() {
      // One deferral per pass, each preceded by a microtask flush — a write
      // that settles queues its follow-up through `.finally`, which has not
      // run yet at the moment the test calls `settle`.
      for (let guard = 0; guard < 50; guard += 1) {
        for (let flush = 0; flush < 8; flush += 1) await Promise.resolve();
        const next = deferred.shift();
        if (next === undefined) return;
        next();
      }
    },
    settle(outcome) {
      pending.shift()?.(outcome);
    },
    writes: () => writes,
    deferrals: () => deferrals,
  };
}

const ok: SaveWriteOutcome = { ok: true };
const DISK_FULL = 'ENOSPC: no space left on device';
const SLOT_PATH = 'C:\\saves\\slot-0.json';
const failed: SaveWriteOutcome = { ok: false, error: DISK_FULL, path: SLOT_PATH };

describe('serialization off the render path', () => {
  it('never writes synchronously from the trigger', async () => {
    // A transaction trigger arrives from a snapshot subscriber, which runs
    // inside `store.pump` — inside a FRAME. Serializing there would spend the
    // frame budget on JSON (`SAVE_FORMAT.md` §7.2).
    const h = harness();
    const controller = createSaveController(h.ports);

    controller.requestSave();

    expect(h.writes()).toBe(0);
    expect(h.deferrals()).toBe(1);

    await h.drain();
    expect(h.writes()).toBe(1);
  });
});

describe('coalescing', () => {
  it('collapses a burst during a write into ONE follow-up', async () => {
    // Autosave + a hire + a building purchase inside the same second must not
    // become three writes: "coalesced rather than queued" (§7.2).
    const h = harness();
    const controller = createSaveController(h.ports);

    controller.requestSave();
    await h.drain();
    expect(h.writes()).toBe(1);

    controller.requestSave();
    controller.requestSave();
    controller.requestSave();
    expect(h.writes()).toBe(1); // still just the one in flight

    h.settle(ok);
    await h.drain();

    expect(h.writes()).toBe(2); // exactly one follow-up, not three
  });

  it('the follow-up covers state that changed after the in-flight write began', async () => {
    // Coalescing must not mean DROPPING: the quit save queued behind an
    // autosave is the one save with no next chance.
    const h = harness();
    const controller = createSaveController(h.ports);

    controller.requestSave();
    await h.drain();
    controller.requestSave();
    h.settle(ok);
    await h.drain();
    h.settle(ok);
    await h.drain();

    expect(h.writes()).toBe(2);
    expect(controller.status().state).toBe('saved');
  });

  it('returns to idle-ready once the follow-up settles', async () => {
    const h = harness();
    const controller = createSaveController(h.ports);

    controller.requestSave();
    await h.drain();
    controller.requestSave();
    h.settle(ok);
    await h.drain();
    h.settle(ok);
    await h.drain();

    controller.requestSave();
    await h.drain();
    expect(h.writes()).toBe(3);
  });
});

describe('status', () => {
  it('reports saving, then saved', async () => {
    const h = harness();
    const controller = createSaveController(h.ports);
    expect(controller.status().state).toBe('idle');

    controller.requestSave();
    await h.drain();
    expect(controller.status().state).toBe('saving');

    h.settle(ok);
    await h.drain();
    expect(controller.status()).toEqual({ state: 'saved', failure: null });
  });

  it('notifies subscribers on every transition, and unsubscribes cleanly', async () => {
    const h = harness();
    const controller = createSaveController(h.ports);
    const listener = vi.fn();
    const off = controller.subscribe(listener);

    controller.requestSave();
    await h.drain();
    h.settle(ok);
    await h.drain();
    expect(listener).toHaveBeenCalledTimes(2); // saving, saved

    off();
    controller.requestSave();
    await h.drain();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('failure keeps the game playable (criterion 20)', () => {
  it('records the message AND the path, and never throws', async () => {
    const h = harness();
    const controller = createSaveController(h.ports);

    controller.requestSave();
    await h.drain();
    h.settle(failed);
    await h.drain();

    expect(controller.status()).toEqual({
      state: 'failed',
      failure: { message: DISK_FULL, path: SLOT_PATH },
    });
  });

  it('a rejected write becomes a failure, not an unhandled rejection', async () => {
    // A serialization throw is a §7.3 row of its own: log it, keep playing,
    // touch no existing file.
    const controller = createSaveController({
      write: () => Promise.reject(new Error('toSaveDocument exploded')),
      defer: (run) => run(),
    });

    controller.requestSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.status().state).toBe('failed');
    expect(controller.status().failure?.message).toContain('toSaveDocument exploded');
    expect(controller.status().failure?.path).toBeNull();
  });

  it('retries at the next trigger — a failure is never terminal', async () => {
    const h = harness();
    const controller = createSaveController(h.ports);

    controller.requestSave();
    await h.drain();
    h.settle(failed);
    await h.drain();
    expect(controller.status().state).toBe('failed');

    controller.requestSave();
    await h.drain();
    h.settle(ok);
    await h.drain();

    expect(controller.status().state).toBe('saved');
    expect(h.writes()).toBe(2);
  });
});
