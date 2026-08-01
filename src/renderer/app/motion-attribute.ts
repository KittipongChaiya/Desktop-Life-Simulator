/**
 * Publishes the motion setting to CSS. Phase-07.7h, ADR-017 §7.
 *
 * The HUD is React and DOM, so its polish — hover and press scale, tooltip
 * fade, slot highlight, selection pulse — belongs in CSS transitions, which
 * run in the compositor and cause NO React render at all. That satisfies the
 * brief's "no React re-render every frame" by making the frame loop React's
 * business in the first place.
 *
 * But CSS cannot read a settings object. The overlay already respects the
 * OPERATING SYSTEM's `prefers-reduced-motion`; what it could not see is the
 * game's own Reduced Motion switch, so a player who set it in the settings
 * panel got a still world and a HUD that carried on animating.
 *
 * One attribute on the root element closes that, and it is written only when
 * the value actually changes — a per-frame attribute write would invalidate
 * style on every frame, which is the same defect as a per-frame render wearing
 * a different hat.
 */

import { MOTION_STILL_THRESHOLD_PERCENT, type EffectiveMotion } from '../../shared/motion';

/** The attribute stylesheets key off. */
export const MOTION_ATTRIBUTE = 'data-motion';

/** What the attribute may hold. Mirrors `MotionIntensity`, as a DOM value. */
export const MotionAttributeValue = {
  Full: 'full',
  Subtle: 'subtle',
  Reduced: 'reduced',
} as const;

export type MotionAttributeValue = (typeof MotionAttributeValue)[keyof typeof MotionAttributeValue];

/**
 * The attribute value for the motion in force.
 *
 * The dial is continuous but CSS needs a small set of states, so this bands it.
 * A dial at or below the still threshold reads as `reduced` rather than as a
 * very small `full` — the stylesheet is expressing the accessibility state, not
 * the number.
 */
export function motionAttributeValue(motion: EffectiveMotion): MotionAttributeValue {
  if (motion.intensityPercent <= MOTION_STILL_THRESHOLD_PERCENT) {
    return MotionAttributeValue.Reduced;
  }
  return motion.intensityPercent < 75 ? MotionAttributeValue.Subtle : MotionAttributeValue.Full;
}

/**
 * Writes the attribute if it changed. Returns true when it did.
 *
 * The no-op path matters: this is called from a subscription that also fires
 * for opacity and volume changes, and rewriting an identical attribute would
 * invalidate style for nothing.
 */
export function applyMotionAttribute(element: Element, motion: EffectiveMotion): boolean {
  const next = motionAttributeValue(motion);
  if (element.getAttribute(MOTION_ATTRIBUTE) === next) return false;

  element.setAttribute(MOTION_ATTRIBUTE, next);
  return true;
}
