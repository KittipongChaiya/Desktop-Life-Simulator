/**
 * The in-overlay notification slot. Phase-01.8b (ADR-014;
 * fix/0.1/1.8.md §Notifications), extended in phase-15 (ADR-025 §5).
 *
 * Never an OS notification (`VISION.md` §5.1). One slot: nothing ever queues,
 * and two things can never stack.
 *
 * ## Two occupants, two lifetimes
 *
 * A **confirmation** answers something the player just did — "Work mode on" —
 * and is a receipt, so it expires and is pointer-transparent. Hiding itself
 * never toasts (the window is invisible — there is nobody to tell); the
 * restore does.
 *
 * An **update announcement** is a prompt, so it does neither. It waits to be
 * dismissed (ADR-025 §5 calls it dismissible, which only means something if it
 * is still there to dismiss) and it takes the mouse, because it has to receive
 * the click that dismisses it.
 *
 * A confirmation takes the slot while it lasts and the prompt returns
 * underneath it — the receipt is about this second, the prompt is not, and
 * losing a prompt behind a hotkey press is the failure this shape prevents.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { UpdateAnnouncement } from '../../../shared/ipc/contract';
import { DEFAULT_BINDINGS, ShortcutAction } from '../../../shared/shortcuts';
import { useCompanion, useUpdate } from '../store-context';

import styles from './CompanionToast.module.css';

/** Long enough to read at a glance, short enough to never linger. */
export const TOAST_DURATION_MS = 2400;

interface Watched {
  readonly workMode: boolean;
  readonly clickThrough: boolean;
  readonly hidden: boolean;
}

/** The toast for one transition, or null when this transition stays silent. */
function messageFor(previous: Watched, next: Watched): string | null {
  if (next.workMode !== previous.workMode) {
    // The way back out comes from the one bindings table — never hardcoded.
    // Work mode hides everything else, so this confirmation is the one thing
    // the player still sees land (resolved interpretation 6).
    return next.workMode
      ? `Work mode on — ${DEFAULT_BINDINGS[ShortcutAction.WorkMode]} to leave`
      : 'Work mode off';
  }
  if (next.clickThrough !== previous.clickThrough) {
    return next.clickThrough
      ? `Click-through on — ${DEFAULT_BINDINGS[ShortcutAction.ClickThrough]} to interact`
      : 'Click-through off';
  }
  if (previous.hidden && !next.hidden) return 'Overlay restored';
  return null;
}

/**
 * What a player reads for an announcement.
 *
 * A refusal arrives already worded: the phrasing belongs with the rule that
 * produced it (`explainRefusal`), and restating it here would be a second
 * place for the two to disagree. An offer is the only thing this surface
 * phrases, because "a version exists" is not a sentence until someone writes
 * one.
 */
function announcementText(announcement: UpdateAnnouncement): string {
  return announcement.kind === 'offer'
    ? `Version ${announcement.version} is available.`
    : announcement.message;
}

export function CompanionToast(): ReactNode {
  const companion = useCompanion();
  const update = useUpdate();
  const [message, setMessage] = useState<string | null>(null);
  const previous = useRef<Watched>({
    workMode: companion.workMode(),
    clickThrough: companion.clickThrough(),
    hidden: companion.hidden(),
  });

  const announcement = useSyncExternalStore(
    (listener) => update.subscribe(listener),
    () => update.announcement(),
    () => update.announcement(),
  );

  const workMode = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.workMode(),
    () => companion.workMode(),
  );

  useEffect(() => {
    return companion.subscribe(() => {
      const next: Watched = {
        workMode: companion.workMode(),
        clickThrough: companion.clickThrough(),
        hidden: companion.hidden(),
      };
      const toast = messageFor(previous.current, next);
      previous.current = next;
      if (toast !== null) setMessage(toast);
    });
  }, [companion]);

  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message]);

  // The confirmation wins the slot while it lasts. It is the shorter-lived of
  // the two and it answers a thing that just happened, so deferring it would
  // make a hotkey look unregistered.
  if (message !== null) {
    return (
      <div
        className={`${styles['toast']} ${styles['confirmation']}`}
        role="status"
        data-testid="companion-toast"
      >
        {message}
      </div>
    );
  }

  // Work mode withholds the prompt without clearing it — ADR-025 §5 forbids
  // announcing to someone who has said they are busy, and ADR-014's rule for
  // a suppressed summary is that it DEFERS rather than vanishes. Main's
  // announcer applies the same rule before delivery; this is the case where
  // work mode starts after an announcement has already landed.
  if (announcement === null || workMode) return null;

  return (
    <div
      className={`${styles['toast']} ${styles['prompt']}`}
      role="status"
      data-interactive
      data-testid="update-notice"
    >
      <span className={styles['promptText']}>{announcementText(announcement)}</span>
      <button
        type="button"
        className={styles['dismiss']}
        onClick={() => {
          // Local, and main is never told: its announcer already recorded that
          // this version was announced, so it will not repeat itself.
          update.dismiss();
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
