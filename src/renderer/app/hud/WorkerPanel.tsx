/**
 * Worker panel. Phase-06e — FarmControls grown up.
 *
 * The worker count, the hire button, and an expandable list of every worker
 * with its current state. Hiring shows its real §4.1 cost and disables when
 * the wallet cannot cover it — the same validator the dispatch runs decides,
 * and the button merely reflects it (ADR-010 §6: the UI never invents rules,
 * it reads slices and submits).
 *
 * The build button moved to the ShopPanel with the rest of the purchases.
 */

import { hireCost } from '@sim/commands/worker-commands';
import { useState, type ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';
import { usePlayer } from '../store-context';

import styles from './WorkerPanel.module.css';
import { WorkerRoles } from './WorkerRoles';

/** Human labels for the FSM states — calm words, not jargon. */
const STATE_LABELS: Record<string, string> = {
  idle: 'Waiting',
  moving: 'Walking',
  working: 'Working',
  seekingRest: 'Tired',
  rest: 'Resting',
};

export function WorkerPanel(): ReactNode {
  const workers = useSlice('workers');
  const wallet = useSlice('wallet');
  const player = usePlayer();
  const [open, setOpen] = useState(false);

  const cost = hireCost(workers.length);
  const affordable = wallet.coins >= cost;

  return (
    <div className={styles['container']} data-interactive data-testid="worker-panel">
      <div className={styles['row']}>
        <button
          type="button"
          className={styles['countToggle']}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {workers.length} worker{workers.length === 1 ? '' : 's'}
        </button>
        <button
          type="button"
          className={affordable ? styles['hire'] : styles['hireDisabled']}
          disabled={!affordable}
          title={affordable ? 'Hire a worker' : `Needs ${cost.toLocaleString()} coins`}
          onClick={() => {
            // Validation decides; an unaffordable click never reaches here
            // because the button is disabled off the same numbers.
            player.submit({ type: 'hireWorker' });
          }}
        >
          Hire · {cost.toLocaleString()}g
        </button>
      </div>

      {open && (
        <div className={styles['panel']}>
          {workers.length === 0 ? (
            <div className={styles['empty']}>No workers yet — sell a harvest first.</div>
          ) : (
            <>
              {/* Roles first: a player opening this panel to change how a
                  worker behaves should not have to scroll past its state to
                  find the control that changes it (phase-14d). */}
              <WorkerRoles />
              <ul className={styles['list']}>
                {workers.map((worker) => (
                  <li key={worker.id} className={styles['workerRow']}>
                    <span>Worker {worker.id}</span>
                    <span className={styles['state']}>
                      {STATE_LABELS[worker.state] ?? worker.state}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
