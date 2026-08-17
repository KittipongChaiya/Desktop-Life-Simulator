/**
 * Contracts projection. Phase-20 — ADR-032 §1, §6.
 *
 * What the boundary holds: the board projects today's offers with acceptance
 * flags, the docket carries LIVE held counts, the change test republishes on
 * exactly the moments the panel's numbers move, and projection touches no
 * RNG (the stream discipline every derivation obeys).
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { asContentId } from '../../shared/ids';
import { acceptContract } from '../commands/contract-commands';
import { stepSimulation } from '../tick';
import { OFFERS_PER_DAY, offersForDay } from '../town/offers';
import { addItems } from '../world/container';
import { createWorld, type World } from '../world/world';

import { contractsEqual, projectContracts } from './contracts-slice';

function freshWorld(): World {
  const world = createWorld(41);
  stepSimulation(world);
  return world;
}

describe('projection', () => {
  it('projects today’s board with names attached', () => {
    const world = freshWorld();
    const slice = projectContracts(world);

    expect(slice.offers).toHaveLength(OFFERS_PER_DAY);
    for (const offer of slice.offers) {
      expect(offer.itemName.length).toBeGreaterThan(0);
      expect(offer.requesterName.length).toBeGreaterThan(0);
      expect(offer.accepted).toBe(false);
    }
    expect(slice.active).toEqual([]);
    expect(slice.docketFull).toBe(false);
  });

  it('flags an accepted offer and tracks held progress live', () => {
    const world = freshWorld();
    const offer = offersForDay(world, 0)[0];
    if (offer === undefined) throw new Error('no offer');
    acceptContract(world, offer.offerId);

    let slice = projectContracts(world);
    expect(slice.offers[0]?.accepted).toBe(true);
    expect(slice.active[0]?.held).toBe(0);

    addItems(world.inventory, asContentId(offer.item), 2, 999);
    slice = projectContracts(world);
    expect(slice.active[0]?.held).toBe(2);
  });

  it('caps the held readout at the wanted quantity', () => {
    const world = freshWorld();
    const offer = offersForDay(world, 0)[0];
    if (offer === undefined) throw new Error('no offer');
    acceptContract(world, offer.offerId);
    addItems(world.inventory, asContentId(offer.item), offer.quantity + 50, 999);

    expect(projectContracts(world).active[0]?.held).toBe(offer.quantity);
  });
});

describe('the change test (ADR-005 §2)', () => {
  it('an untouched world compares equal — no republish', () => {
    const world = freshWorld();
    expect(contractsEqual(projectContracts(world), projectContracts(world))).toBe(true);
  });

  it('accepting, progressing, and counting each republish', () => {
    const world = freshWorld();
    const before = projectContracts(world);

    const offer = offersForDay(world, 0)[0];
    if (offer === undefined) throw new Error('no offer');
    acceptContract(world, offer.offerId);
    const accepted = projectContracts(world);
    expect(contractsEqual(before, accepted)).toBe(false);

    addItems(world.inventory, asContentId(offer.item), 1, 999);
    const progressed = projectContracts(world);
    expect(contractsEqual(accepted, progressed)).toBe(false);

    world.contractStats.expired += 1;
    expect(contractsEqual(progressed, projectContracts(world))).toBe(false);
  });
});

describe('purity', () => {
  it('projecting 200 times leaves the RNG untouched', () => {
    const world = freshWorld();
    const before = world.rng.getState();
    for (let i = 0; i < 200; i += 1) projectContracts(world);
    expect(world.rng.getState()).toEqual(before);
  });
});
