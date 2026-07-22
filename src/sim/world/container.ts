/**
 * The container primitive. Phase-05, ADR-011.
 *
 * A container is the ONE unit that holds resources: a bounded, slot-based
 * collection of item stacks. The player inventory, a worker's hold, and a
 * storage shed are all containers — nothing else represents a held resource
 * (ADR-011 §2). The same operations serve all three.
 *
 * The load-bearing property is **conservation** (ADR-011 §3, §4): `transfer`
 * removes exactly what it adds, so a unit never appears in one container
 * without leaving another. `addItems`/`removeItems` are the source/sink half —
 * the declared boundaries where quantity legitimately enters or leaves.
 *
 * Stacks are immutable (`ItemStack`); the container's stack list is mutable hot
 * state (CODE_STYLE.md §2.2), rebuilt by each operation. Quantities are integers
 * (ADR-007 §7). Stack size is a property of the item definition and is passed in
 * so this module stays a pure data structure with no dependency on the registry.
 */

import type { ContentId } from '../../shared/ids';

/** A quantity of one item. Immutable; references its definition by id (ADR-004 §5). */
export interface ItemStack {
  readonly item: ContentId;
  readonly quantity: number;
}

export interface Container {
  /** Non-empty stacks, each quantity in `[1, stackSize]`. One slot per stack. */
  stacks: ItemStack[];
  /** Maximum number of slots (the player inventory's constraint, §7). */
  readonly capacity: number;
  /**
   * Optional cap on total quantity across all stacks — the worker hold's
   * constraint ("carries 20 items", §4.6). When set, it bounds `acceptable`
   * independently of slots.
   */
  readonly maxTotal?: number;
}

export function createContainer(capacity: number, maxTotal?: number): Container {
  return maxTotal === undefined ? { stacks: [], capacity } : { stacks: [], capacity, maxTotal };
}

/** Total quantity of one item across all its stacks. */
export function containerCount(container: Container, item: ContentId): number {
  let total = 0;
  for (const stack of container.stacks) if (stack.item === item) total += stack.quantity;
  return total;
}

/** Total quantity of every item. */
export function containerTotal(container: Container): number {
  let total = 0;
  for (const stack of container.stacks) total += stack.quantity;
  return total;
}

/** Empty slots remaining. */
export function freeSlots(container: Container): number {
  return container.capacity - container.stacks.length;
}

/**
 * How many more of `item` the container could take: the unused space in its
 * existing stacks of that item, plus a full stack per empty slot.
 */
export function acceptable(container: Container, item: ContentId, stackSize: number): number {
  let space = freeSlots(container) * stackSize;
  for (const stack of container.stacks) {
    if (stack.item === item) space += stackSize - stack.quantity;
  }
  // A total-quantity cap (worker hold) can bind before the slots do.
  if (container.maxTotal !== undefined) {
    space = Math.min(space, container.maxTotal - containerTotal(container));
  }
  return Math.max(0, space);
}

/**
 * Adds up to `quantity` of `item`, filling partial stacks before opening slots.
 *
 * Returns how much was added and the remainder that did not fit — a full
 * container takes what it can and reports the rest, which the caller keeps
 * (ADR-011 §7 — never discard). Mutates the container.
 */
export function addItems(
  container: Container,
  item: ContentId,
  quantity: number,
  stackSize: number,
): { readonly added: number; readonly remainder: number } {
  // A total-quantity cap (worker hold) limits how much may be added at all.
  const room =
    container.maxTotal === undefined
      ? quantity
      : Math.max(0, Math.min(quantity, container.maxTotal - containerTotal(container)));
  let remaining = room;

  // Top up existing partial stacks of this item first.
  container.stacks = container.stacks.map((stack) => {
    if (remaining <= 0 || stack.item !== item || stack.quantity >= stackSize) return stack;
    const take = Math.min(stackSize - stack.quantity, remaining);
    remaining -= take;
    return { item, quantity: stack.quantity + take };
  });

  // Then open new slots while there is room.
  while (remaining > 0 && container.stacks.length < container.capacity) {
    const take = Math.min(stackSize, remaining);
    container.stacks.push({ item, quantity: take });
    remaining -= take;
  }

  const added = room - remaining;
  return { added, remainder: quantity - added };
}

/**
 * Removes exactly `quantity` of `item`, or nothing.
 *
 * All-or-nothing: removing more than the container holds fails and mutates
 * nothing (crit 8). On success, drains from stacks and frees any that empty.
 */
export function removeItems(
  container: Container,
  item: ContentId,
  quantity: number,
): { readonly removed: number } {
  if (quantity <= 0) return { removed: 0 };
  if (containerCount(container, item) < quantity) return { removed: 0 };

  let remaining = quantity;
  const next: ItemStack[] = [];
  for (const stack of container.stacks) {
    if (remaining <= 0 || stack.item !== item) {
      next.push(stack);
      continue;
    }
    const take = Math.min(stack.quantity, remaining);
    remaining -= take;
    if (stack.quantity > take) next.push({ item, quantity: stack.quantity - take });
    // else the stack is emptied and dropped, freeing its slot.
  }

  container.stacks = next;
  return { removed: quantity };
}

/**
 * Moves up to `quantity` of `item` from one container to another, atomically.
 *
 * Moves `min(available at source, acceptable at destination, quantity)` — and
 * removes from the source exactly what it adds to the destination, so quantity
 * is conserved (ADR-011 §3). A move of zero touches neither side.
 */
export function transfer(
  from: Container,
  to: Container,
  item: ContentId,
  quantity: number,
  stackSize: number,
): { readonly moved: number } {
  const available = containerCount(from, item);
  const moved = Math.min(quantity, available, acceptable(to, item, stackSize));
  if (moved <= 0) return { moved: 0 };

  removeItems(from, item, moved); // moved ≤ available, so this succeeds exactly
  addItems(to, item, moved, stackSize); // moved ≤ acceptable, so all fits
  return { moved };
}
