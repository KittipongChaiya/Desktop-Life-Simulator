/**
 * The wallet. Phase-06, ADR-013 §Decision (money as a resource).
 *
 * Coins are a conserved integer resource: created and destroyed only at
 * declared source/sink boundaries, held as a non-negative integer, never
 * fractional (`GAME_DESIGN.md` §6.1). The two properties at the bottom are the
 * load-bearing tests — no sequence of operations may ever produce a fractional
 * or negative balance.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../shared/errors';

import { addCoins, createWallet, spendCoins, STARTING_COINS } from './wallet';

describe('createWallet', () => {
  it('starts at the declared opening balance', () => {
    expect(createWallet(100).coins).toBe(100);
  });

  it('the starting capital matches GAME_DESIGN.md §6.4', () => {
    expect(STARTING_COINS).toBe(100);
  });

  it('rejects a fractional or negative opening balance', () => {
    expect(() => createWallet(1.5)).toThrow();
    expect(() => createWallet(-1)).toThrow();
  });
});

describe('addCoins', () => {
  it('credits the amount', () => {
    const wallet = createWallet(10);
    const result = addCoins(wallet, 25);
    expect(result.ok).toBe(true);
    expect(wallet.coins).toBe(35);
  });

  it('rejects a fractional amount and mutates nothing', () => {
    const wallet = createWallet(10);
    const result = addCoins(wallet, 2.5);
    expect(result.ok).toBe(false);
    expect(wallet.coins).toBe(10);
  });

  it('rejects a negative amount — a credit is never a hidden spend', () => {
    const wallet = createWallet(10);
    expect(addCoins(wallet, -5).ok).toBe(false);
    expect(wallet.coins).toBe(10);
  });

  it('accepts zero as a no-op credit', () => {
    const wallet = createWallet(10);
    expect(addCoins(wallet, 0).ok).toBe(true);
    expect(wallet.coins).toBe(10);
  });
});

describe('spendCoins', () => {
  it('debits the amount', () => {
    const wallet = createWallet(100);
    const result = spendCoins(wallet, 60);
    expect(result.ok).toBe(true);
    expect(wallet.coins).toBe(40);
  });

  it('spends down to exactly zero', () => {
    const wallet = createWallet(100);
    expect(spendCoins(wallet, 100).ok).toBe(true);
    expect(wallet.coins).toBe(0);
  });

  it('rejects insufficient funds with the typed error and mutates nothing', () => {
    const wallet = createWallet(50);
    const result = spendCoins(wallet, 51);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InsufficientFunds);
    expect(wallet.coins).toBe(50);
  });

  it('rejects a fractional amount and mutates nothing', () => {
    const wallet = createWallet(50);
    expect(spendCoins(wallet, 0.5).ok).toBe(false);
    expect(wallet.coins).toBe(50);
  });

  it('rejects a negative amount — a spend is never a hidden credit', () => {
    const wallet = createWallet(50);
    expect(spendCoins(wallet, -10).ok).toBe(false);
    expect(wallet.coins).toBe(50);
  });
});

describe('wallet invariants', () => {
  /** Any interleaving of adds and spends, any amounts (including hostile ones). */
  const operations = fc.array(
    fc.record({
      kind: fc.constantFrom('add' as const, 'spend' as const),
      amount: fc.oneof(
        fc.integer({ min: 0, max: 10_000 }),
        fc.double({ min: -100, max: 100, noNaN: true }),
      ),
    }),
    { maxLength: 200 },
  );

  it('coins are always a non-negative integer — no sequence breaks it (crit 5)', () => {
    fc.assert(
      fc.property(operations, (ops) => {
        const wallet = createWallet(100);
        for (const op of ops) {
          if (op.kind === 'add') addCoins(wallet, op.amount);
          else spendCoins(wallet, op.amount);
          expect(Number.isSafeInteger(wallet.coins)).toBe(true);
          expect(wallet.coins).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it('accepted operations conserve exactly — balance equals the ledger (ADR-013)', () => {
    fc.assert(
      fc.property(operations, (ops) => {
        const wallet = createWallet(100);
        let ledger = 100;
        for (const op of ops) {
          const result =
            op.kind === 'add' ? addCoins(wallet, op.amount) : spendCoins(wallet, op.amount);
          if (result.ok) ledger += op.kind === 'add' ? op.amount : -op.amount;
        }
        expect(wallet.coins).toBe(ledger);
      }),
    );
  });
});
