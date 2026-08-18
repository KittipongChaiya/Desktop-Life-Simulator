/**
 * The production system. Phase-25 — ADR-035 §4 (the jam rules), §6 (back-off).
 *
 * The rules under test are the ones v0.4's headline criterion depends on: a
 * chain that runs eight unattended hours without jamming. A jam is invisible
 * to any test that does not already know to look for it, so the distinction
 * between a STALL (permitted, self-clearing) and a JAM (a stall that outlives
 * its cause) is asserted here rather than assumed.
 */

import { describe, expect, it } from 'vitest';

import { asContentId, asBuildingId, type BuildingId } from '../../shared/ids';
import { DEFAULT_STACK_SIZE } from '../content/items';
import type { RecipeDefinition } from '../content/recipes';
import { addItems, containerCount, removeItems } from '../world/container';
import { createFactoryState, FACTORY_REPLAN_TICKS, type FactoryState } from '../world/factory';
import { createWorld, type World } from '../world/world';

import { productionSystem } from './production';

const MILL = asContentId('core:mill');
const WHEAT = asContentId('core:wheat');
const FLOUR = asContentId('core:flour');

const GRIND: RecipeDefinition = {
  id: asContentId('core:grind_flour'),
  displayName: 'Grind Flour',
  building: MILL,
  inputs: [{ item: WHEAT, quantity: 2 }],
  outputs: [{ item: FLOUR, quantity: 1 }],
  craftTicks: 200,
};

/**
 * A world with one mill, its recipe selected, and `wheat` delivered.
 *
 * `core:flour` is registered as an item so stack sizes resolve; the recipe
 * goes straight into the world's registry, which is what a content source
 * would have done through the public API.
 */
function millWorld(
  wheat: number,
  options: { readonly outputSlots?: number; readonly recipe?: RecipeDefinition } = {},
): { world: World; factory: FactoryState; id: BuildingId } {
  const world = createWorld(42);
  const recipe = options.recipe ?? GRIND;

  world.itemRegistry.register({
    id: FLOUR,
    displayName: 'Flour',
    sprite: 'items:flour',
    basePrice: 12,
    stackSize: DEFAULT_STACK_SIZE,
  });
  world.recipeRegistry.register(recipe);

  const id = asBuildingId(1);
  const factory = createFactoryState(4, options.outputSlots ?? 4);
  factory.recipeId = recipe.id;
  addItems(factory.input, WHEAT, wheat, DEFAULT_STACK_SIZE);
  world.factories.set(id, factory);

  return { world, factory, id };
}

describe('starting a craft', () => {
  it('consumes the inputs and records the tick it began', () => {
    const { world, factory } = millWorld(5);
    world.tick = 100;

    productionSystem(world);

    expect(containerCount(factory.input, WHEAT)).toBe(3);
    expect(factory.startedTick).toBe(100);
  });

  it('produces nothing on the tick it starts', () => {
    const { world, factory } = millWorld(5);
    world.tick = 100;

    productionSystem(world);

    expect(containerCount(factory.output, FLOUR)).toBe(0);
  });

  it('does nothing at all when no recipe is selected', () => {
    const { world, factory } = millWorld(5);
    factory.recipeId = null;
    world.tick = 100;

    productionSystem(world);

    expect(containerCount(factory.input, WHEAT)).toBe(5);
    expect(factory.startedTick).toBeNull();
  });

  it('does nothing when the selected recipe is not registered', () => {
    // Defensive: a save naming a recipe whose source was uninstalled. The
    // goods stay put — never destroyed (ADR-011 §7) — exactly as the stall
    // sweep leaves unknown goods alone.
    const { world, factory } = millWorld(5);
    factory.recipeId = asContentId('gone:vanished');
    world.tick = 100;

    productionSystem(world);

    expect(containerCount(factory.input, WHEAT)).toBe(5);
    expect(factory.startedTick).toBeNull();
  });
});

describe('completing a craft', () => {
  it('delivers the outputs on the completion tick', () => {
    const { world, factory } = millWorld(2);
    world.tick = 100;
    productionSystem(world);

    world.tick = 300; // 100 + craftTicks
    productionSystem(world);

    expect(containerCount(factory.output, FLOUR)).toBe(1);
    expect(factory.startedTick).toBeNull();
  });

  it('does not deliver early', () => {
    const { world, factory } = millWorld(2);
    world.tick = 100;
    productionSystem(world);

    world.tick = 299;
    productionSystem(world);

    expect(containerCount(factory.output, FLOUR)).toBe(0);
    expect(factory.startedTick).toBe(100);
  });

  it('starts the next craft on the same tick it finishes one', () => {
    // Otherwise every craft would pay an extra back-off delay, and a chain's
    // throughput would silently depend on the replan cadence.
    const { world, factory } = millWorld(4);
    world.tick = 100;
    productionSystem(world);

    world.tick = 300;
    productionSystem(world);

    expect(containerCount(factory.output, FLOUR)).toBe(1);
    expect(containerCount(factory.input, WHEAT)).toBe(0);
    expect(factory.startedTick).toBe(300);
  });

  it('runs a chain of crafts at the recipe cadence over many ticks', () => {
    const { world, factory } = millWorld(10);

    for (let tick = 1; tick <= 1_200; tick += 1) {
      world.tick = tick;
      productionSystem(world);
    }

    // 10 wheat at 2 each = 5 crafts; 5 × 200 ticks = 1,000, all inside 1,200.
    expect(containerCount(factory.output, FLOUR)).toBe(5);
    expect(containerCount(factory.input, WHEAT)).toBe(0);
  });
});

