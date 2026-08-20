/**
 * Ending a farm. ADR-045.
 *
 * The button's safety catch is tested in `settings-ui.test.tsx`, where the
 * two presses live. This is about what happens after the second one — the
 * ordering the controller owns, and the two ways it can go wrong that nobody
 * would see on screen.
 */

import { describe, expect, it } from 'vitest';

import { createNewGameController, type NewGameControllerPorts } from './new-game-controller';

interface Recorder extends NewGameControllerPorts {
  readonly archives: () => number;
  readonly reloads: () => number;
  /** Resolves the pending archive, so ordering can be observed mid-flight. */
  readonly settle: (ok: boolean) => Promise<void>;
}

/** Ports whose archive is held open until the test lets it finish. */
function heldPorts(): Recorder {
  let archives = 0;
  let reloads = 0;
  let release: ((value: { ok: boolean }) => void) | null = null;

  return {
    archive: () => {
      archives += 1;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    reload: () => {
      reloads += 1;
    },
    archives: () => archives,
    reloads: () => reloads,
    settle: async (ok) => {
      release?.({ ok });
      // Two turns: one for the `then`, one for whatever it scheduled.
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('startNewGame', () => {
  it('archives before it reloads, and only reloads if that worked', async () => {
    // THE ordering. A reload before the files moved re-boots into the same
    // farm and looks like a button that does nothing; a reload after a FAILED
    // archive does the same thing while having lost the failure.
    const ports = heldPorts();
    const controller = createNewGameController(ports);

    controller.startNewGame();

    expect(ports.archives()).toBe(1);
    expect(ports.reloads(), 'reloaded before the archive settled').toBe(0);

    await ports.settle(true);

    expect(ports.reloads()).toBe(1);
  });

  it('does not reload when the archive refused', async () => {
    const ports = heldPorts();
    const controller = createNewGameController(ports);

    controller.startNewGame();
    await ports.settle(false);

    expect(ports.reloads()).toBe(0);
    expect(controller.status()).toBe('failed');
  });

  it('treats a rejected invoke as a refusal rather than an unhandled error', async () => {
    // Main never answered — the window is going away, or the handler threw.
    // Same outcome for the player: nothing moved, keep playing.
    let reloads = 0;
    const controller = createNewGameController({
      archive: () => Promise.reject(new Error('no handler')),
      reload: () => {
        reloads += 1;
      },
    });

    controller.startNewGame();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.status()).toBe('failed');
    expect(reloads).toBe(0);
  });

  it('ignores a second press while the first is in flight', async () => {
    // Not a race worth queueing: archiving twice would move an empty
    // directory aside and leave a stray dated folder behind.
    const ports = heldPorts();
    const controller = createNewGameController(ports);

    controller.startNewGame();
    controller.startNewGame();
    controller.startNewGame();

    expect(ports.archives()).toBe(1);

    await ports.settle(true);

    expect(ports.reloads()).toBe(1);
  });

  it('starts idle and reports working while it waits', () => {
    const ports = heldPorts();
    const controller = createNewGameController(ports);

    expect(controller.status()).toBe('idle');
    controller.startNewGame();
    expect(controller.status()).toBe('working');
  });

  it('notifies subscribers on every transition, and stops after teardown', async () => {
    const ports = heldPorts();
    const controller = createNewGameController(ports);
    let notifications = 0;
    const stop = controller.subscribe(() => {
      notifications += 1;
    });

    controller.startNewGame();
    expect(notifications).toBe(1);

    stop();
    await ports.settle(false);

    expect(notifications, 'notified after teardown').toBe(1);
  });
});
