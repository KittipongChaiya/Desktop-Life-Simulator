/**
 * Tint composition. Phase-33 — `tint.ts`, ADR-021 §6.
 *
 * Small arithmetic, tested because it is the kind that is wrong in a way
 * nobody notices: autumn rain that looks like summer is not a crash, it is a
 * slightly wrong colour four times a year.
 */

import { describe, expect, it } from 'vitest';

import { composeTints, NO_TINT } from './tint';

describe('composing ground tints', () => {
  it('leaves the art alone when every source is neutral', () => {
    expect(composeTints(NO_TINT, NO_TINT)).toBe(NO_TINT);
    expect(composeTints()).toBe(NO_TINT);
    expect(composeTints(NO_TINT)).toBe(NO_TINT);
  });

  it('passes a single tint through unchanged', () => {
    // The pre-phase-33 behaviour: one source, one slot. Adding weather must
    // not shift what a season alone did.
    for (const season of [0xf2fff4, 0xffcb80, 0xc8d8f5]) {
      expect(composeTints(season)).toBe(season);
      expect(composeTints(season, NO_TINT)).toBe(season);
    }
  });

  it('multiplies channel by channel', () => {
    // Half red against full green and blue.
    expect(composeTints(0x80ffff, 0xffffff)).toBe(0x80ffff);
    // Two halves compose to a quarter, not to a half.
    expect(composeTints(0x808080, 0x808080)).toBe(0x404040);
  });

  it('darkens rather than brightens, whatever the order', () => {
    // Commutativity matters because the call site lists the sources in an
    // arbitrary order, and a third one will be appended somewhere.
    const autumn = 0xffcb80;
    const rain = 0xc6d2e0;

    expect(composeTints(autumn, rain)).toBe(composeTints(rain, autumn));

    const composed = composeTints(autumn, rain);
    for (const shift of [16, 8, 0]) {
      expect((composed >> shift) & 0xff).toBeLessThanOrEqual((autumn >> shift) & 0xff);
      expect((composed >> shift) & 0xff).toBeLessThanOrEqual((rain >> shift) & 0xff);
    }
  });

  it('does not drift darker as neutral sources are added', () => {
    // THE ROUNDING TEST. Truncating instead of rounding loses a step per
    // composition, so a fourth tint source added in some later phase would
    // quietly dim the whole world.
    let tint = 0xffcb80;
    for (let added = 0; added < 8; added += 1) tint = composeTints(tint, NO_TINT);

    expect(tint).toBe(0xffcb80);
  });

  it('stays inside one byte per channel', () => {
    const composed = composeTints(0xffffff, 0xffffff, 0xffffff);
    expect(composed).toBe(0xffffff);
    expect(composed).toBeLessThanOrEqual(0xffffff);
  });
});
