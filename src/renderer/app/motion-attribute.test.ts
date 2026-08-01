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

import { DEFAULT_MOTION_SETTINGS, effectiveMotion } from '../../shared/motion';

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

const at = (intensityPercent: number): Parameters<typeof motionAttributeValue>[0] => ({
  intensityPercent,
  particles: true,
  cameraShake: false,
  decorativeCreatures: false,
  environmental: false,
});

describe('the mapping', () => {
  it('reports a high dial as full', () => {
    expect(motionAttributeValue(at(100))).toBe(MotionAttributeValue.Full);
  });

  it('reports a mid dial as its own state', () => {
    expect(motionAttributeValue(at(50))).toBe(MotionAttributeValue.Subtle);
  });

  it('reports the bottom of the dial as REDUCED, which the stylesheets key off', () => {
    // Banded, because CSS needs a small set of states from a continuous dial.
    // A near-zero dial is the accessibility state, not a very small `full`.
    expect(motionAttributeValue(at(0))).toBe(MotionAttributeValue.Reduced);
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
    applyMotionAttribute(element, at(0));

    expect(element.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionAttributeValue.Reduced);
  });

  it('reports that it changed the first time', () => {
    expect(applyMotionAttribute(fakeElement(), at(100))).toBe(true);
  });

  it('skips the write when nothing changed', () => {
    // The subscription this runs from fires for opacity and volume too.
    const element = fakeElement();
    applyMotionAttribute(element, at(100));

    expect(applyMotionAttribute(element, at(100))).toBe(false);
  });

  it('writes again when the value really moves', () => {
    const element = fakeElement();
    applyMotionAttribute(element, at(100));

    expect(applyMotionAttribute(element, at(0))).toBe(true);
    expect(element.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionAttributeValue.Reduced);
  });

  it('restores full motion when the switch is cleared', () => {
    const element = fakeElement();
    applyMotionAttribute(element, at(0));
    applyMotionAttribute(element, at(100));

    expect(element.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionAttributeValue.Full);
  });
});
