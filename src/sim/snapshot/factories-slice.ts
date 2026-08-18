/**
 * Factory snapshot projection. Phase-25 — ADR-005 §2, ADR-035.
 *
 * The sim→view boundary for production. Plain, immutable presentation data, so
 * the panel can show what a mill is making and how far along it is without
 * touching a `FactoryState`, the store, or the recipe registry.
 *
 * ## Progress is projected as a fraction, and computed here
 *
 * The view needs "how far along", which is `(tick − startedTick) / craftTicks`.
 * That could be computed in the panel from two numbers — and must not be:
 * ADR-005 §2 puts the projection in the simulation so the view holds no rule,
 * and a panel that did this arithmetic would be a second place the craft's
 * duration is understood. It is a FRACTION rather than a percentage or a pixel
 * width because presentation owns how to draw it.
 *
 * ## Blocked is a reading, not a stored flag
 *
 * ADR-035 §4 Rule B is explicit that a factory has no jammed state — a factory
 * that cannot proceed is simply idle. The panel still needs to SAY so, or a
 * player watching a stalled chain has nothing to go on, so the reason is
 * derived here at projection time from the same conditions the production
 * system tests. Deriving it keeps Rule B intact: nothing is recorded, so
 * nothing can be left stale.
 */

import type { ContentId } from '../../shared/ids';
import type { ItemRegistry } from '../content/items';
import type { RecipeRegistry } from '../content/recipes';
import { acceptable, containerCount, type Container } from '../world/container';
import type { FactoryState, FactoryStore } from '../world/factory';

/** Why a factory is not producing. `null` means it is. */
export type FactoryIdleReason = 'no-recipe' | 'missing-inputs' | 'output-full' | null;

/** One factory, projected for the panel. */
export interface FactoryView {
  readonly building: number;
  /** The chosen recipe, or null. */
  readonly recipeId: string | null;
  /** What a player reads. Empty when no recipe is chosen. */
  readonly recipeName: string;
  /** `[0, 1)` while a craft runs; null when nothing is running. */
  readonly progress: number | null;
  /** Why it is not producing, or null while it is. */
  readonly idleReason: FactoryIdleReason;
  readonly input: readonly { readonly item: string; readonly quantity: number }[];
  readonly output: readonly { readonly item: string; readonly quantity: number }[];
}

/** The world state the projection reads. `World` satisfies this structurally. */
export interface FactoryProjectionSource {
  readonly tick: number;
  readonly factories: FactoryStore;
  readonly recipeRegistry: RecipeRegistry;
  readonly itemRegistry: ItemRegistry;
}

function stacksOf(container: Container): readonly { item: string; quantity: number }[] {
  return container.stacks.map((stack) => ({ item: stack.item, quantity: stack.quantity }));
}

/**
 * Why this factory is not producing, asked in the same order the production
 * system asks it, so the panel and the simulation can never disagree.
 */
function idleReasonOf(
  source: FactoryProjectionSource,
  factory: FactoryState,
  recipe: {
    readonly inputs: readonly { item: ContentId; quantity: number }[];
    readonly outputs: readonly { item: ContentId; quantity: number }[];
  },
): FactoryIdleReason {
  const stackSize = (item: ContentId): number => {
    const definition = source.itemRegistry.get(item);
    return definition.ok ? definition.value.stackSize : 1;
  };

  for (const stack of recipe.outputs) {
    if (acceptable(factory.output, stack.item, stackSize(stack.item)) < stack.quantity) {
      // Checked before inputs deliberately: a full output is the condition a
      // player can DO something about, and it is the one that stalls a chain.
      return 'output-full';
    }
  }
  for (const stack of recipe.inputs) {
    if (containerCount(factory.input, stack.item) < stack.quantity) return 'missing-inputs';
  }
  return null;
}

/** Every factory, projected and ordered by building id (deterministic). */
export function projectFactories(source: FactoryProjectionSource): readonly FactoryView[] {
  return [...source.factories.entries()]
    .sort(([a], [b]) => a - b)
    .map(([building, factory]) => {
      const found = factory.recipeId === null ? null : source.recipeRegistry.get(factory.recipeId);
      const recipe = found !== null && found.ok ? found.value : null;

      // A running craft's progress, as a fraction. Clamped below 1 because a
      // craft at 1 has completed and the tick that completes it clears
      // `startedTick` — showing a full bar for a craft that has not landed
      // would be the view telling a different story from the simulation.
      const progress =
        recipe === null || factory.startedTick === null
          ? null
          : Math.min(0.999, (source.tick - factory.startedTick) / recipe.craftTicks);

      return {
        building,
        recipeId: factory.recipeId,
        recipeName: recipe?.displayName ?? '',
        progress,
        idleReason:
          recipe === null
            ? ('no-recipe' as const)
            : factory.startedTick !== null
              ? null
              : idleReasonOf(source, factory, recipe),
        input: stacksOf(factory.input),
        output: stacksOf(factory.output),
      };
    });
}

/** Change test — republishes only on a real change (ADR-005 §2). */
export function factoriesEqual(a: readonly FactoryView[], b: readonly FactoryView[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return false;
    if (x.building !== y.building || x.recipeId !== y.recipeId) return false;
    if (x.idleReason !== y.idleReason) return false;
    // Progress is compared at the precision a player can see. Without this the
    // slice would republish on EVERY tick of every craft — twenty times a
    // second, per factory — and the §4.2 no-work-when-nothing-changed invariant
    // would be quietly gone (ADR-005 §2).
    if (Math.round((x.progress ?? -1) * 100) !== Math.round((y.progress ?? -1) * 100)) return false;
    if (!stacksSame(x.input, y.input) || !stacksSame(x.output, y.output)) return false;
  }
  return true;
}

function stacksSame(
  a: readonly { item: string; quantity: number }[],
  b: readonly { item: string; quantity: number }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.item !== b[i]?.item || a[i]?.quantity !== b[i]?.quantity) return false;
  }
  return true;
}
