/**
 * Selected-worker panel. Phase-04c.
 *
 * Shows the state and current task of the worker the player clicked. Selection
 * is presentation state held outside React (shared with the renderer's box), so
 * it is read through `useSyncExternalStore`; the worker's data comes from the
 * `workers` snapshot slice. Renders nothing when nothing is selected.
 */

import { WorkerState, WorkerTaskKind } from '@sim/world/worker';
import { useSyncExternalStore, type ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';
import { useWorkerSelection } from '../store-context';

import styles from './WorkerInfo.module.css';

const STATE_LABEL: Readonly<Record<WorkerState, string>> = {
  [WorkerState.Idle]: 'Idle',
  [WorkerState.Moving]: 'Walking',
  [WorkerState.Working]: 'Working',
  [WorkerState.SeekingRest]: 'Resting',
  [WorkerState.Rest]: 'Resting',
  // Phase-28. A worker who is Away is absent from the workers slice entirely
  // (ADR-038 §2), so this label is unreachable through selection today — it
  // exists because the record is exhaustive, which is what caught the missing
  // case the moment the state was added.
  [WorkerState.Away]: 'Away',
};

const TASK_LABEL: Readonly<Record<WorkerTaskKind, string>> = {
  [WorkerTaskKind.Harvest]: 'Harvesting',
  [WorkerTaskKind.Plant]: 'Planting',
  [WorkerTaskKind.Till]: 'Tilling',
  // Phase-26. The two legs read differently on purpose: a player watching a
  // worker cross the farm should be able to tell "going to fetch" from
  // "carrying it there" without opening anything.
  [WorkerTaskKind.Haul]: 'Collecting',
  [WorkerTaskKind.Deliver]: 'Delivering',
  [WorkerTaskKind.Gather]: 'Gathering',
};

function useSelectedId(): number | null {
  const selection = useWorkerSelection();
  return useSyncExternalStore(
    (listener) => selection.subscribe(listener),
    () => selection.selected(),
    () => selection.selected(),
  );
}

export function WorkerInfo(): ReactNode {
  const selectedId = useSelectedId();
  const workers = useSlice('workers');

  if (selectedId === null) return null;
  const worker = workers.find((candidate) => candidate.id === selectedId);
  if (worker === undefined) return null;

  return (
    <div className={styles['panel']} data-interactive data-testid="worker-info">
      <span className={styles['title']}>Worker {worker.id}</span>
      <span className={styles['field']}>{STATE_LABEL[worker.state]}</span>
      <span className={styles['field']}>
        {worker.task === null ? 'No task' : TASK_LABEL[worker.task.kind]}
      </span>
      <span className={styles['muted']}>energy {worker.energy}</span>
    </div>
  );
}
