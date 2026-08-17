/**
 * Demand, derived. Phase-21 — ADR-033.
 *
 * The properties the amendment rests on: every answer sits in the declared
 * band, the table redistributes rather than inflates (mean exactly 1), a
 * spell is constant for its whole two days, non-yield items are exempt, the
 * derivation is a hash (RNG untouched), and the catch-up bound is genuinely
 * the minimum over the spells a gap touched.
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { CORE_TURNIP_SEED } from '../content/items';
import { stepSimulation } from '../tick';

import {
  DEMAND_SPELL_DAYS,
  DEMAND_STEPS,
  demandAtSpell,
  demandMultiplier,
  demandSpellFor,
  worstDemandOver,
} from './economy';
import { createWorld } from './world';

const world = createWorld(20_260_817);
const TURNIP = 'core:turnip' as never;
const STEPS = new Set<number>(DEMAND_STEPS);

describe('the declared band (ADR-033 §1)', () => {
  it('every spell answers a value from the table', () => {
    for (let spell = 0; spell < 200; spell += 1) {
      expect(STEPS.has(demandAtSpell(world, TURNIP, spell))).toBe(true);
    }
  });

  it('the table redistributes: its mean is exactly 1', () => {
    const mean = DEMAND_STEPS.reduce((sum, step) => sum + step, 0) / DEMAND_STEPS.length;
    expect(mean).toBeCloseTo(1, 10);
  });

  it('non-yield items answer 1 — a seed has no market mood', () => {
    for (let spell = 0; spell < 20; spell += 1) {
      expect(demandAtSpell(world, CORE_TURNIP_SEED, spell)).toBe(1);
    }
  });
});

describe('spells are piecewise-constant', () => {
  it('holds one value for a whole spell, keyed off the day', () => {
    const ticksPerSpell = world.ticksPerDay * DEMAND_SPELL_DAYS;
    const inFirstSpell = demandSpellFor(ticksPerSpell - 1, world.ticksPerDay);
    const inSecondSpell = demandSpellFor(ticksPerSpell, world.ticksPerDay);
    expect(inFirstSpell).toBe(0);
    expect(inSecondSpell).toBe(1);
  });

  it('spells vary across a season — a market that moves', () => {
    const values = new Set<number>();
    for (let spell = 0; spell < 20; spell += 1) values.add(demandAtSpell(world, TURNIP, spell));
    expect(values.size).toBeGreaterThan(1);
  });

  it('two seeds want different things', () => {
    const other = createWorld(7);
    const a = Array.from({ length: 12 }, (_, s) => demandAtSpell(world, TURNIP, s));
    const b = Array.from({ length: 12 }, (_, s) => demandAtSpell(other, TURNIP, s));
    expect(a).not.toEqual(b);
  });
});

describe('purity (the ADR-022 stream rule)', () => {
  it('500 derivations leave the RNG untouched', () => {
    const fresh = createWorld(99);
    stepSimulation(fresh);
    const before = fresh.rng.getState();
    for (let i = 0; i < 500; i += 1) demandMultiplier(fresh, TURNIP);
    expect(fresh.rng.getState()).toEqual(before);
  });
});

describe('the catch-up bound (ADR-033 §4)', () => {
  it('is exact inside one spell and the minimum across several', () => {
    const perSpell = world.ticksPerDay * DEMAND_SPELL_DAYS;

    // One spell: the bound IS the spell's value.
    expect(worstDemandOver(world, TURNIP, 100, perSpell - 1)).toBe(demandAtSpell(world, TURNIP, 0));

    // Several: never above any touched spell.
    const bound = worstDemandOver(world, TURNIP, 0, perSpell * 6 - 1);
    for (let spell = 0; spell < 6; spell += 1) {
      expect(bound).toBeLessThanOrEqual(demandAtSpell(world, TURNIP, spell));
    }
    // …and equal to the smallest of them, not merely below.
    const smallest = Math.min(
      ...Array.from({ length: 6 }, (_, s) => demandAtSpell(world, TURNIP, s)),
    );
    expect(bound).toBe(smallest);
  });
});
