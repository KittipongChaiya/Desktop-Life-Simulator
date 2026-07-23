/**
 * The wallet. Phase-06, ADR-013 §Decision (money as a resource).
 *
 * Coins are a conserved integer resource in an owner-tagged container — the
 * wallet is that container (`ARCHITECTURE.md`, ADR-011 extended to money).
 * There is exactly one in v0.1: the player's. Every credit and debit passes
 * through `addCoins`/`spendCoins`, which are the declared boundary operations;
 * money is created or destroyed nowhere else (ADR-013 source/sink registry).
 *
 * Integer-only (`GAME_DESIGN.md` §6.1, ADR-007 §7): both operations reject a
 * fractional or negative amount outright, so no sequence of calls can ever
 * leave a fractional or negative balance. Rejections mutate nothing — the
 * command pattern's validate-then-mutate contract (ADR-010 §2) starts here.
 */

import { appError, ErrorCode } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';

export interface Wallet {
  /** Non-negative integer. Written only by `addCoins`/`spendCoins`. */
  coins: number;
}

/** Opening balance of a new world — the declared source (`GAME_DESIGN.md` §6.4). */
export const STARTING_COINS = 100;

export function createWallet(coins: number): Wallet {
  if (!Number.isSafeInteger(coins) || coins < 0) {
    // A bad opening balance is a programming error, not a runtime condition —
    // no player input reaches this constructor.
    throw new Error(`wallet must open on a non-negative integer, got ${coins}`);
  }
  return { coins };
}

/** True when `amount` is a legal transaction size: a non-negative integer. */
function isValidAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0;
}

/** Credits `amount` coins. A source/transfer-in boundary (ADR-013). */
export function addCoins(wallet: Wallet, amount: number): Result<void> {
  if (!isValidAmount(amount)) {
    return err(
      appError(ErrorCode.InvalidIntent, 'coin amount must be a non-negative integer', { amount }),
    );
  }
  wallet.coins += amount;
  return ok();
}

/**
 * Debits exactly `amount` coins, or nothing.
 *
 * All-or-nothing: insufficient funds is the typed rejection every purchase
 * surfaces to the player, and it leaves the balance untouched (crit 7).
 */
export function spendCoins(wallet: Wallet, amount: number): Result<void> {
  if (!isValidAmount(amount)) {
    return err(
      appError(ErrorCode.InvalidIntent, 'coin amount must be a non-negative integer', { amount }),
    );
  }
  if (wallet.coins < amount) {
    return err(
      appError(ErrorCode.InsufficientFunds, 'not enough coins', {
        needed: amount,
        held: wallet.coins,
      }),
    );
  }
  wallet.coins -= amount;
  return ok();
}
