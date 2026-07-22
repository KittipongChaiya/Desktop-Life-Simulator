/**
 * Expanded-mode farm controls. Phase-04c, phase-05d.
 *
 * The worker count and hire button — the interface for v0.1's central unlock
 * (`VISION.md` §6.3) — plus the build button that arms a storage shed for
 * placement (phase-05d). Cost follows `GAME_DESIGN.md` §4.1; with no wallet
 * until phase-06 every hire and build is affordable, so the buttons show the
 * price the economy will later charge without disabling yet.
 *
 * The build button reflects placement mode, which is shared state the renderer
 * also reads to draw the ghost. It subscribes directly (not through a snapshot
 * slice) because placement mode is presentation state, never simulation state.
 */

import { hireCost } from '@sim/commands/worker-commands';
import { CORE_STORAGE_SHED } from '@sim/content/buildings';
import { useSyncExternalStore, type ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';
import { usePlacement, usePlayer } from '../store-context';

import styles from './FarmControls.module.css';

export function FarmControls(): ReactNode {
  const workers = useSlice('workers');
  const player = usePlayer();
  const placement = usePlacement();
  const cost = hireCost(workers.length);

  const active = useSyncExternalStore(
    (listener) => placement.subscribe(listener),
    () => placement.active(),
    () => placement.active(),
  );
  const placingShed = active === CORE_STORAGE_SHED;

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
      <button
        type="button"
        className={placingShed ? styles['buildActive'] : styles['build']}
        aria-pressed={placingShed}
        onClick={() => placement.toggle(CORE_STORAGE_SHED)}
      >
        {placingShed ? 'Placing shed…' : 'Build shed'}
      </button>
    </div>
  );
}
