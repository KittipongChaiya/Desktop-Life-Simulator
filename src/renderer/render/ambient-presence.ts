/**
 * Presence — whether ambient motion is allowed to be running right now.
 * Phase-07.7j, ADR-017 §2 condition 4.
 *
 * This is the mechanism that makes ambient motion permissible at all, and it
 * is the only genuinely new idea in the phase.
 *
 * THE PROBLEM. Every other effect in 07.7 is finite: it starts, runs, releases
 * its animation lease, and the overlay goes back to drawing nothing. Ambient
 * motion — a swaying tree — never finishes, so it holds the frame loop open
 * for as long as it is enabled. On a window that sits at the bottom of
 * someone's screen for eight hours while they work, that is precisely the cost
 * ADR-001 exists to refuse.
 *
 * THE ANSWER. Motion is worth frames only while somebody is watching. The
 * overlay knows when it was last touched, so ambient motion runs for a while
 * after any pointer activity and then STOPS — dropping its lease, letting the
 * gate go quiet, and leaving the world still. The next mouse movement wakes it.
 *
 * The result restates the invariant rather than repealing it: when the world is
 * static and the player is absent, no frame is drawn. Presence buys the frames,
 * not decoration.
 *
 * Time is passed in, never read. This module has no timers and no listeners —
 * the caller reports activity and asks; that keeps it pure, testable, and
 * impossible to leak.
 */

/**
 * How long ambient motion continues after the last pointer activity.
 *
 * Long enough that reading the farm for a few seconds does not stop it
 * mid-sway; short enough that a player who alt-tabs away stops paying for it
 * almost immediately.
 */
export const AMBIENT_IDLE_TIMEOUT_MS = 8_000;

export interface AmbientPresence {
  /** Records pointer activity. Called from a real input event, never a frame. */
  touch(nowMs: number): void;
  /** Whether ambient motion may run at `nowMs`. */
  isPresent(nowMs: number): boolean;
  /** Forgets any activity — the overlay collapsing or the setting going off. */
  clear(): void;
}

export function createAmbientPresence(
  timeoutMs: number = AMBIENT_IDLE_TIMEOUT_MS,
): AmbientPresence {
  /** Null means "no activity seen", which is absent rather than present. */
  let lastTouchMs: number | null = null;

  return {
    touch(nowMs) {
      if (!Number.isFinite(nowMs)) return;
      lastTouchMs = nowMs;
    },

    isPresent(nowMs) {
      if (lastTouchMs === null) return false;
      // A frame that lands before the touch (a clock adjustment, or a stale
      // timestamp) is treated as present rather than as a negative age — the
      // player did just touch it.
      const age = nowMs - lastTouchMs;
      return age < timeoutMs;
    },

    clear() {
      lastTouchMs = null;
    },
  };
}
