/**
 * Phase-15 — running a check without owning the network.
 *
 * The release source is a PARAMETER, which is the same move `save-store.ts`
 * and `settings-store.ts` make with their directories: injected, everything
 * except the fetcher itself is provable today, and the dependency decision
 * (ADR-025 §7) shrinks to the one component that genuinely needs it.
 */

import { describe, expect, it } from 'vitest';

import { NO_ANNOUNCEMENT, type AnnouncerState } from './update-announcer';
import { checkForUpdate, installStateFor, type CheckInputs } from './update-check';
import { ROLLOUT_BUCKETS, type OfferedRelease } from './update-policy';

const PRESENT = { hidden: false, workMode: false } as const;
const BUSY = { hidden: false, workMode: true } as const;

const inputs = (overrides: Partial<CheckInputs> = {}): CheckInputs => ({
  currentVersion: '0.2.0',
  saveVersion: 6,
  pinnedVersion: null,
  seed: 'C:/Users/player/AppData/Roaming/desktop-life-simulator',
  ...overrides,
});

const release = (overrides: Partial<OfferedRelease> = {}): OfferedRelease => ({
  version: '0.2.1',
  schemaVersion: 6,
  rolloutPercent: 100,
  halted: false,
  ...overrides,
});

const found = (value: OfferedRelease | null) => () => Promise.resolve(value);
const unreachable = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));

describe('installStateFor', () => {
  it('carries the pin and the versions through untouched', () => {
    const state = installStateFor(inputs({ pinnedVersion: '0.2.2' }));

    expect(state.version).toBe('0.2.0');
    expect(state.saveVersion).toBe(6);
    expect(state.pinnedVersion).toBe('0.2.2');
  });

  it('derives a bucket in range, stable for the same machine', () => {
    const state = installStateFor(inputs());

    expect(state.bucket).toBeGreaterThanOrEqual(0);
    expect(state.bucket).toBeLessThan(ROLLOUT_BUCKETS);
    expect(installStateFor(inputs()).bucket).toBe(state.bucket);
  });
});

describe('a check that finds a release', () => {
  it('announces it when nothing holds it and the player is available', async () => {
    const step = await checkForUpdate(found(release()), inputs(), NO_ANNOUNCEMENT, PRESENT);

    expect(step.announce).toEqual({ kind: 'offer', version: '0.2.1' });
  });

  it('says nothing when the policy holds it', async () => {
    const step = await checkForUpdate(
      found(release({ halted: true })),
      inputs(),
      NO_ANNOUNCEMENT,
      PRESENT,
    );

    expect(step.announce).toBeNull();
  });

  it('defers to the announcer when the player is busy', async () => {
    const step = await checkForUpdate(found(release()), inputs(), NO_ANNOUNCEMENT, BUSY);

    expect(step.announce).toBeNull();
    expect(step.state.pending).not.toBeNull();
  });
});

describe('a source that answers "nothing" is answering', () => {
  it('withdraws an offer that was still waiting to be shown', async () => {
    // Withdrawing a release from the feed is one of the two ways a publisher
    // can halt a rollout (ADR-025 §6). If it did not clear a pending offer,
    // halting by withdrawal would not work on the installs that matter most —
    // the ones that have not taken the update yet.
    const waiting = (await checkForUpdate(found(release()), inputs(), NO_ANNOUNCEMENT, BUSY)).state;

    const step = await checkForUpdate(found(null), inputs(), waiting, BUSY);

    expect(step.state.pending).toBeNull();
  });
});

describe('a check that could not run is not evidence about the release', () => {
  it('stays silent rather than reporting a failure the player cannot act on', async () => {
    // A laptop on a train fails this check constantly. An update system that
    // says so is `VISION.md` §5.1's notification spammer with a network error
    // for an excuse.
    const step = await checkForUpdate(unreachable, inputs(), NO_ANNOUNCEMENT, PRESENT);

    expect(step.announce).toBeNull();
  });

  it('leaves a pending offer alone — a dropped connection is not a halt', async () => {
    // The distinction this whole describe block exists for: answering
    // "nothing" is evidence, failing to answer is not. Clearing the offer here
    // would silently drop an announcement the player had already earned.
    const waiting: AnnouncerState = (
      await checkForUpdate(found(release()), inputs(), NO_ANNOUNCEMENT, BUSY)
    ).state;

    const step = await checkForUpdate(unreachable, inputs(), waiting, BUSY);

    expect(step.state).toEqual(waiting);
  });
});
