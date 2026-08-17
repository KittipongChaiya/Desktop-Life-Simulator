/**
 * Derived offers. Phase-20 — ADR-032 §1, §3.
 *
 * What the board must hold: the same day derives the same offers forever, the
 * items are in-season and deliverable, the money sits inside the declared
 * premium band, and no RNG is anywhere near any of it.
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { isInSeason } from '../content/crops';
import { RESIDENTS } from '../content/residents';
import { seasonFor } from '../time/game-clock';
import { createWorld } from '../world/world';

import {
  BOARD_SLOTS,
  CONTRACT_DAYS,
  GRAND_SLOT,
  offerById,
  offersForDay,
  PREMIUM_STEPS,
  requiredStandingFor,
} from './offers';

const world = createWorld(20_260_817);

describe('the board derives', () => {
  it('posts the configured number of offers, identically every time', () => {
    for (const day of [0, 1, 5, 30]) {
      const offers = offersForDay(world, day);
      expect(offers).toHaveLength(BOARD_SLOTS);
      expect(offers).toEqual(offersForDay(world, day));
    }
  });

  it('gives every offer its identity and its day', () => {
    for (const [slot, offer] of offersForDay(world, 7).entries()) {
      expect(offer.offerId).toBe(7 * BOARD_SLOTS + slot);
      expect(offer.day).toBe(7);
      expect(offerById(world, offer.offerId)).toEqual(offer);
    }
  });

  it('different days differ somewhere across a week', () => {
    const weeks = [0, 1, 2, 3, 4, 5, 6].map((day) => JSON.stringify(offersForDay(world, day)));
    expect(new Set(weeks).size).toBeGreaterThan(1);
  });

  it('consumes no RNG — the board is a hash, never a draw', () => {
    const before = world.rng.getState();
    for (let day = 0; day < 50; day += 1) offersForDay(world, day);
    expect(world.rng.getState()).toEqual(before);
  });
});

describe('every offer is actionable (ADR-032 §1)', () => {
  it('asks only for yields of crops plantable in the offer day’s season', () => {
    for (const day of [0, 8, 15, 22]) {
      const season = seasonFor(day, world.daysPerSeason, world.seasons);
      for (const offer of offersForDay(world, day)) {
        const crop = world.cropRegistry
          .all()
          .find((candidate) => candidate.harvestYield[0]?.item === offer.item);
        expect(crop, `${offer.item} is nobody's yield`).toBeDefined();
        if (crop !== undefined) expect(isInSeason(crop, season)).toBe(true);
      }
    }
  });

  it('names a real resident and a reachable deadline', () => {
    const residentIds = new Set<string>(RESIDENTS.map((resident) => resident.id));
    for (const offer of offersForDay(world, 3)) {
      expect(residentIds.has(offer.requester)).toBe(true);
      expect(offer.deadlineTick).toBe((3 + CONTRACT_DAYS) * world.ticksPerDay);
    }
  });
});

describe('the tier ladder (ADR-034 §2)', () => {
  it('slots 0–1 are open, slot 2 asks for a Friend, slot 3 for a Pillar', () => {
    for (const day of [0, 11]) {
      expect(requiredStandingFor(day * BOARD_SLOTS + 0)).toBe('newcomer');
      expect(requiredStandingFor(day * BOARD_SLOTS + 1)).toBe('newcomer');
      expect(requiredStandingFor(day * BOARD_SLOTS + 2)).toBe('friend');
      expect(requiredStandingFor(day * BOARD_SLOTS + 3)).toBe('pillar');
    }
  });

  it('the grand slot asks for visibly more value than the open band allows', () => {
    for (let day = 0; day < 30; day += 1) {
      const grand = offersForDay(world, day)[GRAND_SLOT];
      expect(grand).toBeDefined();
      if (grand === undefined) continue;
      const definition = world.itemRegistry.get(grand.item);
      expect(definition.ok).toBe(true);
      if (!definition.ok) continue;
      const value = grand.quantity * definition.value.basePrice;
      // The 400–900 band, with half-a-base rounding slop on either side.
      expect(value).toBeGreaterThanOrEqual(400 - definition.value.basePrice / 2);
      expect(value).toBeLessThanOrEqual(900 + definition.value.basePrice / 2);
    }
  });

  it('the open slots keep the standard band — tiers never shrink the everyday board', () => {
    for (let day = 0; day < 30; day += 1) {
      for (const offer of offersForDay(world, day).slice(0, 2)) {
        const definition = world.itemRegistry.get(offer.item);
        if (!definition.ok) continue;
        const value = offer.quantity * definition.value.basePrice;
        expect(value).toBeLessThanOrEqual(600 + definition.value.basePrice / 2);
      }
    }
  });
});

describe('the money sits in the declared band (ADR-032 §3)', () => {
  it('always pays more than base, never more than half again', () => {
    const low = PREMIUM_STEPS[0];
    const high = PREMIUM_STEPS[PREMIUM_STEPS.length - 1] ?? low;
    for (let day = 0; day < 30; day += 1) {
      for (const offer of offersForDay(world, day)) {
        const definition = world.itemRegistry.get(offer.item);
        expect(definition.ok).toBe(true);
        if (!definition.ok) continue;
        const base = definition.value.basePrice;

        expect(offer.quantity).toBeGreaterThanOrEqual(2);
        // Per-unit: reward/quantity is floor(base × premium) for a premium in band.
        const perUnit = offer.rewardCoins / offer.quantity;
        expect(Number.isInteger(perUnit)).toBe(true);
        expect(perUnit).toBeGreaterThanOrEqual(Math.floor(base * low));
        expect(perUnit).toBeLessThanOrEqual(Math.floor(base * high));
        expect(perUnit).toBeGreaterThan(base - 1); // ≥ base: always above the spot ceiling
      }
    }
  });
});
