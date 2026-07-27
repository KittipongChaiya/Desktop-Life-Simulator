/**
 * The return summary. Phase-07e — `GAME_DESIGN.md` §9.4.
 *
 * "On load after a gap over 60 seconds, a dismissible summary shows time
 * away, crops harvested, coins earned, and anything that blocked progress."
 *
 * The controller holds the report; the component decides when it is visible.
 * That split is what makes ADR-014's requirement expressible — a summary
 * suppressed by a hidden HUD must DEFER, not vanish — because work mode hides
 * the view without ever touching what is held. Only a dismissal clears it,
 * and a dismissal is the player saying they have read it.
 *
 * Nothing here is game state: the summary describes a load that already
 * happened, and it dies with the session (`SAVE_FORMAT.md` §2.2).
 */

import { RETURN_SUMMARY_MIN_TICKS, TICKS_PER_SECOND } from '../../shared/constants';

/**
 * What the summary shows — a VIEW MODEL, deliberately not `CatchUpReport`.
 *
 * The UI layer may not import persistence (`CODE_STYLE.md` §8.1, enforced by
 * the boundary linter), and it should not want to: catch-up reports items
 * stored, items sold, and replants because those are what the model computed,
 * while §9.4 asks for four things a player cares about. The composition root
 * maps one to the other, which is also where `blockedAtTick` — absolute
 * simulation time — becomes the elapsed-relative number this layer can
 * actually render.
 */
export interface ReturnSummaryReport {
  readonly elapsedTicks: number;
  readonly harvests: number;
  readonly coinsEarned: number;
  /** Ticks into the gap at which progress stopped, or null if nothing did. */
  readonly blockedAfterTicks: number | null;
}

export interface ReturnSummaryController {
  /** The report to show, or null — never shown, or already dismissed. */
  report(): ReturnSummaryReport | null;
  dismiss(): void;
  /** Subscribes to dismissal. Returns teardown. */
  subscribe(listener: () => void): () => void;
}

/**
 * Holds a catch-up report if — and only if — the gap earns a summary.
 *
 * The gate lives here rather than in the component so "under a minute" is one
 * decision with one test, not a condition duplicated into every surface that
 * might later read the report.
 */
export function createReturnSummary(report: ReturnSummaryReport | null): ReturnSummaryController {
  const listeners = new Set<() => void>();
  let held: ReturnSummaryReport | null =
    report !== null && report.elapsedTicks >= RETURN_SUMMARY_MIN_TICKS ? report : null;

  return {
    report: () => held,

    dismiss() {
      if (held === null) return;
      held = null;
      for (const listener of listeners) listener();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Ticks as time a player recognises — "2h 14m", "8m", "3h".
 *
 * Coarse on purpose. The summary answers "how long was I gone", which is a
 * glance, not a stopwatch; seconds appear only below a minute, which the
 * threshold above means can happen at most at the boundary.
 */
export function formatTimeAway(ticks: number): string {
  const totalSeconds = Math.max(0, Math.floor(ticks / TICKS_PER_SECOND));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return minutes > 0 ? `${String(hours)}h ${String(minutes)}m` : `${String(hours)}h`;
  if (minutes > 0) return `${String(minutes)}m`;
  return `${String(totalSeconds)}s`;
}

/**
 * The §9.4 blocker line — "Storage full after 2h 14m".
 *
 * Reporting WHEN progress stopped is what turns dead time into a legible
 * reason to build more storage; "storage was full" alone says nothing about
 * whether that cost the player ten minutes or seven hours.
 */
export function formatBlocker(report: ReturnSummaryReport): string | null {
  if (report.blockedAfterTicks === null) return null;
  return `Storage full after ${formatTimeAway(report.blockedAfterTicks)}`;
}
