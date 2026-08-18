/**
 * Haul discovery and reservation. Phase-26 — ADR-036 §3, §4.
 *
 * ## Reservations are DERIVED, and that is an amendment to ADR-036
 *
 * The ADR specified a reservation store owned by a task, plus a per-tick sweep
 * to release any reservation whose owner had gone (§5, defence 3). Implementing
 * it showed a stronger form of the same intent: if a reservation is *computed
 * from the task* rather than recorded beside it, there is nothing to leak.
 *
 * A worker holding a `Haul` task for route R has, by that fact alone, claimed
 * goods at R's source. A worker whose `hauling` is R has claimed space at R's
 * destination. Both vanish the instant the worker's state changes, through
 * every exit path there is — completion, abandonment, energy loss, dismissal,
 * a load from disk — because there is no second record to forget.
 *
 * The consequences, stated plainly:
 *
 * - §5 defence 1 (release on every exit path) is satisfied structurally rather
 *   than by discipline.
 * - §5 defence 3 (the sweep) is **not implemented**, and must not be: a sweep
 *   over derived state can only ever find nothing.
 * - §5 defence 2 (the invariant test) is kept, and becomes a test that the
 *   derivation itself is sound.
 * - Reservations survive save/load for free, because tasks already do.
 *
 * ## Discovery
 *
 * Two bands, in this order: a loaded worker delivers, an empty one collects.
 * A worker that could pick up while already carrying would strand the first
 * load, so `hauling` is answered first and answers with exactly one task.
 */

import { manhattanDistance, toIndexUnchecked, toPosition } from '../../shared/geometry';
import type { BuildingId, ContentId, TileIndex, WorkerId } from '../../shared/ids';
import { unwrap } from '../../shared/result';
import type { TileKindRegistry } from '../content/tile-kinds';
import type { BuildingStore } from '../world/building';
import { acceptable, containerCount, type Container } from '../world/container';
import { giveTo, takeFrom, type EndpointSource } from '../world/endpoints';
import { routesInOrder, type Route, type RouteId, type RouteStore } from '../world/route';
import { getKind, isBlocked, type TileGrid } from '../world/tile-grid';
import {
  WORKER_CARRY_CAPACITY,
  WorkerTaskKind,
  type Worker,
  type WorkerTask,
} from '../world/worker';

/** What haul discovery reads. `World` satisfies this structurally. */
export interface HaulContext extends EndpointSource {
  readonly routes: RouteStore;
  readonly buildings: BuildingStore;
  readonly workers: ReadonlyMap<WorkerId, Worker>;
  readonly itemRegistry: {
    get(id: ContentId): { readonly ok: boolean; readonly value?: { readonly stackSize: number } };
  };
  readonly tiles: TileGrid;
  readonly tileKinds: TileKindRegistry;
}

/** Stack size for an item, defaulting when the item is unknown. */
function stackSizeOf(ctx: HaulContext, item: ContentId): number {
  const definition = ctx.itemRegistry.get(item);
  return definition.ok && definition.value !== undefined ? definition.value.stackSize : 1;
}

/**
 * Units of `route.item` already claimed at the route's source by other workers.
 *
 * Derived from tasks. `self` is excluded so a worker re-examining its own claim
 * does not see itself as competition.
 */
export function reservedAtSource(ctx: HaulContext, route: Route, self?: WorkerId): number {
  let claimed = 0;
  for (const worker of ctx.workers.values()) {
    if (worker.id === self) continue;
    if (worker.task?.kind === WorkerTaskKind.Haul && worker.task.route === route.id) {
      claimed += worker.task.quantity ?? 0;
    }
  }
  return claimed;
}

/**
 * Units in flight toward the route's destination.
 *
 * A worker that has collected but not yet delivered is holding space at the far
 * end. Without counting it several workers would each find room for a full
 * load, and the last to arrive would find the destination full — the goods come
 * back, which is correct but wasteful, and on a tight chain it reads as a stall
 * nobody can explain.
 */
export function inFlightToDestination(ctx: HaulContext, route: Route, self?: WorkerId): number {
  let flying = 0;
  for (const worker of ctx.workers.values()) {
    if (worker.id === self) continue;
    if (worker.hauling === route.id) flying += containerCount(worker.carrying, route.item);
  }
  return flying;
}

/** Units of `item` a worker may take from `container` after others' claims. */
function availableToTake(container: Container, item: ContentId, reserved: number): number {
  return Math.max(0, containerCount(container, item) - reserved);
}

