/**
 * Container primitive. Phase-05, ADR-011.
 *
 * The one resource unit: a bounded, slot-based collection of item stacks with
 * conservation-preserving transfers. The conservation property (crit 9) is the
 * load-bearing test — a transfer never creates or destroys a unit.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';

import {
  acceptable,
  addItems,
  containerCount,
  containerTotal,
  createContainer,
  freeSlots,
  removeItems,
  transfer,
} from './container';

const WHEAT = asContentId('core:wheat');
const TURNIP = asContentId('core:turnip');
const STACK = 99;

describe('createContainer', () => {
  it('starts empty with all slots free', () => {
    const c = createContainer(40);
    expect(c.capacity).toBe(40);
    expect(containerTotal(c)).toBe(0);
    expect(freeSlots(c)).toBe(40);
  });
});

describe('addItems', () => {
  it('adds a stack to an empty container', () => {
    const c = createContainer(40);
    expect(addItems(c, WHEAT, 5, STACK)).toEqual({ added: 5, remainder: 0 });
    expect(containerCount(c, WHEAT)).toBe(5);
    expect(freeSlots(c)).toBe(39);
  });

  it('fills a partial stack before opening a new slot', () => {
    const c = createContainer(40);
    addItems(c, WHEAT, 90, STACK);
    addItems(c, WHEAT, 20, STACK); // 90 + 20 → 99 + 11 across two slots
    expect(containerCount(c, WHEAT)).toBe(110);
    expect(c.stacks).toHaveLength(2);
    expect(c.stacks[0]?.quantity).toBe(99);
    expect(c.stacks[1]?.quantity).toBe(11);
  });

  it('reports the remainder when the container cannot take it all', () => {
    const c = createContainer(1); // one slot
    const result = addItems(c, WHEAT, 150, STACK); // slot holds 99
    expect(result).toEqual({ added: 99, remainder: 51 });
    expect(containerCount(c, WHEAT)).toBe(99);
  });

  it('adds nothing to a full container and changes nothing', () => {
    const c = createContainer(1);
    addItems(c, WHEAT, 99, STACK); // slot full at stack size
    const before = structuredClone(c.stacks);
    expect(addItems(c, TURNIP, 5, STACK)).toEqual({ added: 0, remainder: 5 });
    expect(c.stacks).toEqual(before);
  });
});

describe('removeItems', () => {
  it('removes part of a stack', () => {
    const c = createContainer(40);
    addItems(c, WHEAT, 50, STACK);
    expect(removeItems(c, WHEAT, 20)).toEqual({ removed: 20 });
    expect(containerCount(c, WHEAT)).toBe(30);
  });

  it('removes a whole stack and frees the slot', () => {
    const c = createContainer(40);
    addItems(c, WHEAT, 30, STACK);
    expect(removeItems(c, WHEAT, 30)).toEqual({ removed: 30 });
    expect(freeSlots(c)).toBe(40);
  });

  it('removes across multiple stacks', () => {
    const c = createContainer(40);
    addItems(c, WHEAT, 150, STACK); // 99 + 51
    expect(removeItems(c, WHEAT, 120)).toEqual({ removed: 120 });
    expect(containerCount(c, WHEAT)).toBe(30);
  });

  it('fails and mutates nothing when removing more than held (crit 8)', () => {
    const c = createContainer(40);
    addItems(c, WHEAT, 10, STACK);
    const before = structuredClone(c.stacks);
    expect(removeItems(c, WHEAT, 11)).toEqual({ removed: 0 });
    expect(c.stacks).toEqual(before);
  });

  it('fails on an empty container', () => {
    const c = createContainer(40);
    expect(removeItems(c, WHEAT, 1)).toEqual({ removed: 0 });
  });
});

describe('acceptable', () => {
  it('counts partial-stack space plus empty slots', () => {
    const c = createContainer(3);
    addItems(c, WHEAT, 90, STACK); // one slot, 9 free in it; 2 empty slots
    expect(acceptable(c, WHEAT, STACK)).toBe(9 + 2 * STACK);
  });
});

describe('maxTotal cap (worker hold, §4.6)', () => {
  it('caps acceptable and adds by the total-quantity limit, not slots', () => {
    const hold = createContainer(20, 20); // 20 slots but at most 20 items
    expect(acceptable(hold, WHEAT, STACK)).toBe(20);
    expect(addItems(hold, WHEAT, 25, STACK)).toEqual({ added: 20, remainder: 5 });
    expect(containerTotal(hold)).toBe(20);
    expect(acceptable(hold, TURNIP, STACK)).toBe(0); // full by total, though slots remain
  });
});

describe('transfer', () => {
  it('moves the whole amount and conserves it', () => {
    const from = createContainer(40);
    const to = createContainer(40);
    addItems(from, WHEAT, 50, STACK);

    expect(transfer(from, to, WHEAT, 50, STACK)).toEqual({ moved: 50 });
    expect(containerCount(from, WHEAT)).toBe(0);
    expect(containerCount(to, WHEAT)).toBe(50);
  });

  it('moves only what the destination can hold, leaving the rest at the source', () => {
    const from = createContainer(40);
    const to = createContainer(1); // one slot, 99 max
    addItems(from, WHEAT, 150, STACK);

    expect(transfer(from, to, WHEAT, 150, STACK)).toEqual({ moved: 99 });
    expect(containerCount(to, WHEAT)).toBe(99);
    expect(containerCount(from, WHEAT)).toBe(51); // conserved: 51 + 99 = 150
  });

  it('moves nothing into a full destination and changes neither side', () => {
    const from = createContainer(40);
    const to = createContainer(1);
    addItems(from, WHEAT, 10, STACK);
    addItems(to, TURNIP, 99, STACK); // full

    const fromBefore = structuredClone(from.stacks);
    const toBefore = structuredClone(to.stacks);
    expect(transfer(from, to, WHEAT, 10, STACK)).toEqual({ moved: 0 });
    expect(from.stacks).toEqual(fromBefore);
    expect(to.stacks).toEqual(toBefore);
  });
});

describe('conservation (crit 9)', () => {
  it('total quantity is invariant across an arbitrary transfer sequence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 200 }), { minLength: 3, maxLength: 3 }),
        fc.array(
          fc.record({
            from: fc.integer({ min: 0, max: 2 }),
            to: fc.integer({ min: 0, max: 2 }),
            qty: fc.integer({ min: 0, max: 120 }),
          }),
          { maxLength: 40 },
        ),
        (initial, moves) => {
          const containers = initial.map((qty) => {
            const c = createContainer(40);
            addItems(c, WHEAT, qty, STACK);
            return c;
          });
          const total = containers.reduce((sum, c) => sum + containerTotal(c), 0);

          for (const move of moves) {
            if (move.from === move.to) continue;
            transfer(containers[move.from]!, containers[move.to]!, WHEAT, move.qty, STACK);
            // Invariant holds after every single transfer, not just at the end.
            const now = containers.reduce((sum, c) => sum + containerTotal(c), 0);
            expect(now).toBe(total);
          }
        },
      ),
    );
  });
});
