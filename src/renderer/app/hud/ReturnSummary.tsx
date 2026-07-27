/**
 * The return summary. Phase-07e — `GAME_DESIGN.md` §9.4, criterion 24.
 *
 * What happened while the game was closed: time away, crops harvested, coins
 * earned, and what stopped progress. It is a REPORT, not a reward screen —
 * no celebration, no claim button, nothing to dismiss before playing.
 *
 * Dismissible and never modal (§10.1 rule 1): it sits in a corner, the world
 * runs behind it, every control stays live, and it steals no focus.
 *
 * Work mode DEFERS it rather than eating it (ADR-014): the report stays held
 * by the controller while the HUD is hidden, so leaving work mode shows the
 * summary the player never got to read. Only the dismiss button clears it.
 */

import { useSyncExternalStore, type ReactNode } from 'react';

import { formatBlocker, formatTimeAway } from '../return-summary';
import { useCompanion, useReturnSummary } from '../store-context';

import styles from './ReturnSummary.module.css';

export function ReturnSummary(): ReactNode {
  const summary = useReturnSummary();
  const companion = useCompanion();

  const report = useSyncExternalStore(
    (listener) => summary.subscribe(listener),
    () => summary.report(),
    () => summary.report(),
  );

  const workMode = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.workMode(),
    () => companion.workMode(),
  );

  if (report === null || workMode) return null;

  const blocker = formatBlocker(report);

  return (
    <div className={styles['panel']} role="status" data-interactive data-testid="return-summary">
      <div className={styles['headline']}>Away for {formatTimeAway(report.elapsedTicks)}</div>
      <dl className={styles['figures']}>
        <div className={styles['figure']}>
          <dt>Harvested</dt>
          <dd>{report.harvests}</dd>
        </div>
        <div className={styles['figure']}>
          <dt>Earned</dt>
          <dd>{report.coinsEarned}</dd>
        </div>
      </dl>
      {blocker !== null && <div className={styles['blocker']}>{blocker}</div>}
      <button
        type="button"
        className={styles['dismiss']}
        onClick={() => {
          summary.dismiss();
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
