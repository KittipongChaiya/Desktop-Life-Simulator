/**
 * Motion attribute tests. Phase-07.7h.
 *
 * Two things matter. The mapping has to reach `reduced` for the accessibility
 * state, because that is the value every stylesheet keys off — and the write
 * has to be skipped when nothing changed, since this runs from a subscription
 * that also fires for opacity and volume, and rewriting an identical attribute
 * invalidates style for nothing.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_MOTION_SETTINGS, MotionIntensity, effectiveMotion } from '../../shared/motion';

import {
  MOTION_ATTRIBUTE,
  MotionAttributeValue,
  applyMotionAttribute,
  motionAttributeValue,
} from './motion-attribute';

/** A stand-in for the root element, with no DOM required. */
function fakeElement(): Element {
  const attributes = new Map<string, string>();
  return {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
  } as unknown as Element;
}

const at = (intensity: MotionIntensity): Parameters<typeof motionAttributeValue>[0] => ({
  intensity,
  particles: true,
  cameraShake: false,
  decorativeCreatures: false,
  environmental: false,
});

describe('the mapping', () => {
  it('reports full motion as full', () => {
    expect(motionAttributeValue(at(MotionIntensity.Full))).toBe(MotionAttributeValue.Full);
  });

  it('reports subtle as its own state', () => {
    expect(motionAttributeValue(at(MotionIntensity.Subtle))).toBe(MotionAttributeValue.Subtle);
  });

  it('reports minimal as REDUCED, which is what the stylesheets key off', () => {
    // Named for what it means rather than for the level it came from: this is
    // the accessibility state, not a third speed.
    expect(motionAttributeValue(at(MotionIntensity.Minimal))).toBe(MotionAttributeValue.Reduced);
  });

  it('reaches reduced through the Reduced Motion switch', () => {
    const resolved = effectiveMotion({ ...DEFAULT_MOTION_SETTINGS, reducedMotion: true });
    expect(motionAttributeValue(resolved)).toBe(MotionAttributeValue.Reduced);
  });

  it('is full for a default profile', () => {
    expect(motionAttributeValue(effectiveMotion(DEFAULT_MOTION_SETTINGS))).toBe(
      MotionAttributeValue.Full,
    );
  });
});

describe('writing it', () => {
  it('sets the attribute on the element', () => {
    const element = fakeElement();
    applyMotionAttribute(element, at(MotionIntensity.Minimal));

    expect(element.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionAttributeValue.Reduced);
  });

  it('reports that it changed the first time', () => {
    expect(applyMotionAttribute(fakeElement(), at(MotionIntensity.Full))).toBe(true);
  });

  it('skips the write when nothing changed', () => {
    // The subscription this runs from fires for opacity and volume too.
    const element = fakeElement();
    applyMotionAttribute(element, at(MotionIntensity.Full));

    expect(applyMotionAttribute(element, at(MotionIntensity.Full))).toBe(false);
  });

  it('writes again when the value really moves', () => {
    const element = fakeElement();
    applyMotionAttribute(element, at(MotionIntensity.Full));

    expect(applyMotionAttribute(element, at(MotionIntensity.Minimal))).toBe(true);
    expect(element.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionAttributeValue.Reduced);
  });

  it('restores full motion when the switch is cleared', () => {
    const element = fakeElement();
    applyMotionAttribute(element, at(MotionIntensity.Minimal));
    applyMotionAttribute(element, at(MotionIntensity.Full));

    expect(element.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionAttributeValue.Full);
  });
});
