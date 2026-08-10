/**
 * Assigning roles, from the worker panel. Phase-14d — ADR-024 §2, §4.
 *
 * The player-facing end of the scheduling pipeline. It shows what each worker
 * is set to and lets that be changed, and it does so by **dispatching a
 * command** (ADR-010 §1) — a schedule is simulation state, so this control has
 * no write path of its own and the same validator that would reject a replayed
 * command rejects this one.
 *
 * ## Roles only. Zones are not here
 *
 * ADR-024 §2 lists both, and only one is a panel control. A zone is a set of
 * TILES, so choosing one is a map interaction — dragging a rectangle over the
 * farm — not a dropdown. The command exists (`setWorkerZone`) and is tested;
 * what is missing is a tile-picking mode in the renderer, which is a
 * different piece of work in a different layer.
 *
 * Shipping a half-answer here — a text box of tile indices, say — would be
 * worse than shipping none: it would look like the feature and be unusable.
 * Recorded in the phase doc rather than left as a gap someone rediscovers.
 */

import { asContentId, asWorkerId } from '../../../shared/ids';
import { useSlice } from '../hooks/use-slice';
import { usePlayer } from '../store-context';

import styles from './WorkerPanel.module.css';

/**
 * The roles a player may choose, with the labels they read.
 *
 * Hardcoded rather than projected from the registry, and that is a limitation
 * worth naming: a content source can register a role today and no panel will
 * offer it. Closing that means a `roles` snapshot slice, which is a change to
 * the sim→view boundary rather than to this component.
 */
const ROLE_CHOICES: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'core:farmhand', label: 'Farmhand' },
  { id: 'core:harvester', label: 'Harvester' },
  { id: 'core:groundskeeper', label: 'Groundskeeper' },
];

export function WorkerRoles(): React.JSX.Element | null {
  const workers = useSlice('workers');
  const player = usePlayer();

  if (workers.length === 0) return null;

  return (
    <>
      {workers.map((worker) => (
        <div className={styles['row']} key={`role-${String(worker.id)}`}>
          <label className={styles['name']} htmlFor={`role-${String(worker.id)}`}>
            Worker {worker.id}
          </label>
          <select
            id={`role-${String(worker.id)}`}
            // `role` is null for a schedule no role matches — a player who
            // edited one directly. Shown as "Custom" rather than silently
            // snapping the dropdown to something they did not choose.
            value={worker.role ?? 'custom'}
            onChange={(event) => {
              const chosen = event.target.value;
              if (chosen === 'custom') return;
              // Branded at the boundary: the view carries plain numbers and
              // strings (ADR-005 §2), and the command wants the branded types.
              player.submit({
                type: 'assignRole',
                worker: asWorkerId(worker.id),
                role: asContentId(chosen),
              });
            }}
          >
            {worker.role === null && <option value="custom">Custom</option>}
            {ROLE_CHOICES.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </>
  );
}
