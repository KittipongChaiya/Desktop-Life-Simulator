/**
 * The save-failure notification. Phase-07e — `SAVE_FORMAT.md` §7.3,
 * acceptance criterion 20.
 *
 * A failed save is one of the very few genuine errors this product has, which
 * is why it is allowed the red `GAME_DESIGN.md` §10.1 rule 6 reserves — and
 * why it carries the PATH: "permission denied" is a shrug, the file name is
 * something a player can act on.
 *
 * It persists rather than auto-dismissing, unlike the companion toast. A mode
 * confirmation missed is nothing; a save failure missed is the player
 * trusting a save that is not there. It clears itself the moment a later save
 * succeeds, so a transient full disk resolves without anyone clicking.
 *
 * Shown in work mode too. Work mode hides the HUD to keep the desktop quiet;
 * silently withholding "your game is not being saved" is not quiet, it is
 * misleading (the CompanionToast precedent — mode-critical truth still shows).
 */

import { useSyncExternalStore, type ReactNode } from 'react';

import { useSave } from '../store-context';

import styles from './SaveNotice.module.css';

export function SaveNotice(): ReactNode {
  const save = useSave();

  const status = useSyncExternalStore(
    (listener) => save.subscribe(listener),
    () => save.status(),
    () => save.status(),
  );

  if (status.state !== 'failed' || status.failure === null) return null;

  return (
    <div className={styles['notice']} role="alert" data-testid="save-notice">
      <strong className={styles['headline']}>Save failed — your game is still running.</strong>
      <span className={styles['detail']}>{status.failure.message}</span>
      {status.failure.path !== null && (
        <span className={styles['path']}>{status.failure.path}</span>
      )}
    </div>
  );
}
