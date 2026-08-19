/**
 * Assigning roles, from the worker panel. Phase-14d — ADR-024 §2, §4.
 *
 * The player-facing end of the scheduling pipeline. It shows what each worker
 * is set to and lets that be changed, and it does so by **dispatching a
 * command** (ADR-010 §1) — a schedule is simulation state, so this control has
 * no write path of its own and the same validator that would reject a replayed
 * command rejects this one.
 *
 * ## Roles, and the button that arms zone painting
 *
 * ADR-024 §2 lists both. A zone is a set of TILES, so choosing one is a map
 * interaction — dragging a rectangle over the farm — not a dropdown, and this
 * panel deliberately shipped roles alone rather than offering a text box of
 * tile indices that would look like the feature and be unusable.
 *
 * Phase-48 built the map interaction (`zone-painting.ts`), so what lives here
 * is only the ARMING: a press-to-paint, press-again-to-stop button of exactly
 * the same shape as the build button, because it is exactly the same kind of
 * control. Everything after the press happens on the world, not in the DOM.
 *
 * ## Painting REPLACES the zone, and the button says so
 *
 * `setWorkerZone` replaces a zone wholesale, and seeding the mode with the
 * zone a worker already has would need that zone on the sim→view boundary —
 * which means comparing a tile SET per worker per tick to decide whether to
 * republish, and ADR-005 §2 is explicit that a slice republishing needlessly
 * is a defect. A few hundred tiles times a few workers times twenty times a
 * second is a real cost to pay for an append.
 *
 * So a painting session starts empty and the label reads "Set zone" rather
 * than "Edit zone". The controller already accepts a seed, so the day the
 * boundary carries a zone cheaply this becomes additive without changing
 * anything else.
 */

import { asContentId, asWorkerId } from '../../../shared/ids';
import { useSlice } from '../hooks/use-slice';
import { usePlayer, useZonePainting } from '../store-context';

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
  const zone = useZonePainting();

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
          <button
            type="button"
            className={styles['action']}
            aria-pressed={zone.active() === asWorkerId(worker.id)}
            // A STABLE accessible name while the visible text flips, which is
            // the lesson `placement.spec.ts` already records: a control located
            // by its label becomes unfindable the moment it changes state.
            aria-label={`Set zone for worker ${String(worker.id)}`}
            title="Drag a rectangle on the farm to set where this worker may work. Hold Shift to erase."
            onClick={() => {
              zone.toggle(asWorkerId(worker.id));
            }}
          >
            {zone.active() === asWorkerId(worker.id) ? 'Painting…' : 'Set zone'}
          </button>
        </div>
      ))}
    </>
  );
}
