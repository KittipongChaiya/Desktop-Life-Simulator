/**
 * The major-transaction save trigger. Phase-07e — `SAVE_FORMAT.md` §7.2.
 *
 * §7.2 names three: worker hire, building purchase, land expansion. What they
 * share is that each converts a large pile of coins into something permanent,
 * so losing one to a crash in the next 59 seconds is the loss a player would
 * actually feel.
 *
 * Detected from the SNAPSHOT, not from commands. A command can be submitted
 * and rejected; a slice only changes when the world did. The three totals are
 * monotone by design in v0.1 — nothing fires a worker, demolishes a building,
 * or sells land — so a GROWTH test is the whole rule, and a future shrink can
 * never fire a spurious save.
 *
 * The subscriber runs inside `store.pump`, which runs inside a frame. It does
 * arithmetic and calls a trigger; the save controller is what defers the
 * actual serialization out of the frame.
 */

import type { SnapshotStore } from '../../sim/snapshot/store-contract';

/** The three §7.2 totals, at one moment. */
export interface TransactionTotals {
  readonly workers: number;
  readonly buildings: number;
  readonly expansions: number;
}

/** The slices these totals are read from — the only ones worth subscribing to. */
const WATCHED = ['workers', 'buildings', 'economy'] as const;

export function readTotals(store: SnapshotStore): TransactionTotals {
  return {
    workers: store.get('workers').length,
    buildings: store.get('buildings').length,
    expansions: store.get('economy').expansionsPurchased,
  };
}

/** True when anything the player BOUGHT has appeared since the last reading. */
export function isMajorTransaction(previous: TransactionTotals, next: TransactionTotals): boolean {
  return (
    next.workers > previous.workers ||
    next.buildings > previous.buildings ||
    next.expansions > previous.expansions
  );
}

/**
 * Calls `onTransaction` once per major transaction. Returns teardown.
 *
 * Subscribes to all three slices with one handler: a single hire moves one
 * slice, so at most one notification per change, and a coincidental
 * simultaneous change is still one transaction to save.
 */
export function watchMajorTransactions(
  store: SnapshotStore,
  onTransaction: () => void,
): () => void {
  let totals = readTotals(store);

  const check = (): void => {
    const next = readTotals(store);
    const major = isMajorTransaction(totals, next);
    totals = next;
    if (major) onTransaction();
  };

  const unsubscribes = WATCHED.map((slice) => store.subscribe(slice, check));
  return () => {
    for (const off of unsubscribes) off();
  };
}
