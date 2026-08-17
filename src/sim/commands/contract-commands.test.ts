/**
 * Contract commands and the expiry sweep. Phase-20 — ADR-032 §2, §4, §5.
 *
 * The properties: acceptance freezes the derived terms and guards the docket;
 * delivery is all-or-nothing across everything selling can draw from, pays
 * the FROZEN reward, and publishes the existing sale fact; expiry is silent,
 * counts, and — because it is a tick comparison — handles an offline gap with
 * no code of its own.
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { asBuildingId, asContentId, asTileIndex } from '../../shared/ids';
import { CORE_STORAGE_SHED } from '../content/buildings';
import { stepSimulation, stepSimulationBy } from '../tick';
import { offerDayOf, offersForDay } from '../town/offers';
import { addItems, containerCount, createContainer } from '../world/container';
import { MAX_ACTIVE_CONTRACTS } from '../world/contracts';
import { FRIEND_AT, PILLAR_AT } from '../world/reputation';
import { createWorld, type World } from '../world/world';

import {
  acceptContract,
  deliverContract,
  validateAccept,
  validateDeliver,
} from './contract-commands';
import { CommandSource } from './types';

/** A world stepped one tick so snapshots exist; day 0's board is live. */
function freshWorld(): World {
  const world = createWorld(41);
  stepSimulation(world);
  return world;
}

/** Day 0's first offer for a world. */
function firstOffer(world: World) {
  const offer = offersForDay(world, offerDayOf(world, world.tick))[0];
  if (offer === undefined) throw new Error('no offer on the board');
  return offer;
}

/** Stocks the player inventory with enough to deliver `offer`. */
function stock(world: World, item: string, quantity: number): void {
  addItems(world.inventory, asContentId(item), quantity, 999);
}

describe('acceptContract (ADR-032 §2)', () => {
  it('freezes the derived terms verbatim', () => {
    const world = freshWorld();
    const offer = firstOffer(world);

    expect(acceptContract(world, offer.offerId).ok).toBe(true);

    const held = world.contracts.get(offer.offerId);
    expect(held).toEqual({
      offerId: offer.offerId,
      item: offer.item,
      quantity: offer.quantity,
      rewardCoins: offer.rewardCoins,
      deadlineTick: offer.deadlineTick,
      requester: offer.requester,
      acceptedTick: world.tick,
      fulfilledTick: null,
    });
  });

  it('refuses the same offer twice', () => {
    const world = freshWorld();
    const offer = firstOffer(world);

    expect(acceptContract(world, offer.offerId).ok).toBe(true);
    expect(validateAccept(world, offer.offerId).ok).toBe(false);
  });

  it('refuses an offer that is not on today’s board', () => {
    const world = freshWorld();
    // Yesterday cannot exist on day 0; tomorrow's board is not posted yet.
    const tomorrowFirst = offersForDay(world, 1)[0];
    expect(tomorrowFirst).toBeDefined();
    if (tomorrowFirst !== undefined) {
      expect(validateAccept(world, tomorrowFirst.offerId).ok).toBe(false);
    }
  });

  it('caps the docket at the limit', () => {
    const world = freshWorld();
    // Fill the store with synthetic contracts; the cap is about COUNT.
    for (let i = 0; i < MAX_ACTIVE_CONTRACTS; i += 1) {
      world.contracts.set(1_000 + i, {
        offerId: 1_000 + i,
        item: asContentId('core:turnip'),
        quantity: 5,
        rewardCoins: 75,
        deadlineTick: 999_999,
        requester: asContentId('core:resident_marla'),
        acceptedTick: 0,
        fulfilledTick: null,
      });
    }

    expect(validateAccept(world, firstOffer(world).offerId).ok).toBe(false);
  });

  it('gates the later slots by standing, and unlocks them as deliveries land (ADR-034 §2)', () => {
    const world = freshWorld();
    const board = offersForDay(world, offerDayOf(world, world.tick));
    const friendSlot = board[2];
    const pillarSlot = board[3];
    expect(friendSlot).toBeDefined();
    expect(pillarSlot).toBeDefined();
    if (friendSlot === undefined || pillarSlot === undefined) return;

    // A newcomer is refused both gated slots — the open board is slots 0–1.
    expect(validateAccept(world, friendSlot.offerId).ok).toBe(false);
    expect(validateAccept(world, pillarSlot.offerId).ok).toBe(false);

    // A Friend passes slot 2 but not the grand order.
    world.contractStats.fulfilled = FRIEND_AT;
    expect(validateAccept(world, friendSlot.offerId).ok).toBe(true);
    expect(validateAccept(world, pillarSlot.offerId).ok).toBe(false);

    // A Pillar passes every door.
    world.contractStats.fulfilled = PILLAR_AT;
    expect(validateAccept(world, pillarSlot.offerId).ok).toBe(true);
  });

  it('a fulfilled contract frees its docket slot (v9)', () => {
    const world = freshWorld();
    for (let i = 0; i < MAX_ACTIVE_CONTRACTS; i += 1) {
      world.contracts.set(1_000 + i, {
        offerId: 1_000 + i,
        item: asContentId('core:turnip'),
        quantity: 5,
        rewardCoins: 75,
        deadlineTick: 999_999,
        requester: asContentId('core:resident_marla'),
        acceptedTick: 0,
        // One delivered: it rides in the store but is no longer a promise.
        fulfilledTick: i === 0 ? 10 : null,
      });
    }

    expect(validateAccept(world, firstOffer(world).offerId).ok).toBe(true);
  });
});

