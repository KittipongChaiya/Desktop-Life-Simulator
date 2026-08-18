import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';
import { DEFAULT_STACK_SIZE } from '../content/items';
import type { RecipeDefinition } from '../content/recipes';
import { addItems } from '../world/container';
import { createFactoryState } from '../world/factory';
import { createWorld, type World } from '../world/world';

import { projectFactories, factoriesEqual } from './factories-slice';

const MILL = asContentId('test:mill');
const WHEAT = asContentId('core:wheat');
const FLOUR = asContentId('test:flour');

const GRIND: RecipeDefinition = {
  id: asContentId('test:grind'),
  displayName: 'Grind Flour',
  building: MILL,
  inputs: [{ item: WHEAT, quantity: 2 }],
  outputs: [{ item: FLOUR, quantity: 1 }],
  craftTicks: 100,
};

function millWorld(wheat: number, outputSlots = 4): World {
  const world = createWorld(3);
  world.itemRegistry.register({
    id: FLOUR,
    displayName: 'Flour',
    sprite: 'x',
    basePrice: 1,
    stackSize: DEFAULT_STACK_SIZE,
  });
  world.recipeRegistry.register(GRIND);
  const factory = createFactoryState(4, outputSlots);
  factory.recipeId = GRIND.id;
  addItems(factory.input, WHEAT, wheat, DEFAULT_STACK_SIZE);
  world.factories.set(1 as never, factory);
  return world;
}

describe('projecting a factory for the panel', () => {
  it('names the recipe a player reads', () => {
    const view = projectFactories(millWorld(4))[0];
    expect(view?.recipeName).toBe('Grind Flour');
  });

  it('reports no progress when nothing is running', () => {
    expect(projectFactories(millWorld(4))[0]?.progress).toBeNull();
  });

  it('reports progress as a fraction of the craft', () => {
    const world = millWorld(4);
    world.factories.get(1 as never)!.startedTick = 100;
    world.tick = 125;

    expect(projectFactories(world)[0]?.progress).toBeCloseTo(0.25, 5);
  });

  it('never reports a full bar, because a full craft has already landed', () => {
    // A craft at 1.0 completes on that tick and clears `startedTick`, so a bar
    // showing full would be the view telling a different story from the sim.
    const world = millWorld(4);
    world.factories.get(1 as never)!.startedTick = 0;
    world.tick = 100;

    expect(projectFactories(world)[0]?.progress).toBeLessThan(1);
  });
});

describe('why a factory is idle — derived, never stored (ADR-035 Rule B)', () => {
  it('says so when no recipe is chosen', () => {
    const world = millWorld(4);
    world.factories.get(1 as never)!.recipeId = null;

    expect(projectFactories(world)[0]?.idleReason).toBe('no-recipe');
  });

  it('says so when the inputs are short', () => {
    expect(projectFactories(millWorld(1))[0]?.idleReason).toBe('missing-inputs');
  });

  it('says so when the output is full', () => {
    const world = millWorld(10, 1);
    addItems(
      world.factories.get(1 as never)!.output,
      FLOUR,
      DEFAULT_STACK_SIZE,
      DEFAULT_STACK_SIZE,
    );

    expect(projectFactories(world)[0]?.idleReason).toBe('output-full');
  });

  it('prefers the full output over the missing inputs when both are true', () => {
    // A full output is the condition a player can act on, and it is the one
    // that stalls a chain. Asked in the same order the production system asks.
    const world = millWorld(0, 1);
    addItems(
      world.factories.get(1 as never)!.output,
      FLOUR,
      DEFAULT_STACK_SIZE,
      DEFAULT_STACK_SIZE,
    );

    expect(projectFactories(world)[0]?.idleReason).toBe('output-full');
  });

  it('reports nothing while a craft is running', () => {
    const world = millWorld(4);
    world.factories.get(1 as never)!.startedTick = 0;
    world.tick = 10;

    expect(projectFactories(world)[0]?.idleReason).toBeNull();
  });
});

describe('the change test', () => {
  it('holds a slice steady while a craft advances imperceptibly', () => {
    // THE reason this test exists. Without a tolerance the slice would
    // republish on every tick of every craft — twenty times a second, per
    // factory — and ADR-005 §2's no-work-when-nothing-changed invariant would
    // be quietly gone.
    const world = millWorld(4);
    world.factories.get(1 as never)!.startedTick = 0;

    world.tick = 1000;
    const a = projectFactories(world);
    world.tick = 1000 + 1;
    const b = projectFactories(world);

    expect(factoriesEqual(a, b)).toBe(true);
  });

  it('republishes once the progress a player can see has moved', () => {
    const world = millWorld(4);
    world.factories.get(1 as never)!.startedTick = 0;

    world.tick = 10;
    const a = projectFactories(world);
    world.tick = 40;
    const b = projectFactories(world);

    expect(factoriesEqual(a, b)).toBe(false);
  });

  it('republishes when the contents change', () => {
    const world = millWorld(4);
    const a = projectFactories(world);
    addItems(world.factories.get(1 as never)!.input, WHEAT, 2, DEFAULT_STACK_SIZE);

    expect(factoriesEqual(a, projectFactories(world))).toBe(false);
  });
});
