/**
 * Restarting into an update. Phase-15 — ADR-025 §5, §1.
 *
 * §5 gives three rules that compose into one sequence: the player consents,
 * the in-flight save finishes, and only then does the application hand itself
 * to the installer.
 *
 * ## The ordering is the guarantee
 *
 * _"An update restart requested mid-save waits for the write and never
 * truncates it."_ That is a claim about which of two things happens first, and
 * nothing upstream of here can make it — the policy decides whether a build
 * may be applied, and this decides when the process may be replaced.
 *
 * The mechanism is deliberately not new. ADR-025 §5 says an update restart
 * **is** a quit and takes the same path, so this reuses phase-07e's coordinator
 * exactly as `before-quit` does: fire the save, wait, capped. Writing a second
 * shutdown path would be a second place for the save to be got wrong.
 *
 * ## It restarts even when the save did not settle
 *
 * §5 caps the wait so a wedged renderer _"can delay a restart but never
 * prevent it"_, and this is not §1's precedence rule being bent. Nothing is at
 * risk that atomic writes did not already protect: `SAVE_FORMAT.md` §7.1
 * guarantees a previous good save is on disk throughout, so the cost of a
 * timeout is the last few seconds of play and never the farm. The alternative
 * — a renderer that has stopped answering can veto every future update,
 * including the one that fixes it — is the worse save-integrity outcome, which
 * is the same argument ADR-025 §Alternatives E makes about shipping an updater
 * at all.
 */

import type { SaveWaitOutcome } from './save-triggers';

export interface RestartGateDeps {
  /** Whether a verified package is staged and ready to be installed. */
  readonly isUpdateReady: () => boolean;
  /** The quit-save deadline (`SAVE_FORMAT.md` §7.2). */
  readonly saveTimeoutMs: number;
  /** Fires the quit save and resolves when it settles or the deadline passes. */
  readonly saveAndWait: (timeoutMs: number) => Promise<SaveWaitOutcome>;
  /** Hands the process to the installer. Does not return in practice. */
  readonly installAndRestart: () => void;
}

export type RestartResult =
  | { readonly restarted: true; readonly save: SaveWaitOutcome }
  | { readonly restarted: false; readonly reason: 'nothing-ready' | 'already-restarting' };

export interface RestartGate {
  /** Consent has been given. Saves, then restarts. */
  request(): Promise<RestartResult>;
}

export function createRestartGate(deps: RestartGateDeps): RestartGate {
  // Latched rather than cleared, because there is no "after" to clear it in:
  // once `installAndRestart` runs the process is on its way out, and anything
  // arriving later is a click that beat the shutdown.
  let restarting = false;

  return {
    async request() {
      if (restarting) return { restarted: false, reason: 'already-restarting' };

      // Checked before the save, because a save has a real cost — it blocks a
      // renderer frame to serialize — and paying it for a restart that cannot
      // happen would be a stutter in exchange for nothing.
      if (!deps.isUpdateReady()) return { restarted: false, reason: 'nothing-ready' };

      restarting = true;

      // The save path is already the most defended code in this project, but
      // if it does throw, the previous save is still on disk and refusing to
      // restart would strand the player on a build they asked to leave.
      // Reported as `unavailable`, which is what "there was no usable answer"
      // already means in `SaveWaitOutcome`.
      const save = await deps
        .saveAndWait(deps.saveTimeoutMs)
        .catch<SaveWaitOutcome>(() => 'unavailable');

      deps.installAndRestart();
      return { restarted: true, save };
    },
  };
}
