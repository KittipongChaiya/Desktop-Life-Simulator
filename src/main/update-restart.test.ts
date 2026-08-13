/**
 * Restarting into an update. Phase-15 — ADR-025 §5, §1.
 *
 * §5 gives this three rules and they compose into one sequence: the player
 * consents, the in-flight save finishes, and only then does the application
 * hand itself to the installer.
 *
 * The ordering is the whole test file. "An update restart requested mid-save
 * waits for the write and never truncates it" is a claim about which of two
 * things happens first, and nothing upstream of here can make it.
 */

import { describe, expect, it, vi } from 'vitest';

import type { SaveWaitOutcome } from './save-triggers';
import { createRestartGate, type RestartGateDeps } from './update-restart';

const SAVE_TIMEOUT_MS = 3_000;

function harness(overrides: Partial<RestartGateDeps> = {}) {
  const order: string[] = [];

  const deps: RestartGateDeps = {
    isUpdateReady: () => true,
    saveTimeoutMs: SAVE_TIMEOUT_MS,
    saveAndWait: () => {
      order.push('save');
      return Promise.resolve<SaveWaitOutcome>('saved');
    },
    installAndRestart: () => {
      order.push('install');
    },
    ...overrides,
  };

  return { gate: createRestartGate(deps), order };
}

describe('the sequence', () => {
  it('saves before it installs, which is the one thing that matters', async () => {
    // ADR-025 §5. A restart that handed off first would leave a half-written
    // save behind a process that is being replaced.
    const h = harness();

    await h.gate.request();

    expect(h.order).toEqual(['save', 'install']);
  });

  it('reports how the save went, rather than only that it restarted', async () => {
    const h = harness();

    await expect(h.gate.request()).resolves.toEqual({ restarted: true, save: 'saved' });
  });

  it('asks for the save on the quit deadline it was given', async () => {
    const saveAndWait = vi.fn(() => Promise.resolve<SaveWaitOutcome>('saved'));
    const h = harness({ saveAndWait });

    await h.gate.request();

    expect(saveAndWait).toHaveBeenCalledWith(SAVE_TIMEOUT_MS);
  });
});

describe('when there is nothing to install', () => {
  it('refuses, and does not restart', async () => {
    const h = harness({ isUpdateReady: () => false });

    await expect(h.gate.request()).resolves.toEqual({
      restarted: false,
      reason: 'nothing-ready',
    });
    expect(h.order).toEqual([]);
  });

  it('does not even ask for a save', async () => {
    // A save has a real cost — it blocks the renderer's frame to serialize.
    // Paying it for a restart that cannot happen would be a wasted stutter,
    // and the readiness check is free.
    const saveAndWait = vi.fn(() => Promise.resolve<SaveWaitOutcome>('saved'));
    const h = harness({ isUpdateReady: () => false, saveAndWait });

    await h.gate.request();

    expect(saveAndWait).not.toHaveBeenCalled();
  });
});

describe('a save that does not settle', () => {
  it('still restarts, because a wedged renderer must not veto an update', async () => {
    // ADR-025 §5 caps the wait at three seconds so a wedged renderer "can
    // delay a restart but never prevent it", and the quit path already makes
    // exactly this call. Nothing is lost that atomic writes did not already
    // protect: the previous good save is on disk, so the cost is the last few
    // seconds of play, never the farm (`SAVE_FORMAT.md` §7.1).
    const h = harness({ saveAndWait: () => Promise.resolve<SaveWaitOutcome>('timed-out') });

    const result = await h.gate.request();

    expect(result).toEqual({ restarted: true, save: 'timed-out' });
    expect(h.order).toEqual(['install']);
  });

  it('still restarts when there was no renderer to ask', async () => {
    // 'unavailable' means a boot that never registered a listener. There is no
    // world to serialize, so there is nothing to wait for and nothing to lose.
    const h = harness({ saveAndWait: () => Promise.resolve<SaveWaitOutcome>('unavailable') });

    await expect(h.gate.request()).resolves.toEqual({ restarted: true, save: 'unavailable' });
  });

  it('restarts even if the save throws', async () => {
    // The save path is already the most defended code in the project. If it
    // manages to throw here, the previous save is still on disk and refusing
    // to restart would strand the player on a build they asked to leave.
    const h = harness({ saveAndWait: () => Promise.reject(new Error('EBUSY')) });

    const result = await h.gate.request();

    expect(result).toEqual({ restarted: true, save: 'unavailable' });
    expect(h.order).toEqual(['install']);
  });
});

describe('a second request', () => {
  it('does not fire a second save or a second install', async () => {
    // The prompt is a button and buttons get double-clicked. Two overlapping
    // restarts would mean two quit saves racing each other into the same file
    // while the process is being handed to an installer.
    const h = harness();

    const [first, second] = await Promise.all([h.gate.request(), h.gate.request()]);

    expect(h.order).toEqual(['save', 'install']);
    expect(first).toEqual({ restarted: true, save: 'saved' });
    expect(second).toEqual({ restarted: false, reason: 'already-restarting' });
  });

  it('is refused after the first one completed, not just while it runs', async () => {
    // Once `installAndRestart` has been called the process is on its way out.
    // Anything that arrives afterwards is a click that beat the shutdown.
    const h = harness();
    await h.gate.request();

    await expect(h.gate.request()).resolves.toEqual({
      restarted: false,
      reason: 'already-restarting',
    });
    expect(h.order).toEqual(['save', 'install']);
  });
});
