/**
 * Recipe definitions. Phase-25 — ADR-035 §1, ADR-004 §5.
 *
 * A recipe is the KIND of transformation: what goes in, what comes out, how
 * long it takes, and — the load-bearing field — **which building kind runs
 * it**. It is registered once at startup, never mutated, and never saved; a
 * factory stores a `ContentId` and looks the definition up, exactly as a crop
 * instance references its `CropDefinition`.
 *
 * ## Why the recipe names the building
 *
 * The direction is the whole design (ADR-035 §1). If a `BuildingDefinition`
 * carried a list of recipes, adding one to the first-party mill would mean
 * editing first-party content — which a plugin cannot do, and which ADR-019
 * exists to make unnecessary. Named this way round, a content pack registers
 * `barleymod:grind_barley` against `core:mill` and the mill gains it with no
 * core edit at all. The set of recipes a building can run is therefore a
 * QUERY (`recipesFor`), never a stored list that could fall out of step with
 * the registry.
 *
 * It is the same asymmetry crops already have: a crop names the seasons it
 * grows in, and a season does not enumerate its crops.
 *
 * A building becomes a factory by being named by at least one recipe. There is
 * no `isFactory` flag anywhere, for the reason ADR-030 §4 gave when it refused
 * the identical temptation for town buildings — what makes a building "town"
 * is where it stands, and what makes a building a factory is that a recipe
 * names it.
 */

import { isContentId, type ContentId } from '../../shared/ids';
import type { ItemStack } from '../world/container';

import { createContentRegistry, type ContentRegistry } from './registry';

export interface RecipeDefinition {
  readonly id: ContentId;
  /** What a player reads. Presentation only — no rule may branch on it. */
  readonly displayName: string;
  /**
   * The building KIND that runs this — a `ContentId`, never an instance.
   *
   * Its EXISTENCE is deliberately not checked at registration: ordering within
   * a bundle is the author's business (`plugin-api.ts`), and a recipe may
   * legitimately register before the building it names. A recipe pointing at
   * an absent building simply never runs, which is the same benign outcome as
   * a building nobody built.
   */
  readonly building: ContentId;
  /** Consumed on craft start — a declared sink (ADR-011 §4). May be empty. */
  readonly inputs: readonly ItemStack[];
  /** Produced on craft completion — a declared source (ADR-011 §4). */
  readonly outputs: readonly ItemStack[];
  /** Ticks one craft takes. A positive integer (ADR-007 §7). */
  readonly craftTicks: number;
}

export type RecipeRegistry = ContentRegistry<RecipeDefinition>;

export function createRecipeRegistry(): RecipeRegistry {
  return createContentRegistry<RecipeDefinition>('recipe');
}

/**
 * Every recipe that names `building`, in registration order.
 *
 * Linear over the registry on purpose. The set is small (a handful of recipes
 * per world), it is asked once when a player opens a factory panel rather than
 * per tick, and an index would be a second representation to keep in step with
 * the first for no measured gain (`AI_RULES.md` §1.5). If production ever asks
 * this per tick, the answer is to stop asking per tick — a factory already
 * stores the recipe it selected.
 */
export function recipesFor(
  registry: RecipeRegistry,
  building: ContentId,
): readonly RecipeDefinition[] {
  return registry.all().filter((recipe) => recipe.building === building);
}

/** A quantity that can actually be moved: a positive integer (ADR-007 §7). */
function isMovableQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0;
}

/** True when no item appears in `stacks` more than once. */
function hasDistinctItems(stacks: readonly ItemStack[]): boolean {
  return new Set(stacks.map((stack) => stack.item)).size === stacks.length;
}

/**
 * Whether a recipe could ever run.
 *
 * Refused at REGISTRATION, where the author is told — never discovered at
 * craft time, where it looks to a player like a building that mysteriously
 * does nothing. This is `isSatisfiableRole`'s rule one content type over, and
 * `ROADMAP.md` §10's requirement generalised.
 *
 * The four refusals, each for its own reason:
 *
 * - **No outputs.** A craft that produces nothing is a pure sink: it consumes
 *   the player's goods and returns nothing at all. `GAME_DESIGN.md` §12 rule 4
 *   forbids destroying player value, and this is the only shape of recipe that
 *   could do it silently.
 * - **A non-integer or non-positive `craftTicks`.** Integers only (ADR-007
 *   §7); and a zero-tick craft would complete on the tick it started, so a
 *   factory could loop it unboundedly inside a single tick.
 * - **A zero, negative, or fractional quantity**, for the same ADR-007 reason.
 * - **A repeated item** on either side. Two stacks of one item make "does the
 *   input hold enough?" ambiguous — a check written against either stack alone
 *   passes while the recipe under-consumes — and the ambiguity is invisible
 *   until it silently mis-crafts.
 *
 * **Empty INPUTS are deliberately legal.** A recipe that consumes nothing is a
 * generator, and it is already bounded twice over: by `craftTicks`, and by its
 * output container filling. That makes it a balance decision belonging to
 * content (`GAME_DESIGN.md` §12), not a malformed definition — so it is
 * permitted here rather than banned on suspicion.
 */
export function isRunnableRecipe(recipe: RecipeDefinition): boolean {
  if (!isContentId(recipe.building)) return false;
  if (!Number.isInteger(recipe.craftTicks) || recipe.craftTicks <= 0) return false;
  if (recipe.outputs.length === 0) return false;

  const stacks = [...recipe.inputs, ...recipe.outputs];
  if (!stacks.every((stack) => isMovableQuantity(stack.quantity))) return false;

  return hasDistinctItems(recipe.inputs) && hasDistinctItems(recipe.outputs);
}
