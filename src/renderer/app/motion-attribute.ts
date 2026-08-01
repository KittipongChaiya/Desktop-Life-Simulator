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

import { MotionIntensity, type EffectiveMotion } from '../../shared/motion';

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
 * `Minimal` becomes `reduced` rather than `minimal` so the stylesheet reads as
 * what it means — this is the accessibility state, not a third speed.
 */
export function motionAttributeValue(motion: EffectiveMotion): MotionAttributeValue {
  if (motion.intensity === MotionIntensity.Minimal) return MotionAttributeValue.Reduced;
  return motion.intensity === MotionIntensity.Subtle
    ? MotionAttributeValue.Subtle
    : MotionAttributeValue.Full;
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
