/**
 * Ending a farm and starting another. ADR-045.
 *
 * ## Why this is not part of the save controller
 *
 * `SaveController` exists to coalesce writes, and its contract is that asking
 * is _"safe from any trigger, at any time, however often"_. This is the exact
 * opposite operation: it happens once, deliberately, and the session does not
 * continue afterwards. Folding it in would put "end the farm" behind an
 * interface whose entire promise is that calling it repeatedly is harmless.
 *
 * ## What it does, and what it refuses to do
 *
 * Two ports and no cleverness. It asks main to archive the save files, and on
 * success it reloads the renderer — which re-runs `bootApplication()`, finds
 * no save, and takes the `saves.missing` branch that has built every new farm
 * since v0.1 (ADR-045 §3).
 *
 * **It does not touch the world.** ADR-018 named this exact hazard — _"the
 * first `reset world` button that clears stores directly is also the first bug
 * report nobody can reproduce"_ — and the reason this controller has no
 * access to a `World` is so that it cannot become one.
 *
 * ## Failure is a state a player can see
 *
 * If main could not move the files, nothing happened: the farm is exactly
 * where it was, and the session carries on. That has to be visible, because a
 * button that silently does nothing reads as a broken game rather than as a
 * refusal — so the status drives the label the way `SaveState` does.
 *
 * There is deliberately no success state. Success is a reload.
 */

/** Where a new-game attempt has got to. */
export type NewGameState =
  /** Nothing in progress. */
  | 'idle'
  /** Main is moving files; a reload follows if it works. */
  | 'working'
  /** Nothing moved. The farm is untouched and play continues. */
  | 'failed';

export interface NewGameControllerPorts {
  /**
   * Asks main to archive every save artifact. Resolves to what happened;
   * may also reject, which is the same outcome from the player's side.
   */
  archive(): Promise<{ readonly ok: boolean }>;
  /** Restarts the renderer, which rebuilds the world from an empty directory. */
  reload(): void;
}

export interface NewGameController {
  /**
   * Ends the current farm.
   *
   * Fire-and-forget by design: on success this process stops existing in its
   * current form, so there is nothing to await and nothing to return.
   */
  startNewGame(): void;
  status(): NewGameState;
  /** Subscribes to status changes. Returns teardown. */
  subscribe(listener: () => void): () => void;
}

export function createNewGameController(ports: NewGameControllerPorts): NewGameController {
  const listeners = new Set<() => void>();
  let status: NewGameState = 'idle';

  const setStatus = (next: NewGameState): void => {
    status = next;
    for (const listener of listeners) listener();
  };

  return {
    startNewGame() {
      // A second press while the first is in flight is ignored rather than
      // queued. Archiving twice would move an empty directory aside and leave
      // a stray archive folder behind for no reason.
      if (status === 'working') return;
      setStatus('working');

      void ports
        .archive()
        .then((outcome) => {
          if (!outcome.ok) {
            setStatus('failed');
            return;
          }
          // Deliberately no 'done' state: the reload IS the success, and
          // setting one would only ever be seen if the reload failed to
          // happen — a state that would then be a lie.
          ports.reload();
        })
        .catch(() => {
          // A rejected invoke means main never answered. Same outcome for the
          // player as an explicit failure: nothing moved, keep playing.
          setStatus('failed');
        });
    },

    status() {
      return status;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
