/**
 * The renderer's view of updating. Phase-15 — ADR-025 §5, §6.
 *
 * Wraps the preload bridge behind an interface, exactly like the companion and
 * overlay controllers: React never touches `window.desktopLife` directly,
 * which keeps components testable without Electron and the UI layer free of
 * any `electron` dependency (`CODE_STYLE.md` §8.1).
 *
 * ## An announcement does not expire
 *
 * This is the one thing that separates it from `CompanionToast`'s confirmations.
 * "Work mode on" is a receipt for something the player just did, and it should
 * get out of the way. An update announcement is a PROMPT: a player who looked
 * away for three seconds must not have silently declined an update. ADR-025 §5
 * calls it "dismissible", and dismissible only means something if it is still
 * there to dismiss.
 *
 * Dismissal is local and main is never told. Main's announcer already recorded
 * that this version was announced, so it will not offer it again; a round trip
 * would add nothing but a way for the two to disagree.
 */

import type { UpdateAnnouncement, UpdateState } from '../../shared/ipc/contract';

export interface UpdateBridge {
  getState(): Promise<UpdateState>;
  setPinnedVersion(version: string | null): Promise<UpdateState>;
  onAnnouncement(listener: (announcement: UpdateAnnouncement) => void): () => void;
}

export interface UpdateController {
  /** The version running now — what a pin is relative to. */
  currentVersion(): string;
  /** The version the player will not be moved past, or `null`. */
  pinnedVersion(): string | null;
  /** Sets or clears the pin. Applied optimistically, then confirmed. */
  setPinnedVersion(version: string | null): void;
  /** What is being announced, or `null`. Persists until dismissed. */
  announcement(): UpdateAnnouncement | null;
  dismiss(): void;
  /** Subscribes to update state. Returns teardown. */
  subscribe(listener: () => void): () => void;
}

/** Before main answers. Shown nowhere — the panel waits for the real version. */
const UNKNOWN_VERSION = '';

export function createUpdateController(bridge: UpdateBridge): UpdateController {
  const listeners = new Set<() => void>();
  let state: UpdateState = { currentVersion: UNKNOWN_VERSION, pinnedVersion: null };
  let announcement: UpdateAnnouncement | null = null;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const adopt = (next: UpdateState): void => {
    state = next;
    notify();
  };

  void bridge.getState().then(adopt);

  // One slot, exactly as the companion toast has: a new announcement replaces
  // the current one. Two stacked update prompts is the notification spam this
  // product refuses to become (`VISION.md` §5.1).
  bridge.onAnnouncement((next) => {
    announcement = next;
    notify();
  });

  return {
    currentVersion: () => state.currentVersion,
    pinnedVersion: () => state.pinnedVersion,

    setPinnedVersion: (version) => {
      // Optimistic, so the control does not lag the click — then overwritten
      // by main's answer, which has been through the settings schema and may
      // differ (a trimmed pin, a blank one read as no pin at all).
      state = { ...state, pinnedVersion: version };
      notify();
      void bridge.setPinnedVersion(version).then(adopt);
    },

    announcement: () => announcement,

    dismiss: () => {
      announcement = null;
      notify();
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
