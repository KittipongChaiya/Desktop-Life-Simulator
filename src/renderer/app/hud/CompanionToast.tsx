/**
 * Companion toasts. Phase-01.8b (ADR-014; fix/0.1/1.8.md §Notifications).
 *
 * Transient, in-overlay confirmations for the companion toggles — never an OS
 * notification (`VISION.md` §5.1). One slot: a new toast replaces the current
 * one, so nothing ever queues. Hiding itself never toasts (the window is
 * invisible — there is nobody to tell); the restore does.
 *
 * Pointer-transparent by construction: no `data-interactive`, no
 * `pointer-events` opt-in — a confirmation must never intercept a click nor
 * flip the hit-testing state it is confirming.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { DEFAULT_BINDINGS, ShortcutAction } from '../../../shared/shortcuts';
import { useCompanion } from '../store-context';

import styles from './CompanionToast.module.css';

/** Long enough to read at a glance, short enough to never linger. */
export const TOAST_DURATION_MS = 2400;

interface Watched {
  readonly clickThrough: boolean;
  readonly hidden: boolean;
}

/** The toast for one transition, or null when this transition stays silent. */
function messageFor(previous: Watched, next: Watched): string | null {
  if (next.clickThrough !== previous.clickThrough) {
    // The way back out comes from the one bindings table — never hardcoded.
    return next.clickThrough
      ? `Click-through on — ${DEFAULT_BINDINGS[ShortcutAction.ClickThrough]} to interact`
      : 'Click-through off';
  }
  if (previous.hidden && !next.hidden) return 'Overlay restored';
  return null;
}

export function CompanionToast(): ReactNode {
  const companion = useCompanion();
  const [message, setMessage] = useState<string | null>(null);
  const previous = useRef<Watched>({
    clickThrough: companion.clickThrough(),
    hidden: companion.hidden(),
  });

  useEffect(() => {
    return companion.subscribe(() => {
      const next: Watched = {
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

  if (message === null) return null;

  return (
    <div className={styles['toast']} role="status">
      {message}
    </div>
  );
}
