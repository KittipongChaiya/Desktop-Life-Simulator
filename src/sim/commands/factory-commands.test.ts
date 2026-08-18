/**
 * Factory commands. Phase-25 — ADR-035 §5, ADR-010.
 *
 * Two questions: does placing a factory building open its production state,
 * and can the player choose what it makes? The second is a command because the
 * recipe is CHOSEN and never inferred (ADR-035 §5) — a factory that read its
 * input buffer and decided would silently change product when a stray delivery
 * arrived, with nothing on screen to explain it.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asContentId, type BuildingId } from '../../shared/ids';
import { CORE_KITCHEN, CORE_MILL, CORE_STORAGE_SHED } from '../content/buildings';
import { CORE_GRIND_FLOUR, CORE_BAKE_BREAD } from '../content/recipes';
import { addItems } from '../world/container';
import { createWorld, type World } from '../world/world';

import { placeBuilding, sellBuilding } from './building-commands';
import { setFactoryRecipe } from './factory-commands';

const CENTRE = toIndexUnchecked(32, 32);
const NEXT = toIndexUnchecked(33, 32);

/** A world with coins enough to build anything in the shop. */
function fundedWorld(): World {
  const world = createWorld(42);
  world.wallet.coins = 100_000;
  return world;
}

/** Places `buildingId` at `tile` and returns the id it was given. */
function place(world: World, tile: number, buildingId: ReturnType<typeof asContentId>): BuildingId {
  const placed = placeBuilding(world, tile, buildingId);
  expect(placed.ok, `placing ${buildingId}`).toBe(true);
  return [...world.buildings.keys()].at(-1)!;
}

describe('placing a factory opens its production state', () => {
  it('gives a mill an entry with two empty containers and no recipe', () => {
    const world = fundedWorld();

    const id = place(world, CENTRE, CORE_MILL);

    const factory = world.factories.get(id);
    expect(factory).toBeDefined();
    expect(factory?.recipeId).toBeNull();
    expect(factory?.startedTick).toBeNull();
    expect(factory?.input.stacks).toEqual([]);
    expect(factory?.output.stacks).toEqual([]);
  });

  it('gives a storage shed no production state at all', () => {
    // A building is a factory because a recipe NAMES it (ADR-035 §1). Nothing
    // names the shed, so it pays for no machinery — ADR-004 §4's side-table
    // rule, which is the whole reason this is not a field on every building.
    const world = fundedWorld();

    const id = place(world, CENTRE, CORE_STORAGE_SHED);

    expect(world.factories.has(id)).toBe(false);
    expect(world.buildingStorage.has(id)).toBe(true);
  });

  it('keeps a factory OUT of the general storage map', () => {
    // The jam this prevents: `selectStorageTarget` picks nearest-with-space
    // blind to kind, so a mill listed here would have workers fill its input
    // buffer with whatever they were carrying (ADR-035 §2).
    const world = fundedWorld();

    const id = place(world, CENTRE, CORE_MILL);

    expect(world.buildingStorage.has(id)).toBe(false);
  });
});

describe('selling a factory', () => {
  it('removes its production state with it', () => {
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);

    expect(sellBuilding(world, id).ok).toBe(true);
    expect(world.factories.has(id)).toBe(false);
  });

  it('refuses while goods are still inside, exactly as a full shed does', () => {
    // Never destroy player value (ADR-011 §7, `GAME_DESIGN.md` §12 rule 4).
    // The rule already existed for storage; a factory's two containers are the
    // same promise, and a mill mid-craft is the case a player would notice.
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);
    addItems(world.factories.get(id)!.input, asContentId('core:wheat'), 5, 99);

    expect(sellBuilding(world, id).ok).toBe(false);
    expect(world.factories.has(id)).toBe(true);
  });

  it('refuses when only the OUTPUT holds goods', () => {
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);
    addItems(world.factories.get(id)!.output, asContentId('core:flour'), 1, 99);

    expect(sellBuilding(world, id).ok).toBe(false);
  });

  it('allows the sale once both containers are empty', () => {
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);

    expect(sellBuilding(world, id).ok).toBe(true);
  });
});

describe('setFactoryRecipe — chosen, never inferred', () => {
  it('sets a recipe the building can run', () => {
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);

    expect(setFactoryRecipe(world, id, CORE_GRIND_FLOUR).ok).toBe(true);
    expect(world.factories.get(id)?.recipeId).toBe(CORE_GRIND_FLOUR);
  });

  it('refuses a recipe belonging to a different building kind', () => {
    // A mill cannot bake. Refused at the command boundary rather than silently
    // producing nothing, which is what "a factory that does nothing" looks
    // like to a player.
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);

    expect(setFactoryRecipe(world, id, CORE_BAKE_BREAD).ok).toBe(false);
    expect(world.factories.get(id)?.recipeId).toBeNull();
  });

  it('refuses an unregistered recipe', () => {
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);

    expect(setFactoryRecipe(world, id, asContentId('gone:vanished')).ok).toBe(false);
  });

  it('refuses a building that is not a factory', () => {
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_STORAGE_SHED);

    expect(setFactoryRecipe(world, id, CORE_GRIND_FLOUR).ok).toBe(false);
  });

  it('accepts the kitchen’s own recipe', () => {
    const world = fundedWorld();
    const id = place(world, NEXT, CORE_KITCHEN);

    expect(setFactoryRecipe(world, id, CORE_BAKE_BREAD).ok).toBe(true);
  });

  it('clears the selection when given null', () => {
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);
    setFactoryRecipe(world, id, CORE_GRIND_FLOUR);

    expect(setFactoryRecipe(world, id, null).ok).toBe(true);
    expect(world.factories.get(id)?.recipeId).toBeNull();
  });
});

describe('changing the recipe mid-craft returns the inputs (ADR-035 §5)', () => {
  it('cancels the running craft and puts its inputs back', () => {
    // Not silently finishing the old one, and not destroying goods either: the
    // return is a transfer, so conservation holds and Rule C stays intact.
    const world = fundedWorld();
    const id = place(world, CENTRE, CORE_MILL);
    const factory = world.factories.get(id)!;

    setFactoryRecipe(world, id, CORE_GRIND_FLOUR);
    addItems(factory.input, asContentId('core:wheat'), 2, 99);
    world.tick = 100;
    // The production system consumes the inputs and starts the craft.
    factory.startedTick = 100;
    factory.input.stacks = [];

    expect(setFactoryRecipe(world, id, null).ok).toBe(true);

    expect(factory.startedTick).toBeNull();
    expect(factory.input.stacks).toEqual([{ item: asContentId('core:wheat'), quantity: 2 }]);
  });
});
