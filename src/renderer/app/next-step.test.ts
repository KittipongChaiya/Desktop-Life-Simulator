/**
 * "What now?" rules. Phase-49 — `next-step.ts`.
 *
 * The rules are ordered, and the order IS the design: unblock what is stuck,
 * then take money sitting on the table, then grow. Most of these tests are
 * about priority rather than about any single rule firing, because the way
 * advice goes wrong is by being true and useless.
 */

import { describe, expect, it } from 'vitest';

import { nextStep, type NextStepInput } from './next-step';

/** A farm mid-flow: growing, staffed, room to spare. Nothing to advise. */
const STEADY: NextStepInput = {
  coins: 100,
  workerCount: 2,
  hireCost: 300,
  usedSlots: 10,
  capacity: 40,
  cropCount: 12,
  buildingCount: 2,
  deliverableOffers: 0,
  hasSeed: true,
  sellableGoods: 0,
};

const on = (changes: Partial<NextStepInput>): NextStepInput => ({ ...STEADY, ...changes });

describe('silence is a real answer', () => {
  it('says nothing to a farm that is simply ticking along', () => {
    // A line that always says something becomes a line nobody reads.
    expect(nextStep(STEADY)).toBeNull();
  });
});

describe('what it notices', () => {
  it('full storage, before anything else', () => {
    // THE PRIORITY THAT MATTERS MOST. A full farm stops harvesting, and every
    // other suggestion would be advice to make it worse — so this must win
    // even when several other rules are also true.
    const stuck = on({
      usedSlots: 40,
      capacity: 40,
      workerCount: 0,
      coins: 10_000,
      cropCount: 0,
      deliverableOffers: 3,
      buildingCount: 0,
    });

    expect(nextStep(stuck)?.id).toBe('storage-full');
  });

  it('the first worker, which is the step players miss', () => {
    expect(nextStep(on({ workerCount: 0, coins: 300, hireCost: 150 }))?.id).toBe(
      'hire-first-worker',
    );
  });

  it('a board offer that can actually be delivered', () => {
    expect(nextStep(on({ deliverableOffers: 1 }))?.id).toBe('deliver-offer');
  });

  it('an empty farm with no seed sends you to the shop first', () => {
    // Order within the two "nothing is growing" rules: telling somebody to
    // plant seed they do not have is advice that cannot be followed.
    expect(nextStep(on({ cropCount: 0, hasSeed: false }))?.id).toBe('buy-seed');
    expect(nextStep(on({ cropCount: 0, hasSeed: true }))?.id).toBe('plant-something');
  });

  it('somewhere to put the harvest, once something is growing', () => {
    expect(nextStep(on({ buildingCount: 0, coins: 500 }))?.id).toBe('build-storage');
  });

  it('a second worker only when clearly affordable', () => {
    // Twice the price, so it never nags somebody who has just scraped
    // together enough for one thing.
    expect(nextStep(on({ coins: 300, hireCost: 150 }))?.id).toBe('hire-another');
    expect(nextStep(on({ coins: 299, hireCost: 150 }))).toBeNull();
  });
});

describe('rules that must not misfire', () => {
  it('does not call an empty farm full', () => {
    // `usedSlots >= capacity` is true for 0 >= 0, which would tell a player
    // with no storage at all that their storage is full.
    expect(nextStep(on({ usedSlots: 0, capacity: 0 }))?.id).not.toBe('storage-full');
  });

  it('does not offer a worker that cannot be afforded', () => {
    expect(nextStep(on({ workerCount: 0, coins: 10, hireCost: 150 }))?.id).not.toBe(
      'hire-first-worker',
    );
  });

  it('returns a stable id, so callers match a rule rather than prose', () => {
    // The text is copy and will be rewritten; the id is the contract.
    const step = nextStep(on({ deliverableOffers: 2 }));

    expect(step?.id).toBe('deliver-offer');
    expect(step?.text.length).toBeGreaterThan(0);
  });

  it('is pure — the same farm gives the same advice', () => {
    expect(nextStep(on({ cropCount: 0 }))).toEqual(nextStep(on({ cropCount: 0 })));
  });
});

describe('the first-run loop, taught one step at a time (phase-50)', () => {
  /** A farm on its first minute: nothing built, nobody hired, nothing sown. */
  const FRESH: NextStepInput = {
    coins: 100,
    workerCount: 0,
    hireCost: 150,
    usedSlots: 0,
    capacity: 40,
    cropCount: 0,
    buildingCount: 0,
    deliverableOffers: 0,
    hasSeed: false,
    sellableGoods: 0,
  };

  it('walks a new player through the whole loop without a tutorial mode', () => {
    // ONBOARDING THAT TEACHES BY PLAYING: each step is the state the previous
    // one leaves behind, so the advice moves because the player did, not
    // because a script advanced. There is no tutorial flag anywhere, and
    // nothing to skip, resume or store.
    const seedless = FRESH;
    expect(nextStep(seedless)?.id).toBe('buy-seed');

    const withSeed = { ...seedless, hasSeed: true, coins: 60 };
    expect(nextStep(withSeed)?.id).toBe('plant-something');

    const planted = { ...withSeed, cropCount: 6 };
    expect(nextStep(planted)?.id).toBe('wait-for-growth');

    const harvested = { ...planted, sellableGoods: 12 };
    expect(nextStep(harvested)?.id).toBe('sell-harvest');

    const paid = { ...harvested, sellableGoods: 0, coins: 400 };
    expect(nextStep(paid)?.id).toBe('hire-first-worker');
  });

  it('never tells a new player to wait while something is actionable', () => {
    // "Wait" is last on purpose. A farm with a sellable harvest and no coins
    // has something to DO, and being told to be patient instead would be the
    // hint at its most useless.
    const busy = { ...FRESH, cropCount: 4, sellableGoods: 9, hasSeed: true };

    expect(nextStep(busy)?.id).toBe('sell-harvest');
  });

  it('goes quiet once the farm has staff', () => {
    // The reassurance is for somebody watching their first row grow. A farm
    // with workers is a going concern and does not need to be talked to.
    const staffed = { ...FRESH, cropCount: 6, hasSeed: true, workerCount: 1, coins: 0 };

    expect(nextStep(staffed)).toBeNull();
  });
});
