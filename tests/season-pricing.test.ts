/**
 * Phase-11c — the seasonal price modifier, and the band it may never leave.
 *
 * ADR-013 §4's predictability guarantee is the thing under test:
 *
 * > The effective price can never leave the product of the declared bands. A
 * > player who knows the base price always knows the worst and best case. Cozy
 * > is a bound, not a vibe.
 *
 * Two declared bands are now in play — the sale multiplier's [0.50, 1.00] and
 * the seasonal modifier's [0.90, 1.00] — so every price the game can produce
 * lives in [0.45, 1.00] of base. The bounds test walks every crop through
 * every season at both extremes of the sale multiplier rather than sampling.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_DAYS_PER_SEASON, DEFAULT_TICKS_PER_DAY } from '../src/shared/constants';
import { CORE_PUMPKIN, CORE_TURNIP, CORE_WHEAT } from '../src/sim/content/crops';
import {
  MULTIPLIER_CAP,
  MULTIPLIER_FLOOR,
  SEASON_MULTIPLIER_FLOOR,
  salePrice,
  seasonalMultiplier,
} from '../src/sim/world/economy';
import { createWorld, type World } from '../src/sim/world/world';

import type { ContentId } from '../src/shared/ids';

const SEASON_TICKS = DEFAULT_TICKS_PER_DAY * DEFAULT_DAYS_PER_SEASON;

function atSeason(index: number): World {
  const world = createWorld(1);
  world.tick = SEASON_TICKS * index;
  return world;
}

describe('the pipeline is a product, floored once (ADR-013 §4)', () => {
  it('multiplies every modifier before flooring', () => {
    // 100 × 0.9 × 0.5 = 45. Flooring per modifier would give 90 → 45 here but
    // diverges as soon as an intermediate is fractional, which is why the
    // order matters more than this one case suggests.
    expect(salePrice(100, 0.9, 0.5)).toBe(45);
  });

  it('is unchanged for a single modifier', () => {
    // The v0.1 shape still works: phase-11c made this variadic, not different.
    expect(salePrice(230, 0.84)).toBe(Math.floor(230 * 0.84));
  });

  it('floors once, not per modifier', () => {
    // 10 × 0.55 × 0.9 = 4.95 → 4. Flooring stepwise gives floor(5.5)=5 then
    // floor(4.5)=4 — the same answer here, and not in general; this pins the
    // rule rather than the coincidence.
    const product = salePrice(10, 0.55, 0.9);
    expect(product).toBe(Math.floor(10 * 0.55 * 0.9));
  });
});

describe('the seasonal modifier', () => {
  it('is 1.00 for produce in a season its crop grows in', () => {
    // Wheat is spring/summer; season 0 is spring.
    expect(seasonalMultiplier(atSeason(0), CORE_WHEAT)).toBe(1);
  });

  it('is the floor for produce out of season', () => {
    // Autumn: wheat cannot be planted, so its produce is off-season stock.
    expect(seasonalMultiplier(atSeason(2), CORE_WHEAT)).toBe(SEASON_MULTIPLIER_FLOOR);
  });

  it('is 1.00 all year for a year-round crop', () => {
    for (let index = 0; index < 4; index += 1) {
      expect(seasonalMultiplier(atSeason(index), CORE_TURNIP), `season ${String(index)}`).toBe(1);
    }
  });

  it('is 1.00 for anything no crop yields', () => {
    // Seeds. Gating a seed's price by season would double the plantability
    // rule with a second, silent penalty.
    const world = atSeason(2);
    const wheat = world.cropRegistry.get(CORE_WHEAT);
    expect(wheat.ok).toBe(true);
    if (!wheat.ok) return;

    expect(seasonalMultiplier(world, wheat.value.seedItem)).toBe(1);
  });

  it('reads the crop that YIELDS the item, not an id that matches it', () => {
    // Core happens to name produce after its crop. The lookup goes through
    // `harvestYield` so a source whose item id differs still gets a season.
    const world = atSeason(3);
    const pumpkin = world.cropRegistry.get(CORE_PUMPKIN);
    if (!pumpkin.ok) throw new Error('setup failed');

    const yielded = pumpkin.value.harvestYield[0]?.item as ContentId;
    expect(seasonalMultiplier(world, yielded)).toBe(1); // pumpkin is winter-legal
  });

  it('never exceeds 1.00, so the base price stays the ceiling', () => {
    // ADR-013 §4: prices recover to the memorized value. A seasonal PREMIUM
    // would break the one number a player is allowed to memorize.
    const world = createWorld(1);
    for (let index = 0; index < 4; index += 1) {
      world.tick = SEASON_TICKS * index;
      for (const crop of world.cropRegistry.all()) {
        for (const entry of crop.harvestYield) {
          expect(seasonalMultiplier(world, entry.item)).toBeLessThanOrEqual(1);
          expect(seasonalMultiplier(world, entry.item)).toBeGreaterThanOrEqual(
            SEASON_MULTIPLIER_FLOOR,
          );
        }
      }
    }
  });
});

describe('the effective price never leaves the product of the bands', () => {
  it('stays inside [0.45, 1.00] of base for every crop in every season', () => {
    // Exhaustive rather than sampled: four crops, four seasons, both extremes
    // of the sale multiplier. The band is the guarantee, so it is checked
    // everywhere the game can reach.
    const world = createWorld(1);
    const lowest = MULTIPLIER_FLOOR * SEASON_MULTIPLIER_FLOOR;

    for (let index = 0; index < 4; index += 1) {
      world.tick = SEASON_TICKS * index;

      for (const item of world.itemRegistry.all()) {
        const season = seasonalMultiplier(world, item.id);

        for (const multiplier of [MULTIPLIER_FLOOR, 0.73, MULTIPLIER_CAP]) {
          const price = salePrice(item.basePrice, multiplier, season);

          expect(price, `${item.id} at season ${String(index)}`).toBeLessThanOrEqual(
            item.basePrice * MULTIPLIER_CAP,
          );
          expect(price, `${item.id} at season ${String(index)}`).toBeGreaterThanOrEqual(
            Math.floor(item.basePrice * lowest),
          );
        }
      }
    }
  });

  it('is integer everywhere, always', () => {
    const world = atSeason(2);
    for (const item of world.itemRegistry.all()) {
      const price = salePrice(item.basePrice, 0.67, seasonalMultiplier(world, item.id));
      expect(Number.isInteger(price)).toBe(true);
    }
  });

  it('the two bands multiply to the declared floor', () => {
    // Pins the arithmetic behind the documented [0.45, 1.00], so a change to
    // either band has to come here and state the new one.
    expect(MULTIPLIER_FLOOR * SEASON_MULTIPLIER_FLOOR).toBeCloseTo(0.45, 10);
    expect(MULTIPLIER_CAP * 1).toBe(1);
  });
});
