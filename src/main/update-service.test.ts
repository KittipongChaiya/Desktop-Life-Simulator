/**
 * The update service. Phase-15 — ADR-025 §5, §6.
 *
 * Everything upstream of this is a pure function of its arguments. This is the
 * piece that HOLDS something: the announcer's memory of what it has already
 * said, across checks that are hours apart, and the schedule those checks run
 * on. Both are exactly what the pure modules could not prove.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Announcement } from './update-announcer';
import type { CheckInputs } from './update-check';
import type { Presence } from './update-policy';
import {
  CHECK_INTERVAL_MS,
  createUpdateService,
  FIRST_CHECK_DELAY_MS,
  type UpdateServiceDeps,
} from './update-service';

const AVAILABLE: Presence = { hidden: false, workMode: false };
const BUSY: Presence = { hidden: false, workMode: true };

const INPUTS: CheckInputs = {
  currentVersion: '0.2.0',
  saveVersion: 4,
  pinnedVersion: null,
  seed: 'a-stable-string',
};

/** A release everyone is inside the wave for, readable by the save above. */
const OFFER = { version: '0.2.1', schemaVersion: 5, rolloutPercent: 100, halted: false };

function harness(overrides: Partial<UpdateServiceDeps> = {}) {
  const announced: Announcement[] = [];
  let presence = AVAILABLE;
  let inputs = INPUTS;

  const deps: UpdateServiceDeps = {
    source: () => Promise.resolve(OFFER),
    inputs: () => inputs,
    presence: () => presence,
    announce: (announcement) => announced.push(announcement),
    download: () => Promise.resolve(true),
    restart: () => Promise.resolve(),
    ...overrides,
  };

  return {
    service: createUpdateService(deps),
    announced,
    setPresence: (next: Presence) => {
      presence = next;
    },
    setInputs: (next: CheckInputs) => {
      inputs = next;
    },
  };
}

describe('a check that finds something', () => {
  it('announces the offer', async () => {
    const h = harness();

    await h.service.check();

    expect(h.announced).toEqual([{ kind: 'offer', version: '0.2.1' }]);
  });

  it('announces a version once, however many checks go by', async () => {
    // The announcer's memory, and the reason this service holds state at all.
    // A six-hourly check against a release that sits there for a week would
    // otherwise be twenty-eight announcements of the same news.
    const h = harness();

    await h.service.check();
    await h.service.check();
    await h.service.check();

    expect(h.announced).toHaveLength(1);
  });

  it('announces a genuinely newer version after an earlier one', async () => {
    let release = OFFER;
    const h = harness({ source: () => Promise.resolve(release) });

    await h.service.check();
    release = { ...OFFER, version: '0.2.2' };
    await h.service.check();

    expect(h.announced.map((a) => (a.kind === 'offer' ? a.version : ''))).toEqual([
      '0.2.1',
      '0.2.2',
    ]);
  });
});

describe('a check that finds something while the player is busy', () => {
  it('says nothing yet', async () => {
    const h = harness();
    h.setPresence(BUSY);

    await h.service.check();

    expect(h.announced).toEqual([]);
  });

  it('says it when they come back', async () => {
    const h = harness();
    h.setPresence(BUSY);
    await h.service.check();

    h.setPresence(AVAILABLE);
    h.service.presenceChanged();

    expect(h.announced).toEqual([{ kind: 'offer', version: '0.2.1' }]);
  });

  it('does not repeat it on a second return', async () => {
    const h = harness();
    h.setPresence(BUSY);
    await h.service.check();
    h.setPresence(AVAILABLE);
    h.service.presenceChanged();

    h.service.presenceChanged();

    expect(h.announced).toHaveLength(1);
  });

  it('says nothing on a presence change with nothing waiting', () => {
    const h = harness();

    h.service.presenceChanged();

    expect(h.announced).toEqual([]);
  });
});

describe('a check that cannot be made', () => {
  it('changes nothing and says nothing', async () => {
    const h = harness({ source: () => Promise.reject(new Error('ENOTFOUND')) });

    await h.service.check();

    expect(h.announced).toEqual([]);
  });

  it('leaves a waiting offer intact', async () => {
    // The whole point of separating "answered nothing" from "could not
    // answer". A player who earned an announcement while in work mode must not
    // lose it because the next check ran on a train.
    let source: () => Promise<typeof OFFER | null> = () => Promise.resolve(OFFER);
    const h = harness({ source: () => source() });
    h.setPresence(BUSY);
    await h.service.check();

    source = () => Promise.reject(new Error('offline'));
    await h.service.check();

    h.setPresence(AVAILABLE);
    h.service.presenceChanged();
    expect(h.announced).toEqual([{ kind: 'offer', version: '0.2.1' }]);
  });

  it('survives inputs that throw, because nobody is holding the promise', async () => {
    // This runs on a timer. An unhandled rejection from a background check
    // would crash the main process over a save file that could not be read.
    const h = harness({
      inputs: () => {
        throw new Error('EBUSY');
      },
    });

    await expect(h.service.check()).resolves.toBeUndefined();
    expect(h.announced).toEqual([]);
  });
});

