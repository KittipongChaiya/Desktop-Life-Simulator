/**
 * The "Start new game" control. ADR-045 §6.
 *
 * ## Why it arms instead of confirming
 *
 * This is the first control in the application that ends something, and there
 * is no confirmation primitive anywhere in `src/` to reach for — no modal, no
 * `window.confirm`, nothing two-step. That absence is not an oversight to
 * correct here:
 *
 * - A modal in a frameless, always-on-top overlay is the wrong shape. The
 *   window is a companion sitting at the edge of somebody's screen, not an
 *   application that may seize the foreground.
 * - `window.confirm` blocks the renderer thread, and the simulation is on it.
 *   The farm would freeze behind the dialog.
 *
 * So the button arms on the first press and fires on the second. It follows
 * the judgement `SourcesSection` already makes — **a control should not
 * invite a click it will refuse** — by inviting the second click honestly and
 * saying exactly what it is about to do.
 *
 * ## The armed label has to FIT
 *
 * The first version said "Confirm — end this farm", which read well and was
 * half again wider than the panel: it spilled out over the world, and pushed
 * "New game" into wrapping onto two lines. No test noticed, because every one
 * of them asks for the button by its accessible name and gets it wherever it
 * happens to be drawn.
 *
 * Looking at the running application is what caught it. The label is now the
 * longest thing that fits beside a name in a 200px panel, and the sentence
 * that used to be in it lives in the hint below, where there is room.
 *
 * ## It disarms on its own
 *
 * An armed button that stays armed is a trap: a player who walks away, comes
 * back and clicks what they think is "Start new game" would get the second
 * press instead of the first. So arming expires, and closing the panel
 * disarms immediately — closing a panel is how a person says "not this".
 *
 * ## Nothing here knows what a world is
 *
 * The controller has two ports, archive and reload, and no `World`. That is
 * deliberate and structural (ADR-018): a reset button with access to the
 * stores is the one that eventually clears them directly.
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { NewGameController } from '../new-game-controller';

import styles from './SettingsPanel.module.css';

/**
 * How long the armed state lasts.
 *
 * Long enough to read the warning and mean it; short enough that a player who
 * left the panel open and went to make tea does not come back to a live
 * trigger. Not a preference — there is nothing here a player would want to
 * tune, and a configurable safety catch is a safety catch somebody switches
 * off.
 */
const ARMED_TIMEOUT_MS = 5_000;

export interface NewGameRowProps {
  readonly newGame: NewGameController;
  /**
   * Whether the settings panel is open. Closing it disarms — see the header.
   *
   * A prop rather than something read from the DOM, because the panel already
   * owns this state and two sources for one fact is how they disagree.
   */
  readonly panelOpen: boolean;
}

export function NewGameRow({ newGame, panelOpen }: NewGameRowProps): ReactNode {
  const [armed, setArmed] = useState(false);

  const state = useSyncExternalStore(
    (listener) => newGame.subscribe(listener),
    () => newGame.status(),
    () => newGame.status(),
  );

  // Disarm when the panel closes. Runs on close rather than on open so that
  // re-opening a panel never shows a control mid-way through a decision the
  // player has already walked away from.
  useEffect(() => {
    if (!panelOpen) setArmed(false);
  }, [panelOpen]);

  // The expiry. Re-armed presses restart it, because the effect re-runs on
  // every transition into `armed`.
  useEffect(() => {
    if (!armed) return undefined;
    const handle = setTimeout(() => {
      setArmed(false);
    }, ARMED_TIMEOUT_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [armed]);

  // FAILURE OUTRANKS EVERYTHING. If main could not move the files, nothing
  // happened at all, and a button still reading "Start new game" would invite
  // the player to try the thing that just silently did nothing.
  if (state === 'failed') {
    return (
      <div className={styles['row']}>
        <span className={styles['name']}>New game</span>
        <button type="button" className={styles['action']} disabled>
          Couldn’t start one
        </button>
      </div>
    );
  }

  const working = state === 'working';

  return (
    <>
      <div className={styles['row']}>
        <span className={styles['name']}>New game</span>
        <button
          type="button"
          className={styles['action']}
          // The armed state IS the pressed state, which is what lets a screen
          // reader announce the change rather than only the new label.
          aria-pressed={armed}
          disabled={working}
          onClick={() => {
            if (working) return;
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            newGame.startNewGame();
          }}
        >
          {working ? 'Starting…' : armed ? 'End this farm' : 'Start new game'}
        </button>
      </div>
      {armed && (
        <div className={styles['hint']}>
          Your farm is kept: everything moves to a dated folder beside your save, and the game
          starts fresh.
        </div>
      )}
    </>
  );
}
