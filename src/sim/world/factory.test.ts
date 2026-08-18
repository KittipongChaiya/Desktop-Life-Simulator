import { describe, expect, it } from 'vitest';

import { asContentId, type ContentId } from '../../shared/ids';
import type { RecipeDefinition } from '../content/recipes';

import { addItems } from './container';
import {
  canStartCraft,
  craftCompletesAt,
  createFactoryState,
  isCraftComplete,
  type FactoryState,
} from './factory';

const MILL = asContentId('core:mill');
const WHEAT = asContentId('core:wheat');
const FLOUR = asContentId('core:flour');
const BRAN = asContentId('core:bran');

const STACK = 99;
const stackSizeOf = (): number => STACK;

const GRIND: RecipeDefinition = {
  id: asContentId('core:grind_flour'),
  displayName: 'Grind Flour',
  building: MILL,
  inputs: [{ item: WHEAT, quantity: 2 }],
  outputs: [{ item: FLOUR, quantity: 1 }],
  craftTicks: 200,
};

/** A factory with `wheat` already delivered and an empty output. */
function stocked(wheat: number, inputSlots = 4, outputSlots = 4): FactoryState {
  const factory = createFactoryState(inputSlots, outputSlots);
  addItems(factory.input, WHEAT, wheat, STACK);
  return factory;
}

describe('a fresh factory', () => {
  it('starts with no recipe, nothing running, and two empty containers', () => {
    const factory = createFactoryState(4, 4);

    expect(factory.recipeId).toBeNull();
    expect(factory.startedTick).toBeNull();
    expect(factory.input.stacks).toEqual([]);
    expect(factory.output.stacks).toEqual([]);
  });

  it('gives the input and output their own capacities', () => {
    // Two containers, not one: with a single container a mill would offer its
    // own flour back to the next craft as an ingredient (ADR-035 §2).
    const factory = createFactoryState(3, 7);

    expect(factory.input.capacity).toBe(3);
    expect(factory.output.capacity).toBe(7);
  });
});

describe('canStartCraft — Rule A: nothing is consumed until every output fits', () => {
  it('starts when the inputs are present and the output is empty', () => {
    expect(canStartCraft(stocked(2), GRIND, stackSizeOf)).toBe(true);
  });

  it('starts when the inputs are more than enough', () => {
    expect(canStartCraft(stocked(50), GRIND, stackSizeOf)).toBe(true);
  });

  it('refuses when an input is one short', () => {
    expect(canStartCraft(stocked(1), GRIND, stackSizeOf)).toBe(false);
  });

  it('refuses when the input holds nothing at all', () => {
    expect(canStartCraft(stocked(0), GRIND, stackSizeOf)).toBe(false);
  });

  it('refuses when the output has no room for the product', () => {
    // THE RULE-A CASE. Consuming here would either destroy the wheat
    // (ADR-011 §7 forbids it) or strand a craft that can never complete.
    const factory = stocked(10, 4, 1);
    addItems(factory.output, FLOUR, STACK, STACK); // the single slot, full

    expect(canStartCraft(factory, GRIND, stackSizeOf)).toBe(false);
  });

  it('refuses when only SOME of a multi-output recipe would fit', () => {
    // Every output stack must fit, not merely the first one — a partial fit
    // is exactly the state Rule A exists to refuse.
    const withBran: RecipeDefinition = {
      ...GRIND,
      outputs: [
        { item: FLOUR, quantity: 1 },
        { item: BRAN, quantity: 1 },
      ],
    };
    const factory = stocked(10, 4, 1);
    // One slot, holding flour with room to spare: the flour fits, the bran
    // has nowhere to go.
    addItems(factory.output, FLOUR, 1, STACK);

    expect(canStartCraft(factory, withBran, stackSizeOf)).toBe(false);
  });

  it('starts when the product tops up a partial stack rather than opening a slot', () => {
    const factory = stocked(10, 4, 1);
    addItems(factory.output, FLOUR, STACK - 1, STACK); // room for exactly one

    expect(canStartCraft(factory, GRIND, stackSizeOf)).toBe(true);
  });

  it('refuses a craft already running', () => {
    // Rule C: one craft at a time, atomic at both ends. A factory that could
    // start a second craft mid-flight would have two `startedTick`s to store
    // and one field to store them in.
    const factory = stocked(10);
    factory.startedTick = 5;

    expect(canStartCraft(factory, GRIND, stackSizeOf)).toBe(false);
  });

  it('starts a recipe that consumes nothing, while its output has room', () => {
    const generator: RecipeDefinition = { ...GRIND, inputs: [] };

    expect(canStartCraft(createFactoryState(4, 4), generator, stackSizeOf)).toBe(true);
  });
});

describe('craft timing — derived from one stored number (ADR-035 §3)', () => {
  it('completes at startedTick + craftTicks', () => {
    const factory = stocked(10);
    factory.startedTick = 1_000;

    expect(craftCompletesAt(factory, GRIND)).toBe(1_200);
  });

  it('has no completion tick when nothing is running', () => {
    expect(craftCompletesAt(createFactoryState(4, 4), GRIND)).toBeNull();
  });

  it('is not complete before its time, and is complete on the tick it lands', () => {
    const factory = stocked(10);
    factory.startedTick = 1_000;

    expect(isCraftComplete(factory, GRIND, 1_199)).toBe(false);
    expect(isCraftComplete(factory, GRIND, 1_200)).toBe(true);
  });

  it('stays complete after its tick, so a skipped tick cannot lose a craft', () => {
    // The back-off in ADR-035 §6 means a factory is not examined every tick.
    // A completion test written as equality would silently drop the craft on
    // any tick the factory was skipped.
    const factory = stocked(10);
    factory.startedTick = 1_000;

    expect(isCraftComplete(factory, GRIND, 5_000)).toBe(true);
  });

  it('is never complete when nothing is running', () => {
    expect(isCraftComplete(createFactoryState(4, 4), GRIND, 9_999)).toBe(false);
  });
});

describe('the recipe is chosen, never inferred (ADR-035 §5)', () => {
  it('holds the recipe id it was set to, independent of what was delivered', () => {
    // A factory full of wheat is not thereby a flour mill: a stray delivery
    // must never change what a building makes.
    const factory = stocked(10);
    const chosen: ContentId = GRIND.id;
    factory.recipeId = chosen;

    addItems(factory.input, asContentId('core:pumpkin'), 5, STACK);

    expect(factory.recipeId).toBe(chosen);
  });
});
