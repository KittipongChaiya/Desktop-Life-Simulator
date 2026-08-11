/**
 * Phase-15b — what may be offered, and when, decided in Node.
 *
 * ADR-025 §6's rollout must be provably local: every test here runs with no
 * network, no server, and no identity, because the client's whole contribution
 * to a staged rollout is arithmetic over a number it derived itself.
 */

import { describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '../persistence/schema';

import {
  ROLLOUT_BUCKETS,
  announcementTiming,
  compareVersions,
  decideOffer,
  deriveRolloutBucket,
  type InstallState,
  type OfferedRelease,
} from './update-policy';

const install = (overrides: Partial<InstallState> = {}): InstallState => ({
  version: '0.2.0',
  saveVersion: 6,
  pinnedVersion: null,
  bucket: 0,
  ...overrides,
});

const release = (overrides: Partial<OfferedRelease> = {}): OfferedRelease => ({
  version: '0.2.1',
  schemaVersion: 6,
  rolloutPercent: 100,
  halted: false,
  ...overrides,
});

describe('version comparison', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersions('0.2.2', '0.2.10')).toBeLessThan(0);
  });

  it('reports equality', () => {
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0);
  });

  it('answers null for a version it cannot read, rather than guessing', () => {
    // Guessing is how an update system installs the wrong build. A version
    // that does not parse is not ordered against anything.
    expect(compareVersions('0.2', '0.2.0')).toBeNull();
    expect(compareVersions('0.2.0-beta.1', '0.2.0')).toBeNull();
    expect(compareVersions('', '0.2.0')).toBeNull();
  });
});

describe('the rollout bucket is local, stable, and bounded', () => {
  it('lands inside the bucket range for any seed', () => {
    for (const seed of ['', 'C:/Users/a/AppData/Roaming/dls', 'x', '不能读的种子']) {
      const bucket = deriveRolloutBucket(seed);

      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(ROLLOUT_BUCKETS);
      expect(Number.isInteger(bucket)).toBe(true);
    }
  });

  it('gives the same install the same bucket every launch', () => {
    // The property the whole staged rollout rests on: an install that is not
    // in the wave must not drift into it on the next check, or a halt after a
    // bad build stops nothing.
    const seed = 'C:/Users/player/AppData/Roaming/desktop-life-simulator';

    expect(deriveRolloutBucket(seed)).toBe(deriveRolloutBucket(seed));
  });

  it('spreads different installs across the range', () => {
    const buckets = new Set(
      Array.from({ length: 200 }, (_, index) => deriveRolloutBucket(`install-${String(index)}`)),
    );

    // A hash that answered the same bucket for everyone would satisfy every
    // test above and stage nothing at all.
    expect(buckets.size).toBeGreaterThan(50);
  });
});

describe('an update is offered only when nothing holds it', () => {
  it('offers a newer release', () => {
    const verdict = decideOffer(install(), release());

    expect(verdict.kind).toBe('offer');
    expect(verdict.kind === 'offer' && verdict.version).toBe('0.2.1');
  });

  it('holds the version already installed', () => {
    const verdict = decideOffer(install(), release({ version: '0.2.0' }));

    expect(verdict).toEqual({ kind: 'hold', reason: 'not-newer' });
  });

  it('never offers a downgrade, even a safe one', () => {
    // ADR-025 §2: a rollback is never automatic. An older build reaching the
    // check is not an update, whatever its schema says.
    const verdict = decideOffer(install(), release({ version: '0.1.9', schemaVersion: 6 }));

    expect(verdict).toEqual({ kind: 'hold', reason: 'not-newer' });
  });

  it('holds when either version is unreadable', () => {
    expect(decideOffer(install(), release({ version: 'latest' }))).toEqual({
      kind: 'hold',
      reason: 'unreadable-version',
    });
    expect(decideOffer(install({ version: 'dev' }), release())).toEqual({
      kind: 'hold',
      reason: 'unreadable-version',
    });
  });
});

describe('a pin is a ceiling, not a freeze', () => {
  it('holds a release above the pin', () => {
    const verdict = decideOffer(install({ pinnedVersion: '0.2.0' }), release({ version: '0.3.0' }));

    expect(verdict).toEqual({ kind: 'hold', reason: 'pinned' });
  });

  it('still offers a release at or below the pin', () => {
    // A player who pinned 0.2.2 because a plugin needs it should still receive
    // 0.2.1 — pinning names the version they will not go past, not a refusal
    // to move at all.
    const verdict = decideOffer(install({ pinnedVersion: '0.2.2' }), release({ version: '0.2.1' }));

    expect(verdict.kind).toBe('offer');
  });

  it('offers the pinned version itself', () => {
    const verdict = decideOffer(install({ pinnedVersion: '0.2.1' }), release({ version: '0.2.1' }));

    expect(verdict.kind).toBe('offer');
  });

  it('holds when the pin itself is unreadable', () => {
    // A pin that cannot be read is still a player saying "hold me here".
    // Ignoring it would move a farm the player asked not to move.
    const verdict = decideOffer(install({ pinnedVersion: 'the one that works' }), release());

    expect(verdict).toEqual({ kind: 'hold', reason: 'pinned' });
  });
});

