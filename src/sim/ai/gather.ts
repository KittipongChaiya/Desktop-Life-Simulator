/**
 * Gather discovery. Phase-27 — ADR-037 §4.
 *
 * One more band in the pipeline ADR-024 built, exactly as hauling was: a pure
 * function from world state to a task, filtered and ordered by machinery that
 * already exists. Zones, shifts, roles, the idle back-off and the
 * never-deadlock rule all apply with no code here.
 *
 * ## The scan is bounded by the wilds, not by the world
 *
 * Only `x >= WILDS_MIN_X` can hold a node, so the scan walks that band and
 * nothing else — a third of the grid rather than all of it. It runs on a
 * worker's replan (at most every `IDLE_REPLAN_TICKS`), never per tick, which
 * is the same budget the farm-wide harvest scan already spends.
 *
 * ## Nothing here is stored
 *
 * What stands on a tile comes from `nodeAt` (a hash) and whether it is ready
 * comes from `harvestedAt` plus arithmetic. Discovery therefore has no state
 * of its own to keep in step with anything, and a node cannot be "claimed"
 * incorrectly because a claim is a worker's task — the same derivation
 * hauling uses (ADR-036 as amended).
 */

import { WILDS_MIN_X } from '../../shared/constants';
import { manhattanDistance, toIndexUnchecked, toPosition } from '../../shared/geometry';
import type { TileIndex, WorkerId } from '../../shared/ids';
import { unwrap } from '../../shared/result';
import {
  isNodeReady,
  nodeAt,
  type ResourceNodeDefinition,
  type ResourceNodeRegistry,
} from '../content/resource-nodes';
import { phaseFor } from '../time/game-clock';
import { isBlocked, type TileGrid } from '../world/tile-grid';
import { WorkerTaskKind, type Worker, type WorkerTask } from '../world/worker';

import { allowsWork } from './constraints';

/** What gather discovery reads. `World` satisfies this structurally. */
export interface GatherContext {
  readonly tick: number;
  /** The day's length, for the shift filter (ADR-024 §4). */
  readonly ticksPerDay: number;
  readonly seed: number;
  readonly tiles: TileGrid;
  readonly resourceNodeRegistry: ResourceNodeRegistry;
  readonly harvestedAt: ReadonlyMap<TileIndex, number>;
  readonly workers: ReadonlyMap<WorkerId, Worker>;
}

/** The node on `tile`, if one stands there and it can be worked now. */
export function readyNodeAt(ctx: GatherContext, tile: TileIndex): ResourceNodeDefinition | null {
  const node = nodeAt(ctx.resourceNodeRegistry, ctx.seed, tile);
  if (node === null) return null;
  return isNodeReady(node, ctx.harvestedAt.get(tile), ctx.tick) ? node : null;
}

/** Tiles some other worker is already gathering — one worker per node. */
function claimedByOthers(ctx: GatherContext, self: WorkerId): ReadonlySet<TileIndex> {
  const claimed = new Set<TileIndex>();
  for (const worker of ctx.workers.values()) {
    if (worker.id === self) continue;
    if (worker.task?.kind === WorkerTaskKind.Gather) claimed.add(worker.task.tile);
  }
  return claimed;
}

/**
 * The nearest ready node this worker should walk to, or null.
 *
 * Ties break by lowest tile index — never RNG, because determinism is required
 * (ADR-007) and the harvest band resolves ties the same way.
 *
 * A node's own tile is walkable (nodes do not block, unlike buildings), so the
 * worker targets it directly rather than an adjacent tile. That is the one
 * place gathering is simpler than hauling.
 */
export function selectGather(ctx: GatherContext, worker: Worker): WorkerTask | null {
  // GATHERING IS OPT-IN, and it is the only band that is.
  //
  // Everywhere else in ADR-024's model an absent `taskKinds` means
  // unconstrained — a worker with no schedule does everything. Gathering
  // breaks that deliberately, and the reason is distance: the wilds start
  // thirty-plus tiles out, so a trip takes a worker off the farm for minutes.
  // Default-on, an idle worker wanders away and the farm stops; measured, it
  // stopped completely (see the ADR-037 §4 amendment).
  //
  // This is the same shape logistics took. Hauling does not happen until the
  // player declares a ROUTE, and gathering does not happen until the player
  // says which workers are for it — `core:forager` is that, as a role. Both
  // are long-distance work, and neither should start because nobody said no.
  if (worker.schedule.taskKinds?.includes(WorkerTaskKind.Gather) !== true) return null;

  // The rest of the filter stage (ADR-024 §1): zone and shift still apply.
  const phase = phaseFor(ctx.tick, ctx.ticksPerDay);
  const claimed = claimedByOthers(ctx, worker.id);
  const origin = unwrap(toPosition(worker.position));

  let best: TileIndex | null = null;
  let bestDistance = Infinity;

  for (let y = 0; y < ctx.tiles.height; y += 1) {
    for (let x = WILDS_MIN_X; x < ctx.tiles.width; x += 1) {
      const tile = toIndexUnchecked(x, y);
      if (claimed.has(tile)) continue;
      // A blocked wild tile would be unreachable; nothing blocks out there
      // today, and checking costs one bit read.
      if (isBlocked(ctx.tiles, tile)) continue;
      if (readyNodeAt(ctx, tile) === null) continue;
      if (!allowsWork(worker.schedule, { kind: WorkerTaskKind.Gather, tile, phase })) continue;

      const distance = manhattanDistance(origin, { x, y });
      // Strictly-less keeps the lowest tile index on a tie, since the scan is
      // in ascending index order.
      if (distance < bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    }
  }

  return best === null ? null : { kind: WorkerTaskKind.Gather, tile: best };
}
