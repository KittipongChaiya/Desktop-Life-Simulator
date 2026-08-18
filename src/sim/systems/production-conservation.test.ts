/**
 * Conservation across crafting — ADR-035 Rule D.
 *
 * ADR-011's conservation property is the most valuable test in the resource
 * half of this project, and the test that implements it (`container.test.ts`,
 * "conservation (crit 9)") is a property over **`transfer` alone**. Crafting
 * never calls `transfer`: it removes at one boundary and adds at another. That
 * test would therefore go on passing, unchanged and fully green, over any
 * quantity bug crafting can introduce.
 *
 * So this is the second net, at the world level rather than the container
 * level, and it is deliberately written so that it cannot be satisfied by
 * re-deriving the implementation.
 *
 * ## The ledger
 *
 * Each item is weighted in units of the chain's raw input, so a craft becomes
 * an EXCHANGE rather than a source and a sink:
 *
 *     1 wheat = 1 unit        2 wheat → 1 flour, so
 *     1 flour = 2 units       a completed craft moves 2 units, not 0 → 2.
 *
 * Total units across every container is then invariant across any number of
 * ticks — plus the units of a craft IN FLIGHT, whose inputs have been consumed
 * and whose outputs do not exist yet. That in-flight term is the interesting
 * part: without it the invariant would be violated for the whole duration of
 * every craft, and with it a craft that consumed twice, produced twice, or
 * dropped its product on a full output shows up immediately.
 *
 * What this catches that a count of crafts would not: the ledger never asks
 * how many crafts happened. It asks only that nothing was created or destroyed
 * on the way, which is the property ADR-011 §4 actually promises.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { asBuildingId, asContentId, type ContentId } from '../../shared/ids';
import { DEFAULT_STACK_SIZE } from '../content/items';
import type { RecipeDefinition } from '../content/recipes';
import { addItems, containerCount, removeItems } from '../world/container';
import { createFactoryState, type FactoryState } from '../world/factory';
import { createWorld, type World } from '../world/world';

import { productionSystem } from './production';

const MILL = asContentId('test:mill');
const WHEAT = asContentId('core:wheat');
const FLOUR = asContentId('test:flour');

const GRIND: RecipeDefinition = {
  id: asContentId('test:grind'),
  displayName: 'Grind',
  building: MILL,
  inputs: [{ item: WHEAT, quantity: 2 }],
  outputs: [{ item: FLOUR, quantity: 1 }],
  craftTicks: 40,
};

/** Units per item, in raw-input terms. A craft is an exchange at this rate. */
const UNITS: Readonly<Record<string, number>> = { [WHEAT]: 1, [FLOUR]: 2 };

function unitsIn(container: { stacks: readonly { item: ContentId; quantity: number }[] }): number {
  let total = 0;
  for (const stack of container.stacks) total += (UNITS[stack.item] ?? 0) * stack.quantity;
  return total;
}

/**
 * Every unit the world holds, including the one craft in flight.
 *
 * The in-flight term is what makes this an invariant rather than a sawtooth:
 * between consuming its inputs and producing its outputs a factory legitimately
 * holds value that is in neither container.
 */
function ledger(world: World, factory: FactoryState): number {
  const inFlight = factory.startedTick === null ? 0 : 2; // GRIND's inputs, in units
  return unitsIn(world.inventory) + unitsIn(factory.input) + unitsIn(factory.output) + inFlight;
}

function millWorld(wheat: number, outputSlots: number): { world: World; factory: FactoryState } {
  const world = createWorld(7);
  world.itemRegistry.register({
    id: FLOUR,
    displayName: 'Flour',
    sprite: 'items:flour',
    basePrice: 1,
    stackSize: DEFAULT_STACK_SIZE,
  });
  world.recipeRegistry.register(GRIND);

  const factory = createFactoryState(4, outputSlots);
  factory.recipeId = GRIND.id;
  addItems(factory.input, WHEAT, wheat, DEFAULT_STACK_SIZE);
  world.factories.set(asBuildingId(1), factory);
  return { world, factory };
}

describe('conservation across crafting (ADR-035 Rule D)', () => {
  it('total units are invariant across an arbitrary run, at every single tick', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }), // wheat delivered
        fc.integer({ min: 1, max: 4 }), // output slots — small ones stall the mill
        fc.integer({ min: 1, max: 400 }), // ticks to run
        (wheat, outputSlots, ticks) => {
          const { world, factory } = millWorld(wheat, outputSlots);
          const start = ledger(world, factory);

          for (let tick = 1; tick <= ticks; tick += 1) {
            world.tick = tick;
            productionSystem(world);
            // Checked EVERY tick, not just at the end: a craft that created and
            // then destroyed the same amount would balance at the end and be
            // wrong throughout.
            expect(ledger(world, factory)).toBe(start);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('stays invariant while goods are hauled in and out mid-run', () => {
    // The real chain has a hauler moving items while the mill runs. Interleaving
    // transfers with crafts is where a naive implementation double-counts.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            atTick: fc.integer({ min: 1, max: 300 }),
            take: fc.boolean(),
            quantity: fc.integer({ min: 1, max: 6 }),
          }),
          { maxLength: 20 },
        ),
        (moves) => {
          const { world, factory } = millWorld(30, 4);
          addItems(world.inventory, WHEAT, 50, DEFAULT_STACK_SIZE);
          const start = ledger(world, factory);

          for (let tick = 1; tick <= 300; tick += 1) {
            world.tick = tick;
            productionSystem(world);

            for (const move of moves.filter((m) => m.atTick === tick)) {
              if (move.take) {
                // Pull finished flour out to the inventory — a hauler emptying
                // the output, which is what unblocks a stalled mill.
                const moved = Math.min(move.quantity, containerCount(factory.output, FLOUR));
                if (moved > 0) {
                  removeItems(factory.output, FLOUR, moved);
                  addItems(world.inventory, FLOUR, moved, DEFAULT_STACK_SIZE);
                }
              } else {
                // Push wheat in from the inventory.
                const moved = Math.min(move.quantity, containerCount(world.inventory, WHEAT));
                if (moved > 0) {
                  removeItems(world.inventory, WHEAT, moved);
                  const { added } = addItems(factory.input, WHEAT, moved, DEFAULT_STACK_SIZE);
                  // Whatever did not fit goes back — never dropped (ADR-011 §7).
                  if (added < moved) {
                    addItems(world.inventory, WHEAT, moved - added, DEFAULT_STACK_SIZE);
                  }
                }
              }
            }

            expect(ledger(world, factory)).toBe(start);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a mill stalled on a full output loses nothing over a long run', () => {
    // Rule E's stall, held for far longer than any craft, with the ledger
    // watching. The failure this guards is a factory that keeps consuming while
    // it cannot deliver.
    const { world, factory } = millWorld(40, 1);
    addItems(factory.output, FLOUR, DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
    const start = ledger(world, factory);

    for (let tick = 1; tick <= 5_000; tick += 1) {
      world.tick = tick;
      productionSystem(world);
    }

    expect(ledger(world, factory)).toBe(start);
    // And the wheat is all still there — it was never consumed.
    expect(containerCount(factory.input, WHEAT)).toBe(40);
  });
});
