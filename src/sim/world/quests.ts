/**
 * Quest payout watermarks. Phase-22 — ADR-034 §4.
 *
 * A chain's PROGRESS is derived — counters compared to declared thresholds —
 * and never stored. What cannot be derived is whether a step's reward has
 * been PAID: coins granted once must stay granted once, and the wallet does
 * not remember why it grew (the `cropStats` reasoning a third time). The
 * store is therefore one high-water mark per chain: how many of its steps
 * have already paid out.
 */

import type { ContractStats } from './contracts';

/** Chain id → steps already paid. Absent means zero. */
export type QuestLog = Map<string, number>;

export function createQuestLog(): QuestLog {
  return new Map();
}

export function stepsPaid(log: QuestLog, chainId: string): number {
  return log.get(chainId) ?? 0;
}

/** Which counter a chain reads (ADR-034 §4). */
export type QuestCounter =
  { readonly kind: 'fulfilled' } | { readonly kind: 'requester'; readonly requester: string };

export function counterValue(stats: ContractStats, counter: QuestCounter): number {
  return counter.kind === 'fulfilled'
    ? stats.fulfilled
    : (stats.byRequester[counter.requester] ?? 0);
}
