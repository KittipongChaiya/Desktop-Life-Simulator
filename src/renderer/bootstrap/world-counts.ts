/**
 * Read-only world counts for the debug overlay. Phase-07.8a, ADR-018 §9.
 *
 * Pure, because one of these is not a lookup. Workers, crops and buildings are
 * `length` on a projected slice; **containers are not projected at all**, so
 * the count is DERIVED from what is — and a derivation is logic, which means it
 * can be wrong, which means it gets a test.
 *
 * It counts containers rather than exposing them. A debug panel may learn that
 * eleven exist; it may not reach one through this and write to it.
 */

import type { BuildingView } from '../../sim/snapshot/buildings-slice';

/** The building whose whole purpose is holding items. */
const STORAGE_BUILDING = 'core:storage_shed';

/**
 * How many item containers the world currently addresses.
 *
 * One player inventory, always — it exists before any worker is hired and
 * cannot be removed. One hold per worker (`Worker.carrying`). One per storage
 * building. Other buildings hold nothing: a market stall sells from the
 * player's inventory rather than owning a container of its own.
 */
export function countContainers(workerCount: number, buildings: readonly BuildingView[]): number {
  const storage = buildings.filter((building) => building.buildingId === STORAGE_BUILDING).length;
  return 1 + Math.max(0, workerCount) + storage;
}