/** Space at the destination after what is already on its way. */
function spaceToGive(
  ctx: HaulContext,
  container: Container,
  item: ContentId,
  inFlight: number,
): number {
  return Math.max(0, acceptable(container, item, stackSizeOf(ctx, item)) - inFlight);
}

/**
 * A tile a worker can actually stand on to work this building, or null.
 *
 * A building's own tile is `blocked` — that is how buildings enter the
 * walkability model at all (ADR-011) — so pathing to it can never succeed.
 * Hauling therefore targets an ADJACENT walkable tile, which is what "walk to
 * the shed" means physically anyway.
 *
 * Neighbours are tried in a fixed order and the first walkable one wins:
 * deterministic, and stable as the farm changes around it.
 */
function approachTile(ctx: HaulContext, building: BuildingId): TileIndex | null {
  const placed = ctx.buildings.get(building);
  if (placed === undefined) return null;

  const here = unwrap(toPosition(placed.tile));
  for (const [dx, dy] of NEIGHBOURS) {
    const x = here.x + dx;
    const y = here.y + dy;
    if (x < 0 || y < 0 || x >= ctx.tiles.width || y >= ctx.tiles.height) continue;
    const tile = toIndexUnchecked(x, y);
    if (isBlocked(ctx.tiles, tile)) continue;
    const kind = ctx.tileKinds.byIndex(getKind(ctx.tiles, tile));
    if (kind === undefined || !kind.walkable) continue;
    return tile;
  }
  return null;
}

/** Fixed neighbour order — determinism, not preference. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * How many units this worker should collect for `route`, or 0.
 *
 * Bounded by four things at once: what the source holds after other claims,
 * what the destination can accept after what is in flight, the worker's carry
 * capacity, and its current load.
 */
export function haulQuantity(ctx: HaulContext, route: Route, worker: Worker): number {
  const from = takeFrom(ctx, route.from);
  const to = giveTo(ctx, route.to);
  if (from === null || to === null) return 0;

  const free = WORKER_CARRY_CAPACITY - containerCount(worker.carrying, route.item);
  return Math.max(
    0,
    Math.min(
      availableToTake(from, route.item, reservedAtSource(ctx, route, worker.id)),
      spaceToGive(ctx, to, route.item, inFlightToDestination(ctx, route, worker.id)),
      free,
    ),
  );
}

/**
 * The haul or delivery this worker should pursue, or null.
 *
 * A loaded worker delivers; an empty one collects from the nearest route with
 * work. Ties break by lowest route id — never RNG, because determinism is
 * required (ADR-007) and several systems depend on it.
 */
export function selectHaul(ctx: HaulContext, worker: Worker): WorkerTask | null {
  // DELIVER first. A worker already carrying for a route has exactly one
  // correct next action, and offering it a pickup would strand the load.
  if (worker.hauling !== null) {
    const route = ctx.routes.get(worker.hauling);
    const tile = route === undefined ? null : approachTile(ctx, route.to);
    // The route was deleted or the destination sold while this worker walked.
    // Answering null leaves the goods in the hold, where the ordinary deposit
    // path will put them into storage — never destroyed (ADR-011 §7).
    if (route === undefined || tile === null) return null;
    return {
      kind: WorkerTaskKind.Deliver,
      tile,
      route: route.id,
      quantity: containerCount(worker.carrying, route.item),
    };
  }

  const origin = unwrap(toPosition(worker.position));
  let best: { task: WorkerTask; distance: number } | null = null;

  for (const route of routesInOrder(ctx.routes)) {
    const tile = approachTile(ctx, route.from);
    if (tile === null) continue; // the source building was sold
    const quantity = haulQuantity(ctx, route, worker);
    if (quantity <= 0) continue;

    const distance = manhattanDistance(origin, unwrap(toPosition(tile)));
    // Strictly-less keeps the lowest route id on a tie, since routes are
    // scanned in id order.
    if (best === null || distance < best.distance) {
      best = {
        task: { kind: WorkerTaskKind.Haul, tile, route: route.id, quantity },
        distance,
      };
    }
  }

  return best?.task ?? null;
}

/** Every route id currently claimed by some worker — diagnostics and tests. */
export function claimedRoutes(ctx: HaulContext): ReadonlySet<RouteId> {
  const claimed = new Set<RouteId>();
  for (const worker of ctx.workers.values()) {
    if (worker.task?.route !== undefined) claimed.add(worker.task.route);
    if (worker.hauling !== null) claimed.add(worker.hauling);
  }
  return claimed;
}
