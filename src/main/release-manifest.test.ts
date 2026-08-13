/**
 * The update manifest. Phase-15 — ADR-025 §2, §6; `AI_RULES.md` §2.4.
 *
 * `electron-updater`'s feed answers "what version exists". It cannot answer
 * the three questions the policy actually needs — what schema that build
 * reads, whether the rollout is halted, and how wide the wave is — so those
 * travel in a small manifest of our own, published beside the installer.
 *
 * It arrives over a network, which makes it untrusted by definition. These
 * tests are mostly about refusing it.
 */

import { describe, expect, it } from 'vitest';

import { parseReleaseManifest } from './release-manifest';

const VALID = {
  version: '0.2.1',
  schemaVersion: 5,
  rolloutPercent: 25,
  halted: false,
};

describe('a manifest that is what it claims to be', () => {
  it('becomes an offered release', () => {
    expect(parseReleaseManifest(VALID)).toEqual({
      version: '0.2.1',
      schemaVersion: 5,
      rolloutPercent: 25,
      halted: false,
    });
  });

  it('carries a halt through', () => {
    expect(parseReleaseManifest({ ...VALID, halted: true })?.halted).toBe(true);
  });

  it('accepts the edges of the rollout range', () => {
    expect(parseReleaseManifest({ ...VALID, rolloutPercent: 0 })?.rolloutPercent).toBe(0);
    expect(parseReleaseManifest({ ...VALID, rolloutPercent: 100 })?.rolloutPercent).toBe(100);
  });

  it('takes only the four fields, ignoring anything else the manifest carries', () => {
    // Forward compatibility in the safe direction: a future publisher can add
    // a field without every older client refusing the release. The reverse —
    // an older client GUESSING at a field it does not know — is what §2.4
    // forbids, and taking exactly four fields is how this avoids it.
    const parsed = parseReleaseManifest({ ...VALID, releaseNotes: 'x', channel: 'beta' });

    expect(parsed).toEqual(VALID);
  });
});

describe('a manifest that is not', () => {
  // Every one of these answers `null`, and `checkForUpdate` reads null as "no
  // release on offer". The failure mode of not understanding a manifest is
  // doing nothing, which is ADR-025 §1's precedence rule at its cheapest:
  // integrity outranks delivery, so an unparseable manifest delivers nothing.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', '0.2.1'],
    ['a number', 5],
    ['an array', [VALID]],
  ])('refuses %s', (_label, value) => {
    expect(parseReleaseManifest(value)).toBeNull();
  });

  it.each([
    ['version missing', { ...VALID, version: undefined }],
    ['version not a string', { ...VALID, version: 21 }],
    ['version blank', { ...VALID, version: '   ' }],
    ['schemaVersion missing', { ...VALID, schemaVersion: undefined }],
    ['schemaVersion not a number', { ...VALID, schemaVersion: '5' }],
    ['schemaVersion fractional', { ...VALID, schemaVersion: 5.5 }],
    ['schemaVersion negative', { ...VALID, schemaVersion: -1 }],
    ['schemaVersion NaN', { ...VALID, schemaVersion: Number.NaN }],
    ['rolloutPercent missing', { ...VALID, rolloutPercent: undefined }],
    ['rolloutPercent not a number', { ...VALID, rolloutPercent: '25' }],
    ['rolloutPercent above 100', { ...VALID, rolloutPercent: 101 }],
    ['rolloutPercent below 0', { ...VALID, rolloutPercent: -1 }],
    ['halted missing', { ...VALID, halted: undefined }],
    ['halted not a boolean', { ...VALID, halted: 'false' }],
  ])('refuses one whose %s', (_label, value) => {
    expect(parseReleaseManifest(value)).toBeNull();
  });

  it('refuses the whole manifest for one bad field, rather than repairing it', () => {
    // Deliberate, and the alternative is worse in a specific way: defaulting
    // `halted` to false would let a manifest that LOST its halt flag resume a
    // rollout somebody stopped, and clamping a nonsense `rolloutPercent` would
    // pick a wave nobody chose. §1 says integrity outranks delivery, so a
    // manifest we cannot read entirely is one we do not act on at all.
    expect(parseReleaseManifest({ ...VALID, halted: 'no' })).toBeNull();
  });

  it('does not validate the version FORMAT, because a later layer already does', () => {
    // `compareVersions` accepts strict major.minor.patch and answers null for
    // anything else, and a null propagates to a hold. Rejecting the format
    // here would duplicate that rule in a second place, where it would drift.
    // This layer answers "is there a version string at all".
    expect(parseReleaseManifest({ ...VALID, version: 'nightly-2026-08-13' })).not.toBeNull();
  });

  it('trims, because whitespace is a publishing typo and not a different version', () => {
    expect(parseReleaseManifest({ ...VALID, version: ' 0.2.1 ' })?.version).toBe('0.2.1');
  });
});
