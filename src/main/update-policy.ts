/**
 * What may be offered, and when. Phase-15b — ADR-025 §2, §5, §6.
 *
 * An update check produces a release; this module decides what happens to it.
 * Four rules govern that decision and they are all in one function on purpose,
 * because the failure this phase exists to prevent is a **composition** of
 * correct parts (ADR-025 §Context) — the pin, the rollout wave, the halt, and
 * the schema boundary each behave sensibly alone and orphan a farm together.
 * Spreading them across the updater would make the order they apply in an
 * accident of call sites rather than a decision anyone can read.
 *
 * ## Why it is pure
 *
 * `decideOffer` takes two records and returns a verdict. It performs no
 * download, touches no disk, and cannot reach the save directory — which is
 * ADR-025 §4's *"saves are never touched by an update"* made structural rather
 * than asserted. It is the same split `rollback-guard.ts` states and
 * `voice-pool.ts` uses: the part that can be wrong should not need the
 * machinery to check.
 *
 * ## The rollout carries no identity
 *
 * ADR-025 §6 requires a staged rollout with **no telemetry, no account, and no
 * server-side identity**. The client's entire contribution is `bucket` — one
 * integer in 0–99, derived locally from a string the machine already has, never
 * transmitted and never stored anywhere a server can read. The publisher moves
 * `rolloutPercent`; each install answers for itself whether that includes it.
 * Nothing has to be counted for this to work, which is why it can be honest.
 */

import { decideRollback, type RollbackRefusal } from './rollback-guard';

/** How many buckets a rollout is divided into — one per percentage point. */
export const ROLLOUT_BUCKETS = 100;

/** A release the update check found, as published. Untrusted (`AI_RULES.md` §2.4). */
export interface OfferedRelease {
  readonly version: string;
  /** The `CURRENT_SCHEMA_VERSION` that build reads (ADR-025 §2). */
  readonly schemaVersion: number;
  /** The fraction of installs this wave includes, 0–100 (ADR-025 §6). */
  readonly rolloutPercent: number;
  /** Publish-side halt: stops an in-flight rollout before more installs take it. */
  readonly halted: boolean;
}

/** This installation, as the updater sees it. */
export interface InstallState {
  readonly version: string;
  /** The schema version of the save on disk, or `null` when there is no save. */
  readonly saveVersion: number | null;
  /** The version the player will not go past, or `null` (ADR-025 §6). */
  readonly pinnedVersion: string | null;
  /** This install's stable local rollout bucket, from `deriveRolloutBucket`. */
  readonly bucket: number;
}

/**
 * Why a release was not offered. Every one of these is SILENT — a hold is the
 * absence of an announcement, never a message. `VISION.md` §5.1's promise not
 * to be a notification spammer is kept by there being nothing to say.
 */
export type HoldReason =
  'not-newer' | 'unreadable-version' | 'pinned' | 'halted' | 'awaiting-rollout';

export type UpdateVerdict =
  | { readonly kind: 'offer'; readonly version: string }
  | { readonly kind: 'hold'; readonly reason: HoldReason }
  | { readonly kind: 'refuse'; readonly refusal: RollbackRefusal };

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Orders two versions, or answers `null` when either cannot be read.
 *
 * Strict `major.minor.patch` and nothing else. A pre-release suffix, a build
 * tag, or a channel name is **unreadable rather than ordered**, because an
 * updater that guesses at a version it does not understand installs the wrong
 * build, and this project ships no pre-release channel for the guess to serve.
 *
 * The match is compared field by field rather than parsed into a record, so
 * there is no state in which a version exists but a field of it does not — the
 * pattern already guarantees three groups of digits, and a defensive check for
 * their absence would be a branch no test could ever reach.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = VERSION_PATTERN.exec(a);
  const right = VERSION_PATTERN.exec(b);
  if (left === null || right === null) return null;

  const major = Number(left[1]) - Number(right[1]);
  if (major !== 0) return major;

  const minor = Number(left[2]) - Number(right[2]);
  if (minor !== 0) return minor;

  return Number(left[3]) - Number(right[3]);
}

/**
 * This install's rollout bucket: a stable integer in 0–99.
 *
 * FNV-1a over a local string, which the caller supplies — the `userData` path
 * is the natural one, since it exists on every install, survives every launch,
 * and never leaves the machine. Stability is the load-bearing property: an
 * install that the wave excluded must stay excluded until the publisher widens
 * it, or a halt after a bad build stops nothing because yesterday's excluded
 * installs re-roll into today's wave.
 */
