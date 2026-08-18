/**
 * Offline production. Phase-25 — `GAME_DESIGN.md` §9.2, ADR-035 §3.
 *
 * v0.4's fourth success criterion is that offline catch-up stays accurate with
 * production chains active. This is the first half of it: a factory that was
 * grinding when the player left must have ground while they were away.
 *
 * ## The rule every assertion here serves
 *
 * `GAME_DESIGN.md` §9.2's round-down rule — the credited result may be LESS
 * than running the ticks for real, never MORE. This project has been bitten by
 * the other direction twice (the 09c over-credit took a property test months
 * to find), so the property test at the bottom is the one that matters and the
 * examples above it are there to make failures legible.
 *
 * ## Why phase 25's version is simple, and where it stops being simple
 *
 * Nothing delivers to a factory yet. A mill's input holds exactly what it held
 * when the player left, so the credit is bounded by three fixed quantities —
 * elapsed time, the inputs present, and the space in the output — and none of
 * them moves during the gap. That makes this closed form genuinely exact
 * rather than approximate, which is a nicer position than the crop model's.
 *
 * Phase 26 breaks that: once haulers move goods between buildings, a factory's
 * inputs grow during the gap and the chain has to be modelled rather than
 * computed. This test is written so that change shows up as failures here
 * rather than as silence.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { catchUpWorld } from '../src/persistence/catch-up';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { setFactoryRecipe } from '../src/sim/commands/factory-commands';
import { CORE_MILL } from '../src/sim/content/buildings';
import { CORE_FLOUR, CORE_WHEAT, DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { CORE_GRIND_FLOUR } from '../src/sim/content/recipes';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems, containerCount } from '../src/sim/world/container';
import type { FactoryState } from '../src/sim/world/factory';
import { createWorld, type World } from '../src/sim/world/world';

/** Ticks one grind takes — read from content, never pinned here. */
function craftTicks(world: World): number {
  const recipe = world.recipeRegistry.get(CORE_GRIND_FLOUR);
  if (!recipe.ok) throw new Error('core:grind_flour must be registered');
  return recipe.value.craftTicks;
}

/** A mill with `wheat` delivered and its recipe set, nothing running yet. */
function millWorld(wheat: number): { world: World; factory: FactoryState } {
  const world = createWorld(5);
  world.wallet.coins = 100_000;
  const placed = placeBuilding(world, 32 * 80 + 32, CORE_MILL);
  if (!placed.ok) throw new Error('the mill must place');
  const building = [...world.buildings.keys()].at(-1)!;
  const chosen = setFactoryRecipe(world, building, CORE_GRIND_FLOUR);
  if (!chosen.ok) throw new Error('the recipe must be selectable');

  const factory = world.factories.get(building)!;
  addItems(factory.input, CORE_WHEAT, wheat, DEFAULT_STACK_SIZE);
  return { world, factory };
}

describe('a factory produces while the player is away', () => {
  it('credits nothing when the gap is shorter than one craft', () => {
    const { world, factory } = millWorld(10);

    catchUpWorld(world, craftTicks(world) - 1);

    expect(containerCount(factory.output, CORE_FLOUR)).toBe(0);
  });

  it('credits a craft once a full craft fits in the gap', () => {
    const { world, factory } = millWorld(10);

    catchUpWorld(world, craftTicks(world) + 1);

    expect(containerCount(factory.output, CORE_FLOUR)).toBe(1);
    expect(containerCount(factory.input, CORE_WHEAT)).toBe(8);
  });

  it('credits several crafts over a long gap', () => {
    const { world, factory } = millWorld(10);

    catchUpWorld(world, craftTicks(world) * 5 + 1);

    expect(containerCount(factory.output, CORE_FLOUR)).toBe(5);
    expect(containerCount(factory.input, CORE_WHEAT)).toBe(0);
  });

  it('stops at the inputs it had — nothing delivers during a gap', () => {
    const { world, factory } = millWorld(4); // two crafts' worth

    catchUpWorld(world, craftTicks(world) * 50);

    expect(containerCount(factory.output, CORE_FLOUR)).toBe(2);
    expect(containerCount(factory.input, CORE_WHEAT)).toBe(0);
  });

  it('stops at the space in its output, and keeps the inputs it could not use', () => {
    // Rule A across a gap: nothing is consumed that could not be delivered.
    const { world, factory } = millWorld(40);
    addItems(factory.output, CORE_FLOUR, DEFAULT_STACK_SIZE * 4 - 3, DEFAULT_STACK_SIZE);
    const spaceLeft = 3;

    catchUpWorld(world, craftTicks(world) * 50);

    expect(containerCount(factory.output, CORE_FLOUR)).toBe(DEFAULT_STACK_SIZE * 4);
    expect(containerCount(factory.input, CORE_WHEAT)).toBe(40 - spaceLeft * 2);
  });

  it('does nothing at all with no recipe selected', () => {
    const { world, factory } = millWorld(10);
    factory.recipeId = null;

    catchUpWorld(world, craftTicks(world) * 10);

    expect(containerCount(factory.input, CORE_WHEAT)).toBe(10);
    expect(containerCount(factory.output, CORE_FLOUR)).toBe(0);
  });

  it('finishes a craft that was already running when the player left', () => {
    const { world, factory } = millWorld(2);
    stepSimulationBy(world, 10); // the craft starts
    expect(factory.startedTick).not.toBeNull();

    catchUpWorld(world, craftTicks(world));

    expect(containerCount(factory.output, CORE_FLOUR)).toBe(1);
  });
});

describe('the round-down rule (GAME_DESIGN.md §9.2)', () => {
  it('never credits more than running the ticks for real', () => {
    // THE test. Everything above is an example; this is the promise. The
    // comparison is against the real simulation rather than a second model,
    // so a model that drifts from the game fails here rather than agreeing
    // with itself.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }), // wheat present
        fc.integer({ min: 0, max: 380 }), // flour already in the output
        fc.integer({ min: 1, max: 20_000 }), // gap
        (wheat, flour, gap) => {
          const offline = millWorld(wheat);
          // The same farm, stepped for real rather than modelled. Comparing
          // against the SIMULATION rather than a second model is the point: a
          // model that drifts from the game fails here instead of agreeing
          // with itself. Pre-filling the output reaches the full-output case,
          // which is where a careless model over-credits.
          const live = millWorld(wheat);
          for (const target of [offline, live]) {
            addItems(target.factory.output, CORE_FLOUR, flour, DEFAULT_STACK_SIZE);
          }

          catchUpWorld(offline.world, gap);
          stepSimulationBy(live.world, gap);

          const credited = containerCount(offline.factory.output, CORE_FLOUR);
          const real = containerCount(live.factory.output, CORE_FLOUR);
          expect(credited).toBeLessThanOrEqual(real);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('conserves quantity across the gap, counting a craft as an exchange', () => {
    // 2 wheat → 1 flour, so wheat + 2×flour is invariant however many crafts
    // were credited. A gap that created or destroyed value fails here.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 1, max: 50_000 }),
        (w, gap) => {
          const { world, factory } = millWorld(w);
          const before =
            containerCount(factory.input, CORE_WHEAT) +
            2 * containerCount(factory.output, CORE_FLOUR);

          catchUpWorld(world, gap);

          const after =
            containerCount(factory.input, CORE_WHEAT) +
            2 * containerCount(factory.output, CORE_FLOUR);
          expect(after).toBe(before);
        },
      ),
      { numRuns: 200 },
    );
  });
});