describe('a withdrawal', () => {
  it('clears an offer that was still waiting', async () => {
    // ADR-025 §6's halt reaching the installs it can still help: one that has
    // been offered the build but not taken it.
    let source: () => Promise<typeof OFFER | null> = () => Promise.resolve(OFFER);
    const h = harness({ source: () => source() });
    h.setPresence(BUSY);
    await h.service.check();

    source = () => Promise.resolve(null);
    await h.service.check();

    h.setPresence(AVAILABLE);
    h.service.presenceChanged();
    expect(h.announced).toEqual([]);
  });
});

describe('the inputs are read per check, not captured', () => {
  it('sees a pin the player set after the service was created', async () => {
    // Settings and saves both move while the process runs. Capturing them at
    // construction would mean a pin set at 10am was ignored until relaunch.
    const h = harness();
    h.setInputs({ ...INPUTS, pinnedVersion: '0.2.0' });

    await h.service.check();

    expect(h.announced).toEqual([]);
  });
});

describe('the schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not check at launch', () => {
    // Startup is already contending for disk: the save load, plugin
    // discovery, and the renderer's first frame. A check that landed in the
    // first seconds would also announce into a UI still mounting.
    const h = harness();
    h.service.start();

    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS - 1);

    expect(h.announced).toEqual([]);
  });

  it('checks once the launch has settled', async () => {
    const h = harness();
    h.service.start();

    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);

    expect(h.announced).toHaveLength(1);
  });

  it('keeps checking, so a release published later is still found', async () => {
    let release: typeof OFFER | null = null;
    const h = harness({ source: () => Promise.resolve(release) });
    h.service.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(h.announced).toEqual([]);

    release = OFFER;
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);

    expect(h.announced).toHaveLength(1);
  });

  it('stops when torn down', async () => {
    const h = harness();
    const stop = h.service.start();

    stop();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS + CHECK_INTERVAL_MS * 3);

    expect(h.announced).toEqual([]);
  });

  it('waits long enough between checks to be invisible', () => {
    // A number, pinned. An updater polling every few minutes is a background
    // process someone will notice in a network monitor, which is its own kind
    // of intrusion (`VISION.md` §5.1).
    expect(CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(60 * 60_000);
  });
});

describe('applying what was announced', () => {
  it('does nothing when no offer has been announced', async () => {
    const download = vi.fn(() => Promise.resolve(true));
    const h = harness({ download });

    await expect(h.service.apply()).resolves.toBe('nothing-to-apply');
    expect(download).not.toHaveBeenCalled();
  });

  it('downloads exactly the version the player was shown', async () => {
    // Not "the latest". The player consented to a specific build, and it is
    // the one `decideOffer` judged against their save, their pin, and their
    // rollout wave.
    const download = vi.fn(() => Promise.resolve(true));
    const h = harness({ download });
    await h.service.check();

    await expect(h.service.apply()).resolves.toBe('started');
    expect(download).toHaveBeenCalledWith('0.2.1');
  });

  it('restarts once the download has been verified', async () => {
    const restart = vi.fn(() => Promise.resolve());
    const h = harness({ restart });
    await h.service.check();

    await h.service.apply();

    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('never restarts when the download did not happen', async () => {
    // `downloadApprovedUpdate` answers false for an unreachable feed, a feed
    // offering nothing, and a feed offering a different version. Restarting
    // after any of those would hand the process to an installer with no
    // verified package behind it.
    const restart = vi.fn(() => Promise.resolve());
    const h = harness({ download: () => Promise.resolve(false), restart });
    await h.service.check();

    await h.service.apply();

    expect(restart).not.toHaveBeenCalled();
  });

  it('tells the player when the download failed, rather than going quiet', async () => {
    // The one place in this system where silence would be wrong. Everywhere
    // else a failed check is invisible because the player never asked; here
    // they clicked a button and are waiting for something to happen.
    const h = harness({ download: () => Promise.resolve(false) });
    await h.service.check();
    h.announced.length = 0;

    await h.service.apply();

    expect(h.announced).toHaveLength(1);
    expect(h.announced[0]?.kind).toBe('refusal');
  });

  it('says nothing extra when the download succeeded — the restart is the answer', async () => {
    const h = harness();
    await h.service.check();
    h.announced.length = 0;

    await h.service.apply();

    expect(h.announced).toEqual([]);
  });

  it('forgets the offer once applied, so a second click cannot re-download', async () => {
    const download = vi.fn(() => Promise.resolve(true));
    const h = harness({ download });
    await h.service.check();
    await h.service.apply();

    await expect(h.service.apply()).resolves.toBe('nothing-to-apply');
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('keeps the offer after a failed download, so the player can try again', async () => {
    let ok = false;
    const h = harness({ download: () => Promise.resolve(ok) });
    await h.service.check();
    await h.service.apply();

    ok = true;
    await expect(h.service.apply()).resolves.toBe('started');
  });

  it('has nothing to apply after a refusal, which is not an offer', async () => {
    const h = harness({
      inputs: () => ({ ...INPUTS, saveVersion: 9 }),
    });
    await h.service.check();

    await expect(h.service.apply()).resolves.toBe('nothing-to-apply');
  });
});
