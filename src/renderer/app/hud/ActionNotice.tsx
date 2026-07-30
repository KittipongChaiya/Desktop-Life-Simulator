/**
 * Why nothing happened. Phase-07.5i — the player-facing half of
 * `action-feedback.ts`.
 *
 * A rejected action used to produce only a brief amber tile outline, which on a
 * 220-pixel overlay reads as "the click did not register". This says why, in one
 * sentence, and then gets out of the way.
 *
 * Transient and pointer-transparent, exactly like the companion toast: a
 * failure is inline and never modal (`GAME_DESIGN.md` §10.1 rule 1), and a
 * message that intercepted the next click would make the problem worse.
 *
 * Shown in every presence mode except work mode — in work mode the player is
 * not acting on the farm, so there is nothing to explain.
 */

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { FEEDBACK_VISIBLE_MS } from '../action-feedback';
import { useActionFeedback, useCompanion } from '../store-context';

import styles from './ActionNotice.module.css';

export function ActionNotice(): ReactNode {
  const feedback = useActionFeedback();
  const companion = useCompanion();

  const message = useSyncExternalStore(
    (listener) => feedback.subscribe(listener),
    () => feedback.message(),
    () => feedback.message(),
  );

  const workMode = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.workMode(),
    () => companion.workMode(),
  );

  useEffect(() => {
    if (message === null) return undefined;
    const timer = setTimeout(() => feedback.clear(), FEEDBACK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, feedback]);

  if (message === null || workMode) return null;

  return (
    <div className={styles['notice']} role="status" data-testid="action-notice">
      {message}
    </div>
  );
}
