/**
 * Storage-target selection. Phase-05, ADR-011.
 *
 * The seam that keeps worker logic independent of storage. A worker asks "where
 * should I deposit?" and gets back a target id (or null for the player
 * inventory); it never inspects a building's type, capacity, or position.
 *
 * The current STRATEGY is nearest-with-space. Callers must not depend on that —
 * future strategies (priority sheds, capacity balancing, item filters, logistics
 * routing) replace this function alone, with no change to the worker (the
 * requirement 05c installs). The return is deliberately opaque: a building id or
 * null, resolved to a live container by the deposit command.
 */

import { manhattanDistance, toPosition } from '../../shared/geometry';
import type { TileIndex, BuildingId } from '../../shared/ids';
import { unwrap } from '../../shared/result';
import type { BuildingStore } from '../world/building';
import { freeSlots } from '../world/container';
import type { Container } from '../world/container';

/** The world state target selection reads. `World` satisfies this structurally. */
export interface StorageContext {
  readonly buildings: BuildingStore;
  readonly buildingStorage: Map<BuildingId, Container>;
}

/**
 * Selects where a worker at `from` should deposit: the id of the nearest
 * storage building with room, or `null` for the player inventory when none
 * exists or has room. Deterministic — nearest by manhattan, ties by lowest id.
 */
export function selectStorageTarget(ctx: StorageContext, from: TileIndex): number | null {
  const origin = unwrap(toPosition(from));
  let best: number | null = null;
  let bestDistance = Infinity;

  // Sorted by id so equal distances resolve to the lowest id — no RNG (ADR-007).
  for (const building of [...ctx.buildings.values()].sort((a, b) => a.id - b.id)) {
    const container = ctx.buildingStorage.get(building.id);
    if (container === undefined || freeSlots(container) <= 0) continue;

    const distance = manhattanDistance(origin, unwrap(toPosition(building.tile)));
    if (distance < bestDistance) {
      best = building.id;
      bestDistance = distance;
    }
  }

  return best; // null → the deposit command falls back to the player inventory
}
