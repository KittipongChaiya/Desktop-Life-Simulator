/**
 * Running a check. Phase-15 — ADR-025 §5, §6, §7.
 *
 * This is the composition: a release source, the policy that judges what it
 * returns, and the announcer that decides when the player hears about it.
 *
 * ## The source is a parameter
 *
 * The same move `save-store.ts` and `settings-store.ts` make with their
 * directories, and it is what makes ADR-025 §7 answerable. A library that
 * fetches releases is judged against these rules rather than trusted to embody
 * them; injected, everything except the fetcher is provable today, and the
 * dependency decision shrinks to the one component that genuinely needs it.
 *
 * Nothing here downloads, verifies, or installs. Offering is not applying
 * (ADR-025 §5), and the replacement sequence lives in `install-store.ts` where
 * a failure has somewhere safe to land.
 */

import {
  announceVerdict,
  withdrawAnnouncement,
  type AnnouncerState,
  type AnnouncerStep,
} from './update-announcer';
import {
  decideOffer,
  deriveRolloutBucket,
  type InstallState,
  type OfferedRelease,
  type Presence,
} from './update-policy';

/**
 * Where a check gets its releases.
 *
 * `null` means **the source answered and has nothing on offer** — which is
 * evidence, and withdraws a queued announcement. A rejected promise means the
 * source could not answer, which is not evidence about anything.
 *
 * Whatever implements this owns validating what came off the wire: a release
 * crosses a trust boundary (`AI_RULES.md` §2.4) and this module receives it
 * already shaped.
 */
export type ReleaseSource = () => Promise<OfferedRelease | null>;

/** What this installation knows about itself when a check runs. */
export interface CheckInputs {
  readonly currentVersion: string;
  /** The schema version of the save on disk, or `null` when there is none. */
  readonly saveVersion: number | null;
  /** The player's pin, as stored — unvalidated on purpose (see the schema). */
  readonly pinnedVersion: string | null;
  /** A stable local string for the rollout bucket; never transmitted. */
  readonly seed: string;
}

/** Derives the install state the policy reads, bucket included. */
export function installStateFor(inputs: CheckInputs): InstallState {
  return {
    version: inputs.currentVersion,
    saveVersion: inputs.saveVersion,
    pinnedVersion: inputs.pinnedVersion,
    bucket: deriveRolloutBucket(inputs.seed),
  };
}

/**
 * Runs one check and folds the result into the announcer.
 *
 * **A check that could not run is silent and changes nothing.** A laptop on a
 * train fails this constantly, and an update system that says so is
 * `VISION.md` §5.1's notification spammer with a network error for an excuse.
 * More importantly it leaves a pending offer intact: answering "nothing" is
 * evidence, failing to answer is not, and treating a dropped connection as a
 * withdrawal would silently discard an announcement the player had earned.
 */
export async function checkForUpdate(
  source: ReleaseSource,
  inputs: CheckInputs,
  state: AnnouncerState,
  presence: Presence,
): Promise<AnnouncerStep> {
  let release: OfferedRelease | null;

  try {
    release = await source();
  } catch {
    return { state, announce: null };
  }

  if (release === null) return withdrawAnnouncement(state);

  return announceVerdict(state, decideOffer(installStateFor(inputs), release), presence);
}
