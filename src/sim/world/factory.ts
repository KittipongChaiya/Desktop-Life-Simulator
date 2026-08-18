/**
 * Factories. Phase-25 — ADR-035 §2, §3, §4.
 *
 * A factory is a plain typed record in a side-table keyed by building id, the
 * same shape `buildingStorage` already uses — so a rest hut pays nothing for
 * machinery it does not have (ADR-004 §4). Behaviour lives in
 * `systems/production.ts`; the decisions live here, pure, exactly as
 * `worker.ts` holds `advanceEnergy` beside the worker record.
 *
 * ## Two containers, and why that is correctness rather than tidiness
 *
 * With a single container a produced output is indistinguishable from an
 * undelivered input: a mill turning wheat into flour would offer its own flour
 * back to the next craft as an ingredient, and a recipe whose output is also
 * an input would consume itself. Two containers make "what came in" and "what
 * is ready to leave" structurally distinct, and they give logistics two
 * unambiguous endpoints instead of one ambiguous one (ADR-035 §2).
 *
 * ## These containers are NOT in `world.buildingStorage`, deliberately
 *
 * That map is general storage and `selectStorageTarget` picks the nearest
 * building with space, blind to kind. A mill's input buffer living there would
 * have workers deposit whatever they happened to be carrying into it — a
 * buffer full of turnips, no slots left for wheat, and no error anywhere to
 * explain why the mill stopped. A factory is reached only by an explicit route
 * or a deliberate player transfer.
 *
 * ## Progress is one number
 *
 * A running craft stores `startedTick` and nothing else; completion is
 * arithmetic (ADR-035 §3). There is no `progress` field, because a progress
 * field is an accumulator that has to be advanced, serialized, and kept from
 * drifting — and this one never has to be. Same shape as `plantedTick`.
 */

import type { BuildingId, ContentId } from '../../shared/ids';
import type { RecipeDefinition } from '../content/recipes';

import { acceptable, containerCount, createContainer, type Container } from './container';

export interface FactoryState {
  /**
   * The recipe this factory was SET to run, or null.
   *
   * Never inferred from what is in the input (ADR-035 §5): a stray delivery
   * would otherwise silently change what the building makes, and nothing on
   * screen would explain it. Written only by a command.
   */
  recipeId: ContentId | null;
  /** Tick the current craft began, or null when nothing is running. */
  startedTick: number | null;
  /** What has been delivered for the recipe to consume. */
  readonly input: Container;
  /** What is finished and waiting to be taken away. */
  readonly output: Container;
  /**
   * Earliest tick to examine this factory again after finding no work.
   *
   * `Worker.replanTick`'s rule one system over, and for the same reason:
   * sustained no-work is a NORMAL regime, not an error, and a farm of idle
   * factories re-deriving their conditions twenty times a second would spend
   * the idle-CPU budget discovering that nothing changed. Derived from
   * `world.tick` only, so it stays deterministic and offline-exact.
   */
  replanTick: number;
}

/** Sparse side-table keyed by building id (ADR-004 §4). */
export type FactoryStore = Map<BuildingId, FactoryState>;

export function createFactoryStore(): FactoryStore {
  return new Map();
}

/**
 * Ticks an idle factory waits before re-examining its conditions.
 *
 * Matches `IDLE_REPLAN_TICKS` for workers — one second of bounded staleness.
 * Invisible against craft times measured in hundreds of ticks, and the same
 * trade already accepted for an idle farm.
 */
export const FACTORY_REPLAN_TICKS = 20;

export function createFactoryState(inputSlots: number, outputSlots: number): FactoryState {
  return {
    recipeId: null,
    startedTick: null,
    input: createContainer(inputSlots),
    output: createContainer(outputSlots),
    replanTick: 0,
  };
}

/** The tick the running craft completes on, or null when nothing is running. */
export function craftCompletesAt(factory: FactoryState, recipe: RecipeDefinition): number | null {
  return factory.startedTick === null ? null : factory.startedTick + recipe.craftTicks;
}

/**
 * Whether the running craft has finished by `tick`.
 *
 * `>=`, not `===`, and that is load-bearing: the back-off above means a
 * factory is not examined on every tick, so an equality test would silently
 * drop any craft whose completion tick fell on a skipped one.
 */
export function isCraftComplete(
  factory: FactoryState,
  recipe: RecipeDefinition,
  tick: number,
): boolean {
  const completesAt = craftCompletesAt(factory, recipe);
  return completesAt !== null && tick >= completesAt;
}

/**
 * Whether a craft may begin right now — **Rule A** (ADR-035 §4).
 *
 * Two questions, and the second is the one that matters: are the inputs
 * present, and will EVERY output fit? Consuming before knowing the answer to
 * the second either destroys the player's goods — which ADR-011 §7 forbids
 * outright, a full destination blocks and never discards — or strands a craft
 * mid-flight with its inputs already gone.
 *
 * "Every output" is not pedantry. A recipe producing flour and bran into a
 * container with room for only the flour is precisely the partial state that
 * would leave the bran nowhere to go, so the check is over all of them or it
 * is not a check.
 *
 * Output space is measured against the container as it stands, so a product
 * that tops up an existing partial stack needs no free slot at all.
 *
 * PURE, and takes `stackSizeOf` rather than a registry, so this module stays
 * free of content dependencies exactly as `container.ts` does.
 */
export function canStartCraft(
  factory: FactoryState,
  recipe: RecipeDefinition,
  stackSizeOf: (item: ContentId) => number,
): boolean {
  // One craft at a time (Rule C): a factory that could start a second while
  // one runs would have two start ticks and one field to hold them.
  if (factory.startedTick !== null) return false;

  for (const stack of recipe.inputs) {
    if (containerCount(factory.input, stack.item) < stack.quantity) return false;
  }

  // Rule A. Note this asks the container as it is NOW; the inputs have not
  // been removed, which is the whole point — nothing has happened yet.
  for (const stack of recipe.outputs) {
    if (acceptable(factory.output, stack.item, stackSizeOf(stack.item)) < stack.quantity) {
      return false;
    }
  }

  return true;
}
