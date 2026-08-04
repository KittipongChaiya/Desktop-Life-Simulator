/**
 * Entity inspector — the worker provider. Phase-07.8d, ADR-018 §2/§4/§5.
 *
 * Lives in `bootstrap` for the reason `tile-inspector.ts` does: it needs the
 * render layer's picking and the sim's stores at once, and only this layer may
 * see both.
 *
 * PICKED BY WHAT IS DRAWN, DESCRIBED BY WHAT THE SIMULATION HOLDS. The two
 * halves read different sources on purpose:
 *
 * - Picking uses the published `WorkerView`s and the renderer's own
 *   `workerAtTile`, so pointing at a worker selects the worker the player can
 *   see — including one drawn mid-step between two tiles. Restating that rule
 *   here would be a second copy of it, free to drift.
 * - The facts come from the `Worker` record, because three of the six the
 *   brief names are not projected at all: a view carries no `carrying`, no
 *   `path`, and no cursor. Projecting them would be worse than reading them —
 *   `path` changes as the worker walks, so a slice carrying it would republish
 *   every tick (ADR-005 §2).
 *
 * A worker the view knows and the store does not is reported as nothing at
 * all, rather than as a worker with default fields: a slice outlives a removed
 * worker by one publish, and inventing an entity to fill that gap is the kind
 * of lie a debug tool exists to prevent.
 */

import { field, type InspectProvider, type InspectSection } from '@devtools/inspector/registry';
import { workerAtTile } from '@render/worker-render';

import { toIndexUnchecked, toPosition } from '../../shared/geometry';
import { asTileIndex, asWorkerId, type WorkerId } from '../../shared/ids';
import type { WorkerView } from '../../sim/snapshot/workers-slice';
import { containerTotal } from '../../sim/world/container';
import {
  MAX_ENERGY,
  type WorkerState,
  type WorkerStore,
  type WorkerTaskKind,
} from '../../sim/world/worker';

/** What the entity inspector reads. `World` satisfies it structurally. */
export interface WorkerInspectSource {
  readonly workers: WorkerStore;
}

/** One carried stack, flattened to plain data. Never the container itself. */
export interface CarriedStack {
  readonly item: string;
  readonly quantity: number;
}

export interface WorkerFacts {
  readonly id: number;
  readonly tile: number;
  readonly state: WorkerState;
  readonly task: { readonly kind: WorkerTaskKind; readonly tile: number } | null;
  readonly energy: number;
  readonly carrying: readonly CarriedStack[];
  readonly carriedTotal: number;
  /** The hold's total cap, or null when it has none. */
  readonly carryCapacity: number | null;
  /** Where it is headed: the end of the route, else the tile it claimed. */
  readonly destination: number | null;
  readonly pathLength: number;
  readonly pathWalked: number;
}

/** Read, and found to be absent. Distinct from `Unavailable`, a failed read. */
const NONE = 'none';

/** Everything true of one worker right now, or null if there is no such worker. */
export function readWorkerFacts(source: WorkerInspectSource, id: WorkerId): WorkerFacts | null {
  const worker = source.workers.get(id);
  if (worker === undefined) return null;

  const routeEnd = worker.path.at(-1) ?? null;

  return {
    id,
    tile: worker.position,
    state: worker.state,
    task: worker.task === null ? null : { kind: worker.task.kind, tile: worker.task.tile },
    energy: worker.energy,
    carrying: worker.carrying.stacks.map((stack) => ({
      item: stack.item,
      quantity: stack.quantity,
    })),
    carriedTotal: containerTotal(worker.carrying),
    carryCapacity: worker.carrying.maxTotal ?? null,
    // A claimed task with no route yet is the moment a worker looks stuck, so
    // it reports where it intends to go rather than nothing.
    destination: routeEnd ?? worker.task?.tile ?? null,
    pathLength: worker.path.length,
    pathWalked: worker.pathCursor,
  };
}

/** `18,19 (#1234)` — an index alone is unreadable, and coordinates alone are unmatchable. */
function tileLabel(index: number): string {
  const position = toPosition(asTileIndex(index));
  if (!position.ok) return `#${String(index)}`;

  return `${String(position.value.x)},${String(position.value.y)} (#${String(index)})`;
}

/** Renders the facts as inspector fields. Every value is a string by here. */
export function describeWorker(facts: WorkerFacts): InspectSection {
  return {
    title: `Worker #${String(facts.id)}`,
    fields: [
      field('Tile', () => tileLabel(facts.tile)),
      field('State', () => facts.state),
      field('Task', () =>
        facts.task === null ? NONE : `${facts.task.kind} → ${tileLabel(facts.task.tile)}`,
      ),
      // Against its maximum: "42" alone says nothing about whether this worker
      // is about to go and rest.
      field('Energy', () => `${String(facts.energy)} / ${String(MAX_ENERGY)}`),
      field('Carrying', () => {
        const load =
          facts.carrying.length === 0
            ? NONE
            : facts.carrying.map((stack) => `${stack.item} ×${String(stack.quantity)}`).join(', ');
        const cap =
          facts.carryCapacity === null
            ? String(facts.carriedTotal)
            : `${String(facts.carriedTotal)}/${String(facts.carryCapacity)}`;

        return `${load} · ${cap}`;
      }),
      field('Destination', () =>
        facts.destination === null ? NONE : tileLabel(facts.destination),
      ),
      field('Path', () =>
        facts.pathLength === 0
          ? NONE
          : `${String(facts.pathLength)} tiles · ${String(facts.pathWalked)} walked`,
      ),
    ],
  };
}

export interface WorkerInspectOptions {
  readonly source: () => WorkerInspectSource;
  /** The workers as DRAWN. Picking reads these so it agrees with the screen. */
  readonly views: () => readonly WorkerView[];
  readonly tileAt: (screenX: number, screenY: number) => { x: number; y: number } | null;
}

/** The provider the inspector registry calls for whatever is under the pointer. */
export function createWorkerInspectProvider(options: WorkerInspectOptions): InspectProvider {
  return {
    id: 'world.worker',
    order: 1,
    inspect: (target) => {
      const tile = options.tileAt(target.x, target.y);
      if (tile === null) return null;

      // The view's id is a plain number; the store is keyed by the brand. This
      // is the boundary that cast exists for.
      const id = workerAtTile(options.views(), toIndexUnchecked(tile.x, tile.y));
      if (id === null) return null;

      const facts = readWorkerFacts(options.source(), asWorkerId(id));
      return facts === null ? null : describeWorker(facts);
    },
  };
}
