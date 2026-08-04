/**
 * Command monitor (F5). Phase-07.8f, ADR-018 §8/§9.
 *
 * SUBSCRIBES, never polls — `useSyncExternalStore` over the ring, so it
 * re-renders exactly when a command is observed (criterion 9).
 *
 * NO LIVE QUEUE DEPTH, deliberately. The depth changes every tick, so showing
 * it live would need a timer running through an idle farm — and it is already
 * on the F3 overlay (`sim.commandQueue`, 07.8a). Each row instead carries the
 * depth AT ITS OWN DISPATCH, which answers the more useful question — what was
 * the backlog when this command was submitted — and costs nothing to keep.
 *
 * `data-interactive` for the reason the event monitor documents: without it a
 * click on a filter is a click on the farm.
 */

import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';

import { CommandOutcome, type CommandRing } from '../commands/ring';

import styles from './CommandMonitor.module.css';

const OUTCOMES: readonly CommandOutcome[] = [
  CommandOutcome.Accepted,
  CommandOutcome.Rejected,
  CommandOutcome.Failed,
];

export interface CommandMonitorProps {
  readonly visible: boolean;
  readonly ring: CommandRing;
}

export function CommandMonitor({ visible, ring }: CommandMonitorProps): ReactNode {
  const [muted, setMuted] = useState<readonly string[]>([]);

  const subscribe = useCallback((onChange: () => void) => ring.subscribe(onChange), [ring]);
  const getEntries = useCallback(() => ring.entries(), [ring]);
  const entries = useSyncExternalStore(subscribe, getEntries, getEntries);

  const toggle = (outcome: string): void => {
    setMuted((current) =>
      current.includes(outcome) ? current.filter((o) => o !== outcome) : [...current, outcome],
    );
  };

  if (!visible) return null;

  const tally = ring.tally();
  const shown = entries.filter((entry) => !muted.includes(entry.outcome));

  return (
    <div className={styles['monitor']} data-interactive data-testid="command-monitor">
      <h2 className={styles['heading']} data-testid="command-monitor-heading">
        Commands · {ring.observed()} observed · {tally.accepted} accepted · {tally.rejected}{' '}
        rejected · {tally.failed} failed
      </h2>

      <div className={styles['filters']}>
        {OUTCOMES.map((outcome) => (
          <button
            key={outcome}
            type="button"
            className={muted.includes(outcome) ? styles['chipMuted'] : styles['chip']}
            onClick={() => {
              toggle(outcome);
            }}
          >
            {outcome}
          </button>
        ))}
        <button
          type="button"
          className={styles['chip']}
          onClick={() => {
            ring.clear();
          }}
        >
          Clear
        </button>
      </div>

      {shown.length === 0 ? (
        <p className={styles['empty']}>No commands observed yet.</p>
      ) : (
        <ol className={styles['list']}>
          {[...shown].reverse().map((entry) => (
            <li key={entry.seq} className={styles['row']} data-testid="command-row">
              <span className={styles['tick']}>t{entry.tick}</span>
              <span className={styles[entry.outcome] ?? styles['accepted']}>{entry.outcome}</span>
              <span className={styles['type']}>{entry.type}</span>
              <span className={styles['detail']}>
                {entry.detail === '' ? entry.source : `${entry.source} · ${entry.detail}`}
                {entry.dispatchMs === null ? '' : ` · ${entry.dispatchMs.toFixed(2)} ms`}
                {` · q${String(entry.queueDepth)}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
