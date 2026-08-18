import { describe, expect, it } from 'vitest';

import { asContentId, type ContentId } from '../../shared/ids';

import {
  createRecipeRegistry,
  isRunnableRecipe,
  recipesFor,
  type RecipeDefinition,
} from './recipes';

const MILL = asContentId('core:mill');
const KITCHEN = asContentId('core:kitchen');
const WHEAT = asContentId('core:wheat');
const FLOUR = asContentId('core:flour');
const BREAD = asContentId('core:bread');

function recipe(patch: Partial<RecipeDefinition> = {}): RecipeDefinition {
  return {
    id: asContentId('core:grind_flour'),
    displayName: 'Grind Flour',
    building: MILL,
    inputs: [{ item: WHEAT, quantity: 2 }],
    outputs: [{ item: FLOUR, quantity: 1 }],
    craftTicks: 200,
    ...patch,
  };
}

describe('the recipe registry', () => {
  it('registers and returns a recipe by id', () => {
    // Arrange
    const registry = createRecipeRegistry();
    const definition = recipe();

    // Act
    const registered = registry.register(definition);

    // Assert
    expect(registered.ok).toBe(true);
    const found = registry.get(definition.id);
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.value.craftTicks).toBe(200);
  });

  it('rejects a duplicate id', () => {
    const registry = createRecipeRegistry();
    registry.register(recipe());

    expect(registry.register(recipe()).ok).toBe(false);
  });
});

describe('recipesFor — the query that makes a building a factory (ADR-035 §1)', () => {
  it('returns every recipe naming the building, in registration order', () => {
    // Arrange — two mill recipes and one kitchen recipe, interleaved so the
    // filter cannot pass by accident of ordering.
    const registry = createRecipeRegistry();
    registry.register(recipe({ id: asContentId('core:grind_flour') }));
    registry.register(
      recipe({
        id: asContentId('core:bake_bread'),
        building: KITCHEN,
        inputs: [{ item: FLOUR, quantity: 2 }],
        outputs: [{ item: BREAD, quantity: 1 }],
      }),
    );
    registry.register(
      recipe({
        id: asContentId('core:grind_coarse'),
        inputs: [{ item: WHEAT, quantity: 3 }],
        outputs: [{ item: FLOUR, quantity: 2 }],
      }),
    );

    // Act
    const millRecipes = recipesFor(registry, MILL);

    // Assert
    expect(millRecipes.map((r) => r.id)).toEqual([
      asContentId('core:grind_flour'),
      asContentId('core:grind_coarse'),
    ]);
  });

  it('returns nothing for a building no recipe names', () => {
    const registry = createRecipeRegistry();
    registry.register(recipe());

    // A rest hut is not a factory, and that is expressed by absence rather
    // than by a flag on the building (ADR-035 §1).
    expect(recipesFor(registry, asContentId('core:rest_hut'))).toEqual([]);
  });

  it('lets a third-party recipe name a first-party building', () => {
    // The whole reason the recipe names the building rather than the reverse:
    // a content pack extends the core mill with no core edit (ADR-035 §1).
    const registry = createRecipeRegistry();
    registry.register(
      recipe({
        id: asContentId('barleymod:grind_barley'),
        inputs: [{ item: asContentId('barleymod:barley'), quantity: 2 }],
      }),
    );

    expect(recipesFor(registry, MILL).map((r) => r.id)).toEqual([
      asContentId('barleymod:grind_barley'),
    ]);
  });
});

describe('isRunnableRecipe — refused at registration, not discovered at runtime', () => {
  it('accepts an ordinary recipe', () => {
    expect(isRunnableRecipe(recipe())).toBe(true);
  });

  it('refuses a recipe that produces nothing', () => {
    // A pure sink destroys the player's goods for no return —
    // `GAME_DESIGN.md` §12 rule 4 forbids decay that destroys player value.
    expect(isRunnableRecipe(recipe({ outputs: [] }))).toBe(false);
  });

  it('accepts a recipe that consumes nothing', () => {
    // Deliberately legal: a generator is bounded by `craftTicks` and by its
    // output space, so it is a balance choice for content rather than a
    // malformed definition. Stated as a test so the omission reads as a
    // decision and not an oversight.
    expect(isRunnableRecipe(recipe({ inputs: [] }))).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses craftTicks of %p',
    (craftTicks) => {
      // Integers only (ADR-007 §7). A zero-tick craft would also complete on
      // the tick it began and could loop unboundedly inside one tick.
      expect(isRunnableRecipe(recipe({ craftTicks }))).toBe(false);
    },
  );

  it.each([0, -3, 2.5])('refuses an input quantity of %p', (quantity) => {
    expect(isRunnableRecipe(recipe({ inputs: [{ item: WHEAT, quantity }] }))).toBe(false);
  });

  it.each([0, -3, 2.5])('refuses an output quantity of %p', (quantity) => {
    expect(isRunnableRecipe(recipe({ outputs: [{ item: FLOUR, quantity }] }))).toBe(false);
  });

  it('refuses a recipe that names the same input twice', () => {
    // Two stacks of one item make "does the input hold enough" ambiguous —
    // the check would pass on either stack alone. Refused here, where the
    // author is told, rather than at craft time where it under-consumes.
    expect(
      isRunnableRecipe(
        recipe({
          inputs: [
            { item: WHEAT, quantity: 2 },
            { item: WHEAT, quantity: 3 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('refuses a recipe that names the same output twice', () => {
    expect(
      isRunnableRecipe(
        recipe({
          outputs: [
            { item: FLOUR, quantity: 1 },
            { item: FLOUR, quantity: 2 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('refuses a malformed building id', () => {
    // Existence cannot be checked here — registration order is the author's,
    // and the building may legitimately register after the recipe. Shape can.
    //
    // Cast because `asContentId` refuses to build one: in TypeScript a content
    // author cannot reach this state, but phase-09's loader reads third-party
    // sources off disk (ADR-019), so the value arriving here is untrusted at
    // runtime even though it is typed at compile time.
    const malformed = 'mill' as unknown as ContentId;

    expect(isRunnableRecipe(recipe({ building: malformed }))).toBe(false);
  });
});
