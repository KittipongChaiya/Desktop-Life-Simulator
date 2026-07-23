/**
 * Economy state and the pricing engine. Phase-06, GAME_DESIGN.md §6.2,
 * ADR-013 §Decision (pricing pipeline).
 *
 * The multiplier model is v0.1's entire pricing pipeline: one bounded,
 * deterministic modifier per item. Multipliers are stored to 3 decimal places
 * ROUNDED ON WRITE (`SAVE_FORMAT.md` §3.3) — the rounding is what keeps binary
 * floating point out of the save format and out of determinism.
 *
 * The map is SPARSE: an absent entry means 1.0 (undepressed). Recovery deletes
 * entries that reach the cap, so a long-idle economy carries no state at all.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';

import {
  createEconomyState,
  decayedMultiplier,
  multiplierOf,
  recordSale,
  recoverAll,
  recoveredMultiplier,
  salePrice,
  MULTIPLIER_CAP,
  MULTIPLIER_FLOOR,
  RECOVERY_PERIOD_TICKS,
  RECOVERY_PER_PERIOD,
  SALE_DECAY_PER_UNIT,
} from './economy';

const WHEAT = asContentId('core:wheat');
const TURNIP = asContentId('core:turnip');

describe('constants', () => {
  it('match GAME_DESIGN.md §6.2 exactly', () => {
    expect(SALE_DECAY_PER_UNIT).toBe(0.002);
    expect(RECOVERY_PER_PERIOD).toBe(0.005);
    expect(RECOVERY_PERIOD_TICKS).toBe(20);
    expect(MULTIPLIER_FLOOR).toBe(0.5);
    expect(MULTIPLIER_CAP).toBe(1.0);
  });
});

describe('createEconomyState', () => {
  it('starts with every multiplier at 1.0 and no expansions', () => {
    const state = createEconomyState();
    expect(multiplierOf(state, WHEAT)).toBe(1.0);
    expect(state.multipliers.size).toBe(0);
    expect(state.expansionsPurchased).toBe(0);
  });
});

describe('salePrice', () => {
  it('is floor(basePrice × multiplier) — §6.2', () => {
    expect(salePrice(34, 1.0)).toBe(34);
    expect(salePrice(34, 0.998)).toBe(33); // 33.932 floors
    expect(salePrice(34, 0.5)).toBe(17);
    expect(salePrice(12, 0.55)).toBe(6); // 6.6 floors
  });

  it('never produces a fractional price', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.double({ min: 0.5, max: 1.0, noNaN: true }),
        (base, multiplier) => {
          expect(Number.isSafeInteger(salePrice(base, multiplier))).toBe(true);
        },
      ),
    );
  });
});

describe('decayedMultiplier', () => {
  it('drops by exactly n × 0.002 (crit 2)', () => {
    expect(decayedMultiplier(1.0, 1)).toBe(0.998);
    expect(decayedMultiplier(1.0, 10)).toBe(0.98);
    expect(decayedMultiplier(0.9, 50)).toBe(0.8);
  });

  it('the §6.2 worked example: dumping 100 wheat lands on exactly 0.80', () => {
    expect(decayedMultiplier(1.0, 100)).toBe(0.8);
  });

  it('floors at 0.50 and never goes lower (crit 3)', () => {
    expect(decayedMultiplier(1.0, 250)).toBe(0.5);
    expect(decayedMultiplier(1.0, 10_000)).toBe(0.5);
    expect(decayedMultiplier(0.5, 1)).toBe(0.5);
  });

  it('is stable to 3 decimals across repeated writes (SAVE_FORMAT §3.3)', () => {
    let multiplier = 1.0;
    for (let i = 0; i < 250; i += 1) {
      multiplier = decayedMultiplier(multiplier, 1);
      // Rounded on write: the stored value is always an exact 3-decimal value.
      expect(multiplier).toBe(Math.round(multiplier * 1000) / 1000);
    }
    expect(multiplier).toBe(0.5);
  });
});

describe('recoveredMultiplier', () => {
  it('recovers 0.005 per period (crit 4)', () => {
    expect(recoveredMultiplier(0.8, 1)).toBe(0.805);
    expect(recoveredMultiplier(0.8, 10)).toBe(0.85);
  });

  it('caps at 1.00 and never overshoots (crit 4)', () => {
    expect(recoveredMultiplier(0.999, 1)).toBe(1.0);
    expect(recoveredMultiplier(0.5, 1000)).toBe(1.0);
  });

  it('the §6.2 worked example: 0.80 recovers in 40 periods — about 40 seconds', () => {
    expect(recoveredMultiplier(0.8, 40)).toBe(1.0);
    expect(recoveredMultiplier(0.8, 39)).toBeLessThan(1.0);
  });

  it('is pure — usable by phase-07 catch-up with elapsed periods', () => {
    // Recovery over n periods equals n single-period recoveries: the batch
    // form phase-07's catchUp will use agrees with the tick-by-tick form.
    let stepped = 0.641;
    for (let i = 0; i < 25; i += 1) stepped = recoveredMultiplier(stepped, 1);
    expect(recoveredMultiplier(0.641, 25)).toBe(stepped);
  });
});

describe('recordSale', () => {
  it('depresses only the sold item', () => {
    const state = createEconomyState();
    recordSale(state, WHEAT, 10);
    expect(multiplierOf(state, WHEAT)).toBe(0.98);
    expect(multiplierOf(state, TURNIP)).toBe(1.0);
  });

  it('accumulates across sales', () => {
    const state = createEconomyState();
    recordSale(state, WHEAT, 50);
    recordSale(state, WHEAT, 50);
    expect(multiplierOf(state, WHEAT)).toBe(0.8);
  });
});

describe('recoverAll', () => {
  it('recovers every depressed multiplier by one period', () => {
    const state = createEconomyState();
    recordSale(state, WHEAT, 100); // 0.80
    recordSale(state, TURNIP, 10); // 0.98
    recoverAll(state);
    expect(multiplierOf(state, WHEAT)).toBe(0.805);
    expect(multiplierOf(state, TURNIP)).toBe(0.985);
  });

  it('drops an entry once it reaches the cap — the map stays sparse', () => {
    const state = createEconomyState();
    recordSale(state, TURNIP, 1); // 0.998
    recoverAll(state);
    expect(multiplierOf(state, TURNIP)).toBe(1.0);
    expect(state.multipliers.size).toBe(0);
  });
});

describe('multiplier invariants', () => {
  it('stays within [0.50, 1.00] and 3-decimal exact under any activity', () => {
    const events = fc.array(
      fc.oneof(
        fc.record({ kind: fc.constant('sale' as const), units: fc.integer({ min: 1, max: 500 }) }),
        fc.record({ kind: fc.constant('recover' as const) }),
      ),
      { maxLength: 300 },
    );
    fc.assert(
      fc.property(events, (ops) => {
        const state = createEconomyState();
        for (const op of ops) {
          if (op.kind === 'sale') recordSale(state, WHEAT, op.units);
          else recoverAll(state);
          const multiplier = multiplierOf(state, WHEAT);
          expect(multiplier).toBeGreaterThanOrEqual(MULTIPLIER_FLOOR);
          expect(multiplier).toBeLessThanOrEqual(MULTIPLIER_CAP);
          expect(multiplier).toBe(Math.round(multiplier * 1000) / 1000);
        }
      }),
    );
  });
});
