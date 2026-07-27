/**
 * The renderer's save orchestration. Phase-07e — `SAVE_FORMAT.md` §7.2/§7.3.
 *
 * ONE write in flight, ever. Triggers that arrive while one is running
 * COALESCE into a single follow-up: three reasons to save inside one second
 * (the autosave tick, a worker hire, a building purchase) are still one farm,
 * and writing it three times would put three atomic sequences on the disk for
 * one state. Coalescing is not dropping, though — the follow-up runs, because
 * the trigger that arrives mid-write is often the quit save, the one save
 * with no next chance.
 *
 * Serialization is DEFERRED off the render path. Triggers reach here from
 * snapshot subscribers, which run inside `store.pump` — inside a frame. Every
 * write therefore starts in a later task, so JSON never spends a frame budget.
 *
 * A failure is survivable by construction (§7.3): it is recorded as status,
 * surfaced by the notification, and cleared by the next successful write. The
 * player keeps playing with in-memory state intact, which is the state that
 * matters.
 */

import type { SaveWriteOutcome } from '../../shared/ipc/contract';

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

/** What the write failed with, and where the player should go looking. */
export interface SaveFailure {
  readonly message: string;
  /**
   * The save file's path, when main got far enough to name it. Null when the
   * write never reached main at all — a serialization throw, where no file
   * was touched and there is nothing to point at.
   */
  readonly path: string | null;
}

export interface SaveStatus {
  readonly state: SaveState;
  readonly failure: SaveFailure | null;
}

export interface SaveControllerPorts {
  /**
   * Builds the document and writes it — the ONE serialization site (07c).
   * May reject; a rejection is a failure, never a crash.
   */
  write(): Promise<SaveWriteOutcome>;
  /** Runs work in a later task, off the render path. */
  defer(run: () => void): void;
}

export interface SaveController {
  /** Asks for a save. Safe from any trigger, at any time, however often. */
  requestSave(): void;
  status(): SaveStatus;
  /** Subscribes to status changes. Returns teardown. */
  subscribe(listener: () => void): () => void;
}

const IDLE: SaveStatus = { state: 'idle', failure: null };

export function createSaveController(ports: SaveControllerPorts): SaveController {
  const listeners = new Set<() => void>();
  let status: SaveStatus = IDLE;
  let inFlight = false;
  // At most ONE follow-up is remembered, however many triggers arrive — that
  // is precisely what "coalesced rather than queued" means.
  let followUp = false;

  const setStatus = (next: SaveStatus): void => {
    status = next;
    for (const listener of listeners) listener();
  };

  const run = (): void => {
    inFlight = true;
    ports.defer(() => {
      setStatus({ state: 'saving', failure: null });
      void ports
        .write()
        .then((outcome) => {
          setStatus(
            outcome.ok
              ? { state: 'saved', failure: null }
              : { state: 'failed', failure: { message: outcome.error, path: outcome.path } },
          );
        })
        .catch((thrown: unknown) => {
          // The write never reached main: nothing on disk was touched, so the
          // existing save is exactly as safe as it was a moment ago.
          setStatus({
            state: 'failed',
            failure: {
              message: thrown instanceof Error ? thrown.message : String(thrown),
              path: null,
            },
          });
        })
        .finally(() => {
          inFlight = false;
          if (!followUp) return;
          followUp = false;
          run();
        });
    });
  };

  return {
    requestSave() {
      if (inFlight) {
        followUp = true;
        return;
      }
      run();
    },

    status: () => status,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
