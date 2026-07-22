/**
 * Inventory snapshot projection. Phase-05d, ADR-011.
 */

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';
import { addItems, createContainer, type Container } from '../world/container';

import {
  inventoryEqual,
  projectInventory,
  type InventoryProjectionSource,
} from './inventory-slice';

const WHEAT = asContentId('core:wheat');
const TURNIP = asContentId('core:turnip');
const STACK = 99;

function source(inventory: Container, sheds: Container[] = []): InventoryProjectionSource {
  const buildingStorage = new Map<number, Container>();
  sheds.forEach((shed, index) => buildingStorage.set(index + 1, shed));
  return { inventory, buildingStorage } as InventoryProjectionSource;
}

describe('projectInventory', () => {
  it('reports capacity and used slots for an empty inventory', () => {
    const view = projectInventory(source(createContainer(40)));
    expect(view).toEqual({ stacks: [], capacity: 40, usedSlots: 0 });
  });

  it('aggregates items across the inventory and every shed', () => {
    const inventory = createContainer(40);
    addItems(inventory, WHEAT, 10, STACK);
    const shed = createContainer(50);
    addItems(shed, WHEAT, 5, STACK);
    addItems(shed, TURNIP, 3, STACK);

    const view = projectInventory(source(inventory, [shed]));

    // Capacity is the sum (40 + 50); wheat is summed across containers.
    expect(view.capacity).toBe(90);
    expect(view.usedSlots).toBe(3); // wheat(inv) + wheat(shed) + turnip(shed)
    expect(view.stacks).toEqual([
      { item: 'core:turnip', quantity: 3 },
      { item: 'core:wheat', quantity: 15 },
    ]);
  });

  it('sorts stacks by item id, deterministically', () => {
    const inventory = createContainer(40);
    addItems(inventory, WHEAT, 1, STACK);
    addItems(inventory, TURNIP, 1, STACK);
    const view = projectInventory(source(inventory));
    expect(view.stacks.map((s) => s.item)).toEqual(['core:turnip', 'core:wheat']);
  });
});

describe('inventoryEqual', () => {
  it('is true for equal views and false when quantity, capacity, or slots differ', () => {
    const inventory = createContainer(40);
    addItems(inventory, WHEAT, 5, STACK);
    const a = projectInventory(source(inventory));

    expect(inventoryEqual(a, projectInventory(source(inventory)))).toBe(true);

    addItems(inventory, WHEAT, 1, STACK);
    expect(inventoryEqual(a, projectInventory(source(inventory)))).toBe(false);
  });
});