export function deriveRolloutBucket(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0) % ROLLOUT_BUCKETS;
}

/**
 * Whether a release is announced to this install.
 *
 * The order of the checks is itself a decision. The four silent holds run
 * first, cheapest and most absolute first, and the schema boundary runs
 * **last** — because a refusal is the one verdict a player reads, and a build
 * that a halt or a rollout wave already excluded is not a build they can be
 * harmed by. Warning someone about a hazard they were never exposed to is how
 * an update system teaches people to dismiss its messages.
 *
 * Offering is not applying. ADR-025 §5 keeps the restart under the player's
 * control and §2 keeps a rollback out of this path entirely: an older build
 * reaching the check is held as `not-newer`, never offered, whatever its schema
 * would allow.
 */
export function decideOffer(install: InstallState, release: OfferedRelease): UpdateVerdict {
  const advance = compareVersions(release.version, install.version);
  if (advance === null) return { kind: 'hold', reason: 'unreadable-version' };
  if (advance <= 0) return { kind: 'hold', reason: 'not-newer' };

  if (install.pinnedVersion !== null) {
    const beyondPin = compareVersions(release.version, install.pinnedVersion);
    if (beyondPin === null || beyondPin > 0) return { kind: 'hold', reason: 'pinned' };
  }

  if (release.halted) return { kind: 'hold', reason: 'halted' };

  const wave = Number.isFinite(release.rolloutPercent) ? release.rolloutPercent : 0;
  if (install.bucket >= wave) return { kind: 'hold', reason: 'awaiting-rollout' };

  const safety = decideRollback(install.saveVersion, release.schemaVersion);
  if (!safety.allowed) return { kind: 'refuse', refusal: safety.refusal };

  return { kind: 'offer', version: release.version };
}

/** The presence states an announcement must respect (ADR-014 §1). */
export interface Presence {
  readonly hidden: boolean;
  readonly workMode: boolean;
}

/**
 * `'wait'`, never `'never'`. The distinction is the whole rule: presence
 * changes constantly and the verdict does not, so a player leaving work mode
 * has not declined an update — they have become available to be asked.
 */
export type AnnouncementTiming = 'now' | 'wait';

/**
 * Whether an offer may reach the player *at this moment*.
 *
 * Deliberately separate from `decideOffer`. Whether a release applies is
 * settled once per check and does not change until the next one; whether now
 * is a good moment changes every time the player hides the overlay or enters
 * work mode. Folding the two together would mean re-running the rollout and
 * schema arithmetic on every presence toggle, and — worse — would make a
 * presence change look like a change of verdict.
 *
 * Both states mean the same thing: the player has said they are busy (ADR-014
 * §1), and ADR-025 §5 spends that statement on the update prompt too. Hiding
 * has a second reason on top — a toast into a hidden overlay is not a quiet
 * announcement, it is a lost one.
 *
 * Click-through is NOT here. It makes the overlay transparent to the mouse; it
 * does not say the player is busy, and an announcement that never intercepts a
 * click (`CompanionToast.tsx`) has nothing to interfere with.
 */
export function announcementTiming(presence: Presence): AnnouncementTiming {
  return presence.hidden || presence.workMode ? 'wait' : 'now';
}

/**
 * Whether the artifact the feed is offering is the one the policy approved.
 *
 * Phase-15, ADR-025 §2/§3. Two sources describe a release and they can
 * disagree: `update-manifest.json` is edited by hand to halt a rollout or
 * widen a wave, while electron-builder's `latest.yml` is regenerated on every
 * publish. A window exists where the feed has moved on and the manifest has
 * not.
 *
 * In that window the feed's version is one **no** rollback guard, pin, or
 * rollout check has ever seen. Downloading it would apply a build the policy
 * never judged — §2's schema boundary bypassed by a race between two files,
 * and the player told about one version while receiving another.
 *
 * Deliberately `===` and not `compareVersions`. The question here is not "is
 * this acceptable", which `decideOffer` already settled against one specific
 * release; it is "is this the SAME artifact", and only equality cannot drift
 * from what the player was shown.
 */
export function mayDownload(approvedVersion: string, versionFromFeed: string | undefined): boolean {
  return versionFromFeed !== undefined && versionFromFeed === approvedVersion;
}
