/**
 * Accepted contracts — the promises the save carries. Phase-20, ADR-032 §2.
 *
 * Offers are DERIVED (`sim/town/offers.ts`) and never stored; only what the
 * player accepted is state, with its terms frozen at acceptance so no
 * rebalance can rewrite a deal in flight. Plain records in an id-keyed store
 * (ADR-004 §1): behaviour lives in the contract commands and the expiry step.
 *
 * `ContractStats` is event-maintained, not derivable — "ever fulfilled"
 * cannot be recomputed from the contracts that remain (the `cropStats`
 * reasoning, ADR-008). The board panel reads it now; phase-22's reputation
 * reads the same numbers later rather than inventing new ones (ADR-032 §6).
 */

import type { ContentId } from '../../shared/ids';

/** The most contracts a player may hold at once (ADR-032 §2). */
export const MAX_ACTIVE_CONTRACTS = 3;

export interface ActiveContract {
  /**
   * The offer's identity: `day × OFFERS_PER_DAY + slot`. Doubles as the
   * store key and the double-acceptance guard — an offer accepted once can
   * never be accepted again, because its id is already present.
   */
  readonly offerId: number;
  readonly item: ContentId;
  readonly quantity: number;
  /** Frozen at acceptance (ADR-032 §2). Never re-derived, never re-priced. */
  readonly rewardCoins: number;
  /** Absolute tick. At or past it, the expiry step retires the contract. */
  readonly deadlineTick: number;
  /** The resident asking — attribution for the board, never mechanics. */
  readonly requester: ContentId;
  readonly acceptedTick: number;
}

/** Keyed by offer id. Sparse; a farm holds at most `MAX_ACTIVE_CONTRACTS`. */
export type ContractStore = Map<number, ActiveContract>;

export function createContractStore(): ContractStore {
  return new Map();
}

export interface ContractStats {
  fulfilled: number;
  expired: number;
}

export function createContractStats(): ContractStats {
  return { fulfilled: 0, expired: 0 };
}
