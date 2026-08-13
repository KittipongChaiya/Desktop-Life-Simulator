/**
 * The update service. Phase-15 — ADR-025 §5, §6.
 *
 * The one stateful component in the chain, and it holds exactly two things:
 * the announcer's memory of what it has already said, and the timer that
 * decides when to look again.
 *
 * Everything upstream is a pure function of its arguments — the policy, the
 * guard, the announcer, the manifest parser, the check that composes them. So
 * this is where the guarantees stop being arithmetic and start being a running
 * process, and it is deliberately the smallest such place. Every dependency is
 * injected, which keeps it provable without a host: the tests run the real
 * schedule against fake timers, and the apply path against stubs, never
 * touching Electron.
 *
 * `index.ts` supplies the closures and nothing else. It decides nothing.
 */

import {
  announceToPresence,
  NO_ANNOUNCEMENT,
  type Announcement,
  type AnnouncerState,
  type AnnouncerStep,
} from './update-announcer';
import { checkForUpdate, type CheckInputs, type ReleaseSource } from './update-check';
import type { Presence } from './update-policy';

/**
 * How long after launch the first check runs.
 *
 * Not at launch, deliberately. Startup is already contending for disk — the
 * save load, plugin discovery, the renderer's first frame — and ADR-025 §1
 * ranks update speed below everything it would be competing with. A check
 * landing in the first seconds would also announce into a UI still mounting.
 */
export const FIRST_CHECK_DELAY_MS = 2 * 60_000;

/**
 * How often to look after that.
 *
 * Six hours is a compromise between two things that pull opposite ways. A halt
 * (§6) only reaches an install on its next check, so a shorter interval
 * propagates one faster; but an updater polling every few minutes is a
 * background process someone will eventually notice in a network monitor,
 * which is its own kind of intrusion (`VISION.md` §5.1).
 *
 * Six hours means a halt reaches most installs within a working day, and the
 * halt's real job is stopping installs that have not taken the build yet —
 * which, with `autoDownload` off, is every install that has merely been
 * offered it.
 */
export const CHECK_INTERVAL_MS = 6 * 60 * 60_000;

export interface UpdateServiceDeps {
  readonly source: ReleaseSource;
  /**
   * What this install knows about itself, read AT CHECK TIME.
   *
   * A closure rather than a value because both halves move while the process
   * runs: the player can set a pin at 10am, and the save's schema version
   * changes the first time a migration runs. Capturing either at construction
   * would mean ignoring it until relaunch.
   */
  readonly inputs: () => CheckInputs;
  readonly presence: () => Presence;
  /** Delivers an announcement to the player. */
  readonly announce: (announcement: Announcement) => void;
  /**
   * Fetches and verifies one specific version. `false` for every reason it did
   * not happen — unreachable feed, nothing offered, a different version.
   */
  readonly download: (version: string) => Promise<boolean>;
  /** Saves, then hands the process to the installer (`update-restart.ts`). */
  readonly restart: () => Promise<unknown>;
}

/** What `apply` did. `started` means the process is on its way out. */
export type ApplyOutcome = 'started' | 'nothing-to-apply';

/**
 * Shown when a download the player asked for did not happen.
 *
 * The ONE place in this system where silence would be wrong. Everywhere else a
 * failure is invisible because the player never asked — but here they pressed
 * a button and are waiting, and `VISION.md` §5.1's promise is about unsolicited
 * noise, not about answering a question that was put to us.
 */
const DOWNLOAD_FAILED =
  'The update could not be downloaded. Your game is untouched — it will try again later.';

export interface UpdateService {
  /** Runs one check. Never rejects — see below. */
  check(): Promise<void>;
  /** The player became available; release anything that was waiting. */
  presenceChanged(): void;
  /** Consent given: download what was announced, then restart into it. */
  apply(): Promise<ApplyOutcome>;
  /** Begins the schedule. Returns teardown. */
  start(): () => void;
}

export function createUpdateService(deps: UpdateServiceDeps): UpdateService {
  let state: AnnouncerState = NO_ANNOUNCEMENT;
  // The version the player was actually shown. Not "the latest": consent was
  // given to one specific build, judged against their save, their pin, and
  // their rollout wave.
  let offeredVersion: string | null = null;

  const applyStep = (step: AnnouncerStep): void => {
    state = step.state;
    if (step.announce === null) return;
    if (step.announce.kind === 'offer') offeredVersion = step.announce.version;
    deps.announce(step.announce);
  };

  const service: UpdateService = {
    async check() {
      // NEVER REJECTS. This runs on a timer with nobody holding the promise,
      // so an unhandled rejection would take down the main process — over a
      // save file that happened to be locked, or a settings read that raced a
      // write. `checkForUpdate` already absorbs a failing source; this absorbs
      // everything else, and the result is the same either way: a check that
      // could not be made changes nothing and says nothing.
      try {
        applyStep(await checkForUpdate(deps.source, deps.inputs(), state, deps.presence()));
      } catch {
        // Deliberately silent (ADR-025 §5, `VISION.md` §5.1). A failed check
        // is the most ordinary event this system has.
      }
    },

    presenceChanged() {
      applyStep(announceToPresence(state, deps.presence()));
    },

    async apply() {
      // A refusal is not an offer, and neither is a check that has never run.
      if (offeredVersion === null) return 'nothing-to-apply';

      const downloaded = await deps.download(offeredVersion);
      if (!downloaded) {
        // Kept, not cleared: the feed may simply have been unreachable, and
        // the player should be able to press the button again rather than
        // wait six hours for the offer to be re-announced.
        deps.announce({ kind: 'refusal', message: DOWNLOAD_FAILED });
        return 'nothing-to-apply';
      }

      // Cleared before the restart, so a second click that beats the shutdown
      // cannot start a second download of a package already staged.
      offeredVersion = null;
      await deps.restart();
      return 'started';
    },

    start() {
      const first = setTimeout(() => {
        void service.check();
      }, FIRST_CHECK_DELAY_MS);

      const repeat = setInterval(() => {
        void service.check();
      }, CHECK_INTERVAL_MS);

      return () => {
        clearTimeout(first);
        clearInterval(repeat);
      };
    },
  };

  return service;
}