describe('the staged rollout is decided locally', () => {
  it('offers to an install inside the wave', () => {
    expect(decideOffer(install({ bucket: 4 }), release({ rolloutPercent: 5 })).kind).toBe('offer');
  });

  it('holds an install outside the wave', () => {
    expect(decideOffer(install({ bucket: 5 }), release({ rolloutPercent: 5 }))).toEqual({
      kind: 'hold',
      reason: 'awaiting-rollout',
    });
  });

  it('reaches every install at 100 and none at 0', () => {
    expect(
      decideOffer(install({ bucket: ROLLOUT_BUCKETS - 1 }), release({ rolloutPercent: 100 })).kind,
    ).toBe('offer');
    expect(decideOffer(install({ bucket: 0 }), release({ rolloutPercent: 0 })).kind).toBe('hold');
  });

  it('treats an unreadable rollout fraction as reaching nobody', () => {
    // The release metadata is published data crossing into the application,
    // and AI_RULES §2.4 says a boundary is not trusted. The safe reading of a
    // fraction nobody can parse is that the wave has not started.
    expect(decideOffer(install(), release({ rolloutPercent: Number.NaN })).kind).toBe('hold');
  });

  it('holds a halted rollout even for an install already inside the wave', () => {
    // The halt is the only mitigation that works after a bad build is signed.
    expect(decideOffer(install({ bucket: 0 }), release({ halted: true }))).toEqual({
      kind: 'hold',
      reason: 'halted',
    });
  });
});

describe('the schema boundary applies to an update, not only to a rollback', () => {
  it('refuses a release that cannot read the save on disk', () => {
    // A version number can move forward while a schema moves back — a build
    // that reverted a migration, published by mistake. The guard is arithmetic
    // over the two schema numbers and does not care which direction the
    // VERSION went, which is exactly why it catches this.
    const verdict = decideOffer(install({ saveVersion: 6 }), release({ schemaVersion: 5 }));

    expect(verdict.kind).toBe('refuse');
    expect(verdict.kind === 'refuse' && verdict.refusal.saveVersion).toBe(6);
    expect(verdict.kind === 'refuse' && verdict.refusal.targetVersion).toBe(5);
  });

  it('offers when there is no save to orphan', () => {
    expect(decideOffer(install({ saveVersion: null }), release({ schemaVersion: 1 })).kind).toBe(
      'offer',
    );
  });

  it('offers a release that migrates the save forward', () => {
    expect(
      decideOffer(
        install({ saveVersion: CURRENT_SCHEMA_VERSION }),
        release({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
      ).kind,
    ).toBe('offer');
  });

  it('holds rather than refuses when the release was never going to be offered', () => {
    // Check order is the decision here: a refusal is a message a player reads,
    // and telling someone a build would have orphaned their farm — when a halt
    // or a rollout wave meant they were never getting it — is alarming them
    // about something that cannot happen to them.
    const verdict = decideOffer(
      install({ saveVersion: 6 }),
      release({ schemaVersion: 5, halted: true }),
    );

    expect(verdict).toEqual({ kind: 'hold', reason: 'halted' });
  });
});

describe('an announcement waits for a player who said they are busy', () => {
  it('shows when the overlay is present and ordinary', () => {
    expect(announcementTiming({ hidden: false, workMode: false })).toBe('now');
  });

  it('waits while the overlay is hidden', () => {
    // There is nobody looking at the window. A toast into a hidden overlay is
    // not a quiet announcement, it is a lost one.
    expect(announcementTiming({ hidden: true, workMode: false })).toBe('wait');
  });

  it('waits in work mode', () => {
    // ADR-014 §1: work mode is the player saying they are busy, and ADR-025 §5
    // spends that statement on the update prompt as well as on everything else.
    expect(announcementTiming({ hidden: false, workMode: true })).toBe('wait');
  });

  it('waits while both hold, and shows again once neither does', () => {
    // The verdict is unchanged by presence — this is a WAIT, never a cancel.
    // A player who leaves work mode has not declined the update; they have
    // just become available to be asked.
    expect(announcementTiming({ hidden: true, workMode: true })).toBe('wait');
    expect(announcementTiming({ hidden: false, workMode: false })).toBe('now');
  });
});