describe('deliverContract (ADR-032 §5)', () => {
  it('drains the goods, pays the frozen reward, counts, and publishes', () => {
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);
    stock(world, offer.item, offer.quantity + 3);
    const coinsBefore = world.wallet.coins;

    let published = 0;
    world.events.subscribe('itemSold', () => {
      published += 1;
    });

    const deliveredAt = world.tick;
    expect(deliverContract(world, offer.offerId).ok).toBe(true);
    // Flush the bus directly rather than stepping: a full tick would also run
    // the quest step, whose first-delivery payout is its own suite's business.
    world.events.flush();

    expect(world.wallet.coins).toBe(coinsBefore + offer.rewardCoins);
    expect(containerCount(world.inventory, offer.item)).toBe(3);
    // v9: the record STAYS, marked — its presence is the re-acceptance guard.
    expect(world.contracts.get(offer.offerId)?.fulfilledTick).toBe(deliveredAt);
    expect(world.contractStats.fulfilled).toBe(1);
    expect(published).toBe(1);
  });

  it('a delivered offer cannot be accepted again — the live-caught exploit (v9)', () => {
    // The regression this whole link exists for: v8 deleted the record on
    // delivery, the offer reappeared as acceptable, and one good deal could
    // be looped all day at premium, bypassing the spot market's decay.
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);
    stock(world, offer.item, offer.quantity * 2);
    deliverContract(world, offer.offerId);

    expect(validateAccept(world, offer.offerId).ok).toBe(false);
    expect(acceptContract(world, offer.offerId).ok).toBe(false);
    // And it cannot be delivered twice either.
    expect(validateDeliver(world, offer.offerId).ok).toBe(false);
  });

  it('draws from sheds too — delivery reaches what selling reaches', () => {
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);

    // Split the goods: some carried, the rest in a shed a worker filled.
    const shedId = asBuildingId(world.ids.allocateBuilding());
    world.buildings.set(shedId, {
      id: shedId,
      tile: asTileIndex(2144),
      buildingId: CORE_STORAGE_SHED,
    });
    const shed = createContainer(50);
    world.buildingStorage.set(shedId, shed);
    stock(world, offer.item, 1);
    addItems(shed, offer.item, offer.quantity - 1, 999);

    expect(deliverContract(world, offer.offerId).ok).toBe(true);
    expect(containerCount(world.inventory, offer.item)).toBe(0);
    expect(containerCount(shed, offer.item)).toBe(0);
  });

  it('is all-or-nothing: one unit short delivers nothing', () => {
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);
    stock(world, offer.item, offer.quantity - 1);
    const coinsBefore = world.wallet.coins;

    expect(validateDeliver(world, offer.offerId).ok).toBe(false);
    expect(deliverContract(world, offer.offerId).ok).toBe(false);
    expect(world.wallet.coins).toBe(coinsBefore);
    expect(containerCount(world.inventory, offer.item)).toBe(offer.quantity - 1);
  });

  it('refuses a contract past its deadline', () => {
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);
    stock(world, offer.item, offer.quantity);

    world.tick = offer.deadlineTick; // at the stroke — already too late
    expect(validateDeliver(world, offer.offerId).ok).toBe(false);
  });
});

describe('the expiry sweep (ADR-032 §4)', () => {
  it('retires an overdue contract silently and counts it', () => {
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);
    const coinsBefore = world.wallet.coins;

    stepSimulationBy(world, offer.deadlineTick - world.tick + 1);

    expect(world.contracts.has(offer.offerId)).toBe(false);
    expect(world.contractStats.expired).toBe(1);
    // GENTLE: nothing else happened — no fee, no loss (VISION §2.2).
    expect(world.wallet.coins).toBe(coinsBefore);
  });

  it('handles an offline gap with no model: the first live tick sweeps', () => {
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);

    // The load boundary: catch-up advances the tick past the deadline
    // without running the sweep tick by tick.
    world.tick = offer.deadlineTick + 50_000;
    stepSimulation(world);

    expect(world.contracts.has(offer.offerId)).toBe(false);
    expect(world.contractStats.expired).toBe(1);
  });

  it('a delivery on the deadline day still wins — the sweep runs after commands', () => {
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);
    stock(world, offer.item, offer.quantity);

    // The last tick BEFORE the deadline: dispatch, then step once — the
    // command applies in preUpdate, the sweep in the economy phase after it.
    world.tick = offer.deadlineTick - 2;
    const result = world.commands.dispatch(
      { type: 'deliverContract', offerId: offer.offerId },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(true);
    stepSimulation(world);

    expect(world.contractStats.fulfilled).toBe(1);
    expect(world.contractStats.expired).toBe(0);
  });

  it('a fulfilled contract retires at its deadline without counting as missed (v9)', () => {
    const world = freshWorld();
    const offer = firstOffer(world);
    acceptContract(world, offer.offerId);
    stock(world, offer.item, offer.quantity);
    deliverContract(world, offer.offerId);

    stepSimulationBy(world, offer.deadlineTick - world.tick + 1);

    expect(world.contracts.has(offer.offerId)).toBe(false);
    expect(world.contractStats.fulfilled).toBe(1);
    expect(world.contractStats.expired).toBe(0);
  });
});
