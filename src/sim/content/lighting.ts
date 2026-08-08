/**
 * Phase → tint, as content. Phase-10c — ADR-020 §4.
 *
 * The simulation publishes a phase and knows nothing about colour. What a
 * phase LOOKS like is presentation, and ADR-020 §4 makes that mapping content
 * data so a source can restyle the day without touching engine code — the same
 * reason a crop's sprite key is a definition rather than a switch in the
 * renderer.
 *
 * These definitions live in `src/sim/content` because that is where the
 * registries a source writes to live, not because the simulation uses them.
 * **No simulation system may read this registry** (ADR-020 §4); a gameplay rule
 * that wants "it is dark" reads the phase, which is simulation state. The
 * registry's only consumer is the lighting view.
 *
 * ## One tint per phase, and only `core` supplies them today
 *
 * A world has one dawn. Two sources both defining a dawn tint would need a
 * rule for which one wins, and there is no consumer for such a rule: definition
 * files refuse the `phaseTints` key (`definitions.ts`), so `core` is the only
 * source that can register one. `tintFor` therefore resolves in registration
 * order and does not arbitrate.
 *
 * That is a real gap against ADR-020 §4's "a content source can supply its
 * own", and it is left open deliberately rather than closed with an invented
 * precedence rule (`AI_RULES.md` §1.5). Recorded in the phase doc.
 */

import { asContentId, type ContentId } from '../../shared/ids';
import type { DayPhase } from '../time/game-clock';

import { createContentRegistry, type ContentRegistry } from './registry';

export interface PhaseTintDefinition {
  /**
   * Namespaced id, so a tint is owned like every other piece of content
   * (ADR-026 §1) and the API's namespace check applies to it unchanged.
   */
  readonly id: ContentId;
  /** The phase this tint paints. */
  readonly phase: DayPhase;
  /** Packed `0xRRGGBB`. */
  readonly color: number;
  /**
   * Coverage, 0–1.
   *
   * A flat alpha over a plain rectangle rather than a blend mode or filter,
   * because ADR-001 §Fallback's canvas backend has neither — the degraded path
   * gets a dimmer night rather than no night.
   */
  readonly alpha: number;
}

export type PhaseTintRegistry = ContentRegistry<PhaseTintDefinition>;

export function createPhaseTintRegistry(): PhaseTintRegistry {
  return createContentRegistry<PhaseTintDefinition>('phase tint');
}

/**
 * The tint for a phase, or `null` if nothing registered one.
 *
 * `null` rather than a default colour: a missing tint means the lighting layer
 * draws nothing, which is the correct degradation. Substituting a guess here
 * would paint a colour no content asked for.
 */
export function tintFor(
  registry: PhaseTintRegistry,
  phase: DayPhase,
): PhaseTintDefinition | undefined {
  return registry.all().find((tint) => tint.phase === phase);
}

/** Builds the id a tint is conventionally registered under. */
export function phaseTintId(namespace: string, phase: DayPhase): ContentId {
  return asContentId(`${namespace}:${phase}_tint`);
}
