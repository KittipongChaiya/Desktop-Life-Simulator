/**
 * Worker selection — presentation state. Phase-04c.
 *
 * Which worker the player has selected is a VIEW concern, not simulation state
 * (like tool and hover, ADR-007 §1): it never enters `World`. It is shared
 * between the renderer (which draws the selection box, following the moving
 * worker) and React (which shows the selected worker's state and task), so it
 * lives in one small observable both can read.
 *
 * The renderer takes only the `selected` getter, never this store, keeping the
 * render layer free of a dependency on the app layer above it.
 */

export interface WorkerSelection {
  /** Selects a worker by id, or clears with `null`. Notifies only on a change. */
  select(id: number | null): void;
  selected(): number | null;
  subscribe(listener: () => void): () => void;
}

export function createWorkerSelection(): WorkerSelection {
  let selected: number | null = null;
  const listeners = new Set<() => void>();

  return {
    select(id) {
      if (id === selected) return; // no-op: don't wake subscribers for nothing
      selected = id;
      for (const listener of listeners) listener();
    },
    selected: () => selected,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
