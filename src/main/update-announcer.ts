/**
 * Holding an offer until the player can be told. Phase-15 — ADR-025 §5, §6.
 *
 * `update-policy.ts` answers two questions that need no memory: what may be
 * offered, and whether now is a good moment. This module owns the one thing
 * that does need memory — an offer made while the player is busy has to
 * survive until they are not, without becoming a second announcement when they
 * leave and re-enter work mode.
 *
 * ## Once per version, not once per opportunity
 *
 * Presence changes constantly; an available release does not. Announcing on
 * every opportunity would turn one release into a toast on every hotkey press,
 * which is `VISION.md` §5.1's notification spammer arriving through the back
 * door. So the announcer remembers what it has already said, and re-announces
 * only when the news itself is new.
 *
 * ## Pure, so the waiting is testable
 *
 * State in, state out, no timers and no window. The thing most likely to be
 * wrong here is the *sequence* — busy, offer, still busy, halt, available —
 * and a sequence is only cheap to test when replaying it is a function call.
 */

import { explainRefusal } from './rollback-guard';
import { announcementTiming, type Presence, type UpdateVerdict } from './update-policy';

/** What the player is told. Holds never appear here — they are silent. */
export type Announcement =
  | { readonly kind: 'offer'; readonly version: string }
  | { readonly kind: 'refusal'; readonly message: string };

export interface AnnouncerState {
  /** An announcement earned but not yet delivered, because the player is busy. */
  readonly pending: Announcement | null;
  /** What was last delivered, so the same news is never delivered twice. */
  readonly announced: string | null;
}

export const NO_ANNOUNCEMENT: AnnouncerState = { pending: null, announced: null };

export interface AnnouncerStep {
  readonly state: AnnouncerState;
  /** What to show right now, or `null` for silence. */
  readonly announce: Announcement | null;
}

/** Identity for "have I already said this?" — the news, not the occasion. */
function keyOf(announcement: Announcement): string {
  return announcement.kind === 'offer'
    ? `offer:${announcement.version}`
    : `refusal:${announcement.message}`;
}

/**
 * The announcement a verdict earns, or `null` when it earns silence.
 *
 * A refusal is here and a hold is not, which is `update-policy.ts`'s check
 * order paying off: by the time a refusal exists, four silent holds have
 * already excluded every release the player was never going to receive, so
 * what is left is a build that really could have orphaned their farm.
 */
function announcementFor(verdict: UpdateVerdict): Announcement | null {
  if (verdict.kind === 'offer') return { kind: 'offer', version: verdict.version };
  if (verdict.kind === 'refuse') {
    return { kind: 'refusal', message: explainRefusal(verdict.refusal) };
  }
  return null;
}

function deliverOrDefer(
  state: AnnouncerState,
  announcement: Announcement,
  presence: Presence,
): AnnouncerStep {
  if (announcementTiming(presence) === 'wait') {
    return { state: { ...state, pending: announcement }, announce: null };
  }
  return { state: { pending: null, announced: keyOf(announcement) }, announce: announcement };
}

/**
 * Folds a check's verdict into the announcer.
 *
 * A verdict that earns silence **clears anything pending**, and that is the
 * halt doing its job (ADR-025 §6). An offer queued behind work mode and then
 * announced anyway would be a halt that arrived too late for the one player it
 * could still have helped — the publisher stopped the rollout precisely so
 * that installs which had not taken it yet would not.
 */
export function announceVerdict(
  state: AnnouncerState,
  verdict: UpdateVerdict,
  presence: Presence,
): AnnouncerStep {
  const announcement = announcementFor(verdict);
  if (announcement === null) return { state: { ...state, pending: null }, announce: null };

  // Already said. Keep it out of `pending` so a later presence change does not
  // resurrect it.
  if (keyOf(announcement) === state.announced) {
    return { state: { ...state, pending: null }, announce: null };
  }

  return deliverOrDefer(state, announcement, presence);
}

/**
 * Folds a presence change into the announcer.
 *
 * Called whenever the player hides, restores, enters or leaves work mode. With
 * nothing pending it is a no-op, which is the common case by a wide margin —
 * presence moves all day and an update arrives every few weeks.
 */
export function announceToPresence(state: AnnouncerState, presence: Presence): AnnouncerStep {
  if (state.pending === null) return { state, announce: null };

  return deliverOrDefer(state, state.pending, presence);
}
