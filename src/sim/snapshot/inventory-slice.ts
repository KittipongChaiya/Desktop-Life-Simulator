/**
 * Inventory snapshot projection. Phase-05d, ADR-005 §2, ADR-011.
 *
 * The sim→view boundary for what the player owns. It AGGREGATES every container
 * the player controls — the player inventory plus every storage shed — into one
 * view: summed stacks, total slots, slots used. That is the §7 "40 base, +50 per
 * shed" capacity, and it shows goods workers deposited into sheds, not just the
 * base inventory.
 *
 * Plain, immutable data; the panel never touches a `Container`. Change-gated: it
 * republishes only when contents or capacity actually change (crit 17).
 */

import type { BuildingId } from '../../shared/ids';
import type { Container } from '../world/container';

/** One aggregated item line. */
export interface InventoryStackView {
  readonly item: string;
  readonly quantity: number;
}

export interface InventoryView {
  /** Summed across all containers, sorted by item id (deterministic). */
  readonly stacks: readonly InventoryStackView[];
  /** Total slots across the player inventory and every shed (§7). */
  readonly capacity: number;
  /** Slots currently occupied. */
  readonly usedSlots: number;
}

/** The world state the projection reads. `World` satisfies this structurally. */
export interface InventoryProjectionSource {
  readonly inventory: Container;
  readonly buildingStorage: Map<BuildingId, Container>;
}

/** Aggregates the player inventory and every storage container into one view. */
export function projectInventory(source: InventoryProjectionSource): InventoryView {
  const containers: readonly Container[] = [source.inventory, ...source.buildingStorage.values()];

  const totals = new Map<string, number>();
  let capacity = 0;
  let usedSlots = 0;
  for (const container of containers) {
    capacity += container.capacity;
    usedSlots += container.stacks.length;
    for (const stack of container.stacks) {
      totals.set(stack.item, (totals.get(stack.item) ?? 0) + stack.quantity);
    }
  }

  const stacks = [...totals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([item, quantity]) => ({ item, quantity }));

  return { stacks, capacity, usedSlots };
}

/** True if two projections are equal — the change gate. */
export function inventoryEqual(a: InventoryView, b: InventoryView): boolean {
  if (a.capacity !== b.capacity || a.usedSlots !== b.usedSlots) return false;
  if (a.stacks.length !== b.stacks.length) return false;
  for (let i = 0; i < a.stacks.length; i += 1) {
    const x = a.stacks[i];
    const y = b.stacks[i];
    if (x === undefined || y === undefined) return false;
    if (x.item !== y.item || x.quantity !== y.quantity) return false;
  }
  return true;
}
