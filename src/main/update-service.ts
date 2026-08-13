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
 * process, and it is deliberately the smallest such place. Its four
 * dependencies are injected, which keeps it provable without a host: the tests
 * run the real schedule against fake timers and never touch Electron.
 *
 * `index.ts` supplies the four closures and nothing else. It decides nothing.
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
}

export interface UpdateService {
  /** Runs one check. Never rejects — see below. */
  check(): Promise<void>;
  /** The player became available; release anything that was waiting. */
  presenceChanged(): void;
  /** Begins the schedule. Returns teardown. */
  start(): () => void;
}

export function createUpdateService(deps: UpdateServiceDeps): UpdateService {
  let state: AnnouncerState = NO_ANNOUNCEMENT;

  const apply = (step: AnnouncerStep): void => {
    state = step.state;
    if (step.announce !== null) deps.announce(step.announce);
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
        apply(await checkForUpdate(deps.source, deps.inputs(), state, deps.presence()));
      } catch {
        // Deliberately silent (ADR-025 §5, `VISION.md` §5.1). A failed check
        // is the most ordinary event this system has.
      }
    },

    presenceChanged() {
      apply(announceToPresence(state, deps.presence()));
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
