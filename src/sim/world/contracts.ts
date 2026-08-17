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
  /**
   * The tick the goods were delivered, or null while open (v9, ADR-032 §2
   * as amended). A fulfilled contract STAYS in the store until the deadline
   * sweep retires it — its presence is the double-acceptance guard, and
   * removing it on delivery was the exploit phase-20's live verification
   * caught: the offer reappeared as acceptable and one good deal could be
   * looped all day, bypassing the spot market's decay entirely.
   */
  fulfilledTick: number | null;
}

/**
 * Keyed by offer id. Holds at most `MAX_ACTIVE_CONTRACTS` OPEN contracts;
 * fulfilled ones ride along until their deadline passes.
 */
export type ContractStore = Map<number, ActiveContract>;

/** Contracts still awaiting delivery — the docket the cap counts. */
export function openContracts(store: ContractStore): number {
  let open = 0;
  for (const contract of store.values()) {
    if (contract.fulfilledTick === null) open += 1;
  }
  return open;
}

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
