/**
 * Expanded-mode farm controls. Phase-04c.
 *
 * The worker count and the hire button — the interface for v0.1's central
 * unlock (`VISION.md` §6.3). Cost follows `GAME_DESIGN.md` §4.1; with no wallet
 * until phase-06 every hire is affordable, so the button never disables yet — it
 * shows the price the economy will later charge, at the affordability seam the
 * economy will fill in.
 */

import { hireCost } from '@sim/commands/worker-commands';
import type { ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';
import { usePlayer } from '../store-context';

import styles from './FarmControls.module.css';

export function FarmControls(): ReactNode {
  const workers = useSlice('workers');
  const player = usePlayer();
  const cost = hireCost(workers.length);

  return (
    <div className={styles['panel']} data-interactive>
      <span className={styles['count']}>
        {workers.length} worker{workers.length === 1 ? '' : 's'}
      </span>
      <button
        type="button"
        className={styles['hire']}
        onClick={() => {
          // Acceptance (queued) or a rejection both land here; hire never fails
          // in v0.1, so there is nothing to surface yet.
          player.submit({ type: 'hireWorker' });
        }}
      >
        Hire · {cost.toLocaleString()}g
      </button>
    </div>
  );
}
