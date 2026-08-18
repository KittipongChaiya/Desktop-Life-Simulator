/**
 * The production system. Phase-25 — ADR-035 §4, §6.
 *
 * Runs in the `economy` phase and FIRST within it (`systems/index.ts` — order
 * is data, ADR-007 §4): after `worker`/`movement`, so a delivery made this
 * tick is visible to this tick's craft; ahead of `economySystem`, so a craft
 * that completes this tick is visible to the same tick's market sweep.
 *
 * ## It moves resources directly, and that is the shipped convention
 *
 * A craft is a declared SINK (its inputs) and a declared SOURCE (its outputs)
 * — ADR-011 §4 named both two versions ago. Like `sweepStalls` beside it, this
 * system performs those at the boundary rather than through a command:
 * commands are the write path for an ACTOR's intent (ADR-010), and nobody
 * intends each individual craft. Moving items INTO or OUT OF a factory is an
 * actor's business, and that does go through a command.
 *
 * ## The jam rules live here
 *
 * - **Rule A** — nothing is consumed until every output is known to fit, and
 *   the same question is asked again at the far end, because an output can
 *   fill WHILE a craft runs.
 * - **Rule B** — a factory that cannot proceed is idle, never broken. There is
 *   no jammed state and no operator intervention anywhere in this file.
 * - **Rule C** — inputs leave in one step; outputs arrive in one step.
 * - **Rule E** — a full output stalls the factory, and the stall clears itself.
 *
 * Rule E's distinction is the whole of v0.4's headline criterion: a stall is
 * correct and self-clearing, and a jam is a stall that outlives its cause.
 * Nothing here records that a factory was ever blocked — which is precisely
 * why it cannot stay blocked.
 *
 * ## No events yet, deliberately
 *
 * `craftStarted` and `craftCompleted` are named in ADR-035 §8 and are NOT
 * published here, because nothing subscribes yet. `events/types.ts` states the
 * rule in its own header — only events with a real producer AND a real
 * consumer — and `AI_RULES.md` §1.6 forbids the stub. They arrive with the
 * factory panel and the feedback effects, which are their consumers.
 */

import type { ContentId } from '../../shared/ids';
import type { RecipeDefinition } from '../content/recipes';
import { acceptable, addItems, removeItems } from '../world/container';
import {
  canStartCraft,
  isCraftComplete,
  FACTORY_REPLAN_TICKS,
  type FactoryState,
} from '../world/factory';
import type { World } from '../world/world';

/** Whether every output stack of `recipe` fits in the output container as it stands. */
function canDeliver(
  factory: FactoryState,
  recipe: RecipeDefinition,
  stackSizeOf: (item: ContentId) => number,
): boolean {
  return recipe.outputs.every(
    (stack) => acceptable(factory.output, stack.item, stackSizeOf(stack.item)) >= stack.quantity,
  );
}

/**
 * Advances one factory by one tick.
 *
 * Completion is handled BEFORE starting, so a factory that finishes a craft
 * can begin the next on the same tick. Otherwise every craft would pay an
 * extra back-off delay, and a chain's throughput would silently depend on the
 * replan cadence rather than on its recipes.
 */
function stepFactory(world: World, factory: FactoryState): void {
  if (factory.recipeId === null) return;

  const found = world.recipeRegistry.get(factory.recipeId);
  // A save naming a recipe whose source was uninstalled. The factory does
  // nothing and its goods stay put — never destroyed (ADR-011 §7), the same
  // judgement the stall sweep makes about goods it cannot price.
  if (!found.ok) return;
  const recipe = found.value;

  const stackSizeOf = (item: ContentId): number => {
    const definition = world.itemRegistry.get(item);
    return definition.ok ? definition.value.stackSize : 1;
  };

  // COMPLETION. Checked on every tick a craft is running and never deferred by
  // the back-off: the back-off governs looking for work, not finishing it.
  if (factory.startedTick !== null && isCraftComplete(factory, recipe, world.tick)) {
    // Rule A at the far end. The output had room when the craft began and may
    // have lost it since — a hauler filled it, or the player did. The finished
    // product then WAITS rather than vanishing: destroying it would destroy
    // player value, which `GAME_DESIGN.md` §12 rule 4 forbids outright.
    if (!canDeliver(factory, recipe, stackSizeOf)) return;

    // Rule C: every output arrives in this one step.
    for (const stack of recipe.outputs) {
      addItems(factory.output, stack.item, stack.quantity, stackSizeOf(stack.item));
    }
    factory.startedTick = null;
  }

  if (world.tick < factory.replanTick) return;

  // START. Rule A: `canStartCraft` asks whether every output will fit BEFORE
  // anything is removed, so a refusal leaves both containers untouched.
  if (!canStartCraft(factory, recipe, stackSizeOf)) {
    // Rule B: no work is an ordinary condition, not an error. Back off rather
    // than re-deriving the same answer twenty times a second (ADR-035 §6).
    factory.replanTick = world.tick + FACTORY_REPLAN_TICKS;
    return;
  }

  // Rule C: every input leaves in this one step.
  for (const stack of recipe.inputs) {
    removeItems(factory.input, stack.item, stack.quantity);
  }
  factory.startedTick = world.tick;
}

export function productionSystem(world: World): void {
  // Sorted by building id, never Map insertion order: insertion order after a
  // load is whatever the deserializer happened to do, and a tick whose result
  // depends on that is not reproducible across a save round-trip (ADR-007).
  for (const [, factory] of [...world.factories.entries()].sort(([a], [b]) => a - b)) {
    stepFactory(world, factory);
  }
}
