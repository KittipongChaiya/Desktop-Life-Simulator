/**
 * What happened to each content source at load. Phase-09f — ADR-019 §6.
 *
 * The loader already produces this: `installDiscoveredSources` returns every
 * source it installed and every one it refused, with a reason. Until now that
 * went nowhere, which made the guarantee hollow — ADR-019 §6 requires a refusal
 * to be *reported*, and a reason nobody can read is not a report.
 *
 * This is the smallest thing that closes the gap: a value set once at startup
 * and read by the settings panel. Not a store with subscriptions, because the
 * set cannot change while the game runs — sources are resolved before the world
 * exists, and installing one takes a restart.
 *
 * The player-facing wording lives in the panel; this carries the facts.
 */

export interface SourceReport {
  /** Sources that loaded, in resolved order. */
  readonly installed: readonly string[];
  /** Sources that did not, each with the reason its author would need. */
  readonly refused: readonly { readonly source: string; readonly reason: string }[];
}

const EMPTY: SourceReport = { installed: [], refused: [] };

let report: SourceReport = EMPTY;

/** Records the load outcome. Called once, by the composition root. */
export function setSourceReport(next: SourceReport): void {
  report = next;
}

/** The load outcome, or an empty one before startup has run. */
export function sourceReport(): SourceReport {
  return report;
}
