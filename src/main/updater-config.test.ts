/**
 * The settings `electron-updater` must be held to. Phase-15 — ADR-025 §2, §5.
 *
 * Three of these four override a default that is WRONG for this product, which
 * is the only reason the module exists. A constant nobody could get wrong would
 * not be worth a file; this one ships a library whose out-of-the-box behaviour
 * is precisely the silent background updater ADR-025 §Alternatives A rejected.
 */

import { describe, expect, it } from 'vitest';

import { REQUIRED_UPDATER_CONFIG, UPDATER_DEFAULTS_OVERRIDDEN } from './updater-config';

describe('the updater is configured against its own defaults', () => {
  it('never downloads without being asked', () => {
    // `autoDownload` defaults to TRUE. Left alone, a check becomes a download:
    // bandwidth spent and an artifact staged before the player has been told a
    // version exists, let alone agreed to it.
    expect(REQUIRED_UPDATER_CONFIG.autoDownload).toBe(false);
  });

  it('never installs on quit', () => {
    // `autoInstallOnAppQuit` defaults to TRUE, and it is the one that matters
    // most. ADR-025 §5 is "never restart unasked"; this default turns every
    // quit into an install the player did not request, on a product whose
    // whole premise is that it sits quietly on a desktop.
    expect(REQUIRED_UPDATER_CONFIG.autoInstallOnAppQuit).toBe(false);
  });

  it('never moves a player backwards on its own', () => {
    // ADR-025 §2: "a rollback is never automatic". `allowDowngrade` would let
    // the library decide to install an older build, and an older build may not
    // read the save the newer one migrated — §Context's whole hazard, arriving
    // through a configuration flag rather than a decision.
    expect(REQUIRED_UPDATER_CONFIG.allowDowngrade).toBe(false);
  });

  it('offers no pre-release channel, because none exists', () => {
    // `compareVersions` answers null for anything that is not strict
    // major.minor.patch, and a null propagates to a hold. Enabling this would
    // produce releases the policy is structurally unable to order, so every
    // one of them would be silently held — a channel that appears to work and
    // delivers nothing.
    expect(REQUIRED_UPDATER_CONFIG.allowPrerelease).toBe(false);
  });

  it('states which of these are overrides rather than agreements', () => {
    // The distinction is the point of the file. A setting we merely agree with
    // needs no guard; a default we are actively fighting does, because a
    // library upgrade can change it back and nothing else here would notice.
    expect(UPDATER_DEFAULTS_OVERRIDDEN).toContain('autoDownload');
    expect(UPDATER_DEFAULTS_OVERRIDDEN).toContain('autoInstallOnAppQuit');
  });

  it('covers every setting it declares, so a new one cannot arrive unexamined', () => {
    // Each key above is asserted individually with its reason. This pins the
    // SET, so adding a fifth setting fails here until someone states why it is
    // safe — the same shape as the coverage policy's "detectors are never
    // empty" rule.
    expect(Object.keys(REQUIRED_UPDATER_CONFIG).sort()).toEqual([
      'allowDowngrade',
      'allowPrerelease',
      'autoDownload',
      'autoInstallOnAppQuit',
    ]);
  });
});