describe('Rule A — nothing is consumed unless the output will take it', () => {
  it('leaves the inputs untouched when the output is full', () => {
    const { world, factory } = millWorld(10, { outputSlots: 1 });
    addItems(factory.output, FLOUR, DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
    world.tick = 100;

    productionSystem(world);

    expect(containerCount(factory.input, WHEAT)).toBe(10);
    expect(factory.startedTick).toBeNull();
  });

  it('holds a finished craft rather than destroying it when the output filled mid-craft', () => {
    // The output had room when the craft began and lost it while running.
    // The product must wait, not vanish: the alternative is destroying player
    // value, which `GAME_DESIGN.md` §12 rule 4 forbids outright.
    const { world, factory } = millWorld(10, { outputSlots: 1 });
    world.tick = 100;
    productionSystem(world); // starts; 2 wheat consumed

    addItems(factory.output, FLOUR, DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
    world.tick = 300;
    productionSystem(world);

    // Still running, holding its product, nothing lost.
    expect(factory.startedTick).toBe(100);
    expect(containerCount(factory.output, FLOUR)).toBe(DEFAULT_STACK_SIZE);
  });
});

describe('Rule E — a stall clears itself; a jam would not', () => {
  it('resumes with no intervention once the blocked output drains', () => {
    // THE CRITERION. A chain stalled by a full downstream is correct
    // behaviour; a chain that stays stopped after the condition clears is the
    // jam v0.4 must not have.
    const { world, factory } = millWorld(10, { outputSlots: 1 });
    addItems(factory.output, FLOUR, DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);

    for (let tick = 1; tick <= 500; tick += 1) {
      world.tick = tick;
      productionSystem(world);
    }
    expect(factory.startedTick).toBeNull(); // stalled, as it should be

    // Somebody empties the output — a hauler, or the player.
    removeItems(factory.output, FLOUR, DEFAULT_STACK_SIZE);

    for (let tick = 501; tick <= 1_000; tick += 1) {
      world.tick = tick;
      productionSystem(world);
    }

    // It picked itself back up, unprompted.
    expect(containerCount(factory.output, FLOUR)).toBeGreaterThan(0);
  });
});

describe('the back-off (ADR-035 §6)', () => {
  it('defers re-examination after finding no work', () => {
    const { world, factory } = millWorld(0); // nothing to grind
    world.tick = 100;

    productionSystem(world);

    expect(factory.replanTick).toBe(100 + FACTORY_REPLAN_TICKS);
  });

  it('does not start a craft while backed off, even once inputs arrive', () => {
    // Bounded staleness, deliberately: the same trade the idle worker makes,
    // and invisible against craft times measured in hundreds of ticks.
    const { world, factory } = millWorld(0);
    world.tick = 100;
    productionSystem(world);

    addItems(factory.input, WHEAT, 10, DEFAULT_STACK_SIZE);
    world.tick = 105;
    productionSystem(world);

    expect(factory.startedTick).toBeNull();
  });

  it('starts once the back-off expires', () => {
    const { world, factory } = millWorld(0);
    world.tick = 100;
    productionSystem(world);
    addItems(factory.input, WHEAT, 10, DEFAULT_STACK_SIZE);

    world.tick = 100 + FACTORY_REPLAN_TICKS;
    productionSystem(world);

    expect(factory.startedTick).toBe(100 + FACTORY_REPLAN_TICKS);
  });

  it('never defers a RUNNING craft, so completion is not delayed by the back-off', () => {
    // The back-off governs looking for work, never finishing it. A craft that
    // completed during a deferral must land on the tick it is next examined.
    const { world, factory } = millWorld(2);
    world.tick = 100;
    productionSystem(world);

    world.tick = 500; // long past completion
    productionSystem(world);

    expect(containerCount(factory.output, FLOUR)).toBe(1);
  });
});

describe('determinism', () => {
  it('processes factories in building-id order regardless of insertion order', () => {
    // Map iteration is insertion order, and insertion order after a load is
    // whatever the deserializer happened to do. Sorting by id makes the tick
    // reproducible across a save round-trip (ADR-007).
    const { world } = millWorld(2);
    const late = createFactoryState(4, 4);
    late.recipeId = GRIND.id;
    addItems(late.input, WHEAT, 2, DEFAULT_STACK_SIZE);
    // Inserted after id 1, but with a LOWER id.
    world.factories.set(asBuildingId(0), late);

    world.tick = 100;
    productionSystem(world);

    for (const factory of world.factories.values()) {
      expect(factory.startedTick).toBe(100);
    }
  });
});
