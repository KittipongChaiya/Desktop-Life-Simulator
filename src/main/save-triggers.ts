/**
 * When a save is asked for. Phase-07e — `SAVE_FORMAT.md` §7.2.
 *
 * Main owns the TRIGGERS; the renderer owns the DOCUMENT. Every trigger here
 * — the 60-second cadence, quit, close-to-tray — becomes the same
 * `save:requested` event the renderer already answers at its one
 * serialization site (phase-07c). Nothing about a save's content is knowable
 * from this file, which is the point: adding a trigger never touches
 * serialization, and changing serialization never touches triggers.
 *
 * Coalescing deliberately does NOT live here. Main cannot see whether a write
 * is in flight; the renderer can, and does (`save-controller.ts`). Suppressing
 * in both places would drop the quit save queued behind an autosave — the one
 * save that has no next chance.
 *
 * No `electron` import, and every timer is injected, so the cadence and the
 * quit deadline are testable without a running app (the `save-store.ts`
 * pattern).
 */

import { AUTOSAVE_INTERVAL_TICKS, TICK_MS } from '../shared/constants';

/**
 * The autosave period in wall-clock milliseconds.
 *
 * DERIVED from the tick constant rather than restating "60 s": `SAVE_FORMAT.md`
 * §7.2 specifies 1,200 ticks, and a wall-clock timer is how main — which has
 * no tick — honours it. The two can never drift apart.
 */
export const AUTOSAVE_INTERVAL_MS = AUTOSAVE_INTERVAL_TICKS * TICK_MS;

/** How a `fireAndWait` ended. */
export type SaveWaitOutcome =
  /** The renderer's write settled — succeeded or failed, but it happened. */
  | 'saved'
  /** The deadline passed first. Quit proceeds; the previous save is intact. */
  | 'timed-out'
  /** There was no renderer to ask — a boot failure, or the window is gone. */
  | 'unavailable';

export interface SaveCoordinatorPorts {
  /**
   * Sends the one `save:requested` event.
   *
   * Returns false when no renderer can receive it, which is a real state:
   * a boot that failed to load never registered a listener, and asking a
   * world that does not exist to save itself would be asking to overwrite a
   * save we could not read.
   */
  request(): boolean;
  /** Starts a repeating timer. Returns its canceller. */
  startInterval(handler: () => void, intervalMs: number): () => void;
  /** Starts a one-shot timer. Returns its canceller. */
  startTimeout(handler: () => void, delayMs: number): () => void;
}

export interface SaveCoordinator {
  /** Begins the autosave cadence. Idempotent. */
  start(): void;
  /** Ends the cadence. Idempotent. */
  stop(): void;
  /** One discrete trigger — fire and forget (close-to-tray, a transaction). */
  fire(): void;
  /**
   * Fires, then resolves when the renderer's write settles or the deadline
   * passes — the quit path, which must block shutdown without ever being able
   * to prevent it.
   */
  fireAndWait(timeoutMs: number): Promise<SaveWaitOutcome>;
  /** Called by the `save:write` handler once a write settles, either way. */
  writeSettled(): void;
}

export function createSaveCoordinator(ports: SaveCoordinatorPorts): SaveCoordinator {
  let stopInterval: (() => void) | null = null;
  // Every outstanding waiter. Ordinarily at most one (quit), but a tray quit
  // racing a window close would produce two, and both must be released.
  const waiting = new Set<(outcome: SaveWaitOutcome) => void>();

  const settleAll = (outcome: SaveWaitOutcome): void => {
    const pending = [...waiting];
    waiting.clear();
    for (const resolve of pending) resolve(outcome);
  };

  return {
    start() {
      if (stopInterval !== null) return;
      stopInterval = ports.startInterval(() => {
        ports.request();
      }, AUTOSAVE_INTERVAL_MS);
    },

    stop() {
      stopInterval?.();
      stopInterval = null;
    },

    fire() {
      ports.request();
    },

    fireAndWait(timeoutMs) {
      if (!ports.request()) return Promise.resolve<SaveWaitOutcome>('unavailable');

      return new Promise<SaveWaitOutcome>((resolve) => {
        const cancelDeadline = ports.startTimeout(() => {
          settleAll('timed-out');
        }, timeoutMs);

        waiting.add((outcome) => {
          cancelDeadline();
          resolve(outcome);
        });
      });
    },

    writeSettled() {
      settleAll('saved');
    },
  };
}
