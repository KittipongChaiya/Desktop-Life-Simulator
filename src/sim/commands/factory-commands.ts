/**
 * Factory commands. Phase-25 — ADR-035 §5, ADR-010.
 *
 * A factory runs the recipe the player SELECTED. It does not look at its input
 * buffer and decide, and that is the decision this file exists to enforce:
 * inference would let a stray delivery silently change what a building makes,
 * so a mill producing flour for six hours would start producing something else
 * because one wrong stack arrived, with nothing on screen to explain it.
 * Explicit selection also gives an empty factory a legible answer to "what is
 * this for" before anything has been delivered to it.
 */

import { appError, ErrorCode } from '../../shared/errors';
import {
  asBuildingId,
  asContentId,
  isContentId,
  type BuildingId,
  type ContentId,
} from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { recipesFor, type RecipeRegistry } from '../content/recipes';
import { acceptable, addItems } from '../world/container';
import type { FactoryState } from '../world/factory';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

/** The stack size an item declares, defaulting when it is unknown. */
function stackSizeOf(world: CommandWorld, item: ContentId): number {
  const definition = world.itemRegistry.get(item);
  return definition.ok ? definition.value.stackSize : 1;
}

/** Whether `building` is a kind some registered recipe names (ADR-035 §1). */
export function isFactoryKind(registry: RecipeRegistry, buildingKind: ContentId): boolean {
  return recipesFor(registry, buildingKind).length > 0;
}

/**
 * Checks a recipe change is legal.
 *
 * The interesting rejection is the last one. Changing the recipe while a craft
 * runs CANCELS it and returns its inputs (ADR-035 §5) — but if the input
 * container has since filled, those inputs have nowhere to go, and adding them
 * anyway would silently drop the overflow. Refusing is the only answer that
 * neither destroys goods (ADR-011 §7) nor leaves the world in a state the
 * simulation could not have reached.
 */
export function validateSetFactoryRecipe(
  world: CommandWorld,
  building: BuildingId,
  recipeId: ContentId | null,
): ValidationResult {
  const placed = world.buildings.get(building);
  if (placed === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such building', { building }));
  }

  const factory = world.factories.get(building);
  if (factory === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'building is not a factory', { building }));
  }

  if (recipeId !== null) {
    const recipe = world.recipeRegistry.get(recipeId);
    if (!recipe.ok) return err(recipe.error);

    // A mill cannot bake. Refused here rather than accepted and then silently
    // never run, which to a player is a building that does nothing.
    if (recipe.value.building !== placed.buildingId) {
      return err(
        appError(ErrorCode.InvalidIntent, 'recipe belongs to another building kind', {
          building,
          recipe: recipeId,
          expected: recipe.value.building,
          actual: placed.buildingId,
        }),
      );
    }
  }

  const returning = runningInputs(world, factory);
  for (const stack of returning) {
    if (acceptable(factory.input, stack.item, stackSizeOf(world, stack.item)) < stack.quantity) {
      return err(
        appError(ErrorCode.InvalidIntent, 'cannot return the running craft’s inputs', {
          building,
          item: stack.item,
        }),
      );
    }
  }

  return ok();
}

/** The inputs a running craft consumed, or nothing when none is running. */
function runningInputs(
  world: CommandWorld,
  factory: FactoryState,
): readonly { readonly item: ContentId; readonly quantity: number }[] {
  if (factory.startedTick === null || factory.recipeId === null) return [];
  const recipe = world.recipeRegistry.get(factory.recipeId);
  return recipe.ok ? recipe.value.inputs : [];
}

/**
 * Sets (or clears) what a factory makes.
 *
 * A craft in flight is CANCELLED and its inputs returned — not silently
 * finished under the old recipe, and not destroyed. The return is an ordinary
 * container add, so quantity is conserved and Rule C's "no half-applied craft"
 * still holds: the craft either ran to completion or never happened.
 */
export function setFactoryRecipe(
  world: CommandWorld,
  building: BuildingId,
  recipeId: ContentId | null,
): Result<void> {
  const validation = validateSetFactoryRecipe(world, building, recipeId);
  if (!validation.ok) return validation;

  const factory = world.factories.get(building);
  if (factory === undefined) {
    // Unreachable — validated above; handled over asserted (`CODE_STYLE.md` §1.2).
    return err(appError(ErrorCode.InvalidIntent, 'building is not a factory', { building }));
  }

  for (const stack of runningInputs(world, factory)) {
    addItems(factory.input, stack.item, stack.quantity, stackSizeOf(world, stack.item));
  }

  factory.startedTick = null;
  factory.recipeId = recipeId;
  // A fresh selection deserves a fresh look: without this the factory would sit
  // out the remainder of a back-off it entered under the previous recipe, which
  // reads as a building ignoring the player for a second (ADR-035 §6).
  factory.replanTick = 0;
  return ok();
}

/** Parses a raw command field into a building id (untrusted input, ADR-010 §5). */
function toPlacedBuildingId(building: number): Result<BuildingId> {
  if (!Number.isSafeInteger(building) || building < 1) {
    return err(appError(ErrorCode.InvalidIntent, 'malformed building id', { building }));
  }
  return ok(asBuildingId(building));
}

/** Parses a raw recipe field. `null` is legal and clears the selection. */
function toRecipeId(recipeId: string | null): Result<ContentId | null> {
  if (recipeId === null) return ok(null);
  if (!isContentId(recipeId)) {
    return err(appError(ErrorCode.UnknownContent, 'malformed recipe id', { recipeId }));
  }
  return ok(asContentId(recipeId));
}

export function registerFactoryCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('setFactoryRecipe', {
    validate: (world, command) => {
      const building = toPlacedBuildingId(command.building);
      if (!building.ok) return building;
      const recipeId = toRecipeId(command.recipeId);
      return recipeId.ok
        ? validateSetFactoryRecipe(world, building.value, recipeId.value)
        : recipeId;
    },
    execute: (context, command) => {
      const building = toPlacedBuildingId(command.building);
      if (!building.ok) return building;
      const recipeId = toRecipeId(command.recipeId);
      return recipeId.ok
        ? setFactoryRecipe(context.world, building.value, recipeId.value)
        : recipeId;
    },
  });
}
