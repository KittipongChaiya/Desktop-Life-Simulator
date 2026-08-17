/**
 * Contract commands. Phase-20 — ADR-032 §2, §5.
 *
 * `acceptContract` turns a derived offer into state: execution re-derives the
 * offer from its identity and freezes the RESOLVED terms into the store, so
 * no later rebalance can rewrite a promise. `deliverContract` is all-or-
 * nothing: the full quantity leaves (drawn from exactly what selling draws
 * from — inventory first, then sheds by id), the frozen reward lands, and the
 * fact publishes as the existing `itemSold` event so audio and number
 * feedback work unchanged (ADR-008 — no consumer-less event invented).
 *
 * Delivering does NOT touch the spot multiplier: goods sold to a named
 * neighbour never entered the open market (ADR-032 §3). The demand coupling
 * is phase-21's seam.
 */

import { appError, ErrorCode } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { offerById, offerDayOf } from '../town/offers';
import { containerCount, removeItems } from '../world/container';
import { MAX_ACTIVE_CONTRACTS } from '../world/contracts';
import { addCoins } from '../world/wallet';

import { heldForSale, sellableContainers } from './commerce-commands';
import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

/**
 * Checks an acceptance is legal. Rejects: an offer that is not on TODAY's
 * board (yesterday's offers left with yesterday), one already accepted, or a
 * full docket.
 */
export function validateAccept(world: CommandWorld, offerId: number): ValidationResult {
  if (world.contracts.has(offerId)) {
    return err(appError(ErrorCode.InvalidIntent, 'contract already accepted', { offerId }));
  }

  const offer = offerById(world, offerId);
  if (offer === undefined || offer.day !== offerDayOf(world, world.tick)) {
    return err(appError(ErrorCode.InvalidIntent, 'no such offer on today’s board', { offerId }));
  }

  if (world.contracts.size >= MAX_ACTIVE_CONTRACTS) {
    return err(
      appError(ErrorCode.InvalidIntent, 'too many contracts already accepted', {
        held: world.contracts.size,
        limit: MAX_ACTIVE_CONTRACTS,
      }),
    );
  }

  return ok();
}

/** Accepts an offer: re-derives its terms and freezes them (ADR-032 §2). */
export function acceptContract(world: CommandWorld, offerId: number): Result<void> {
  const validation = validateAccept(world, offerId);
  if (!validation.ok) return validation;

  const offer = offerById(world, offerId);
  if (offer === undefined) {
    // Unreachable — validated above; handled over asserted (CODE_STYLE §1.2).
    return err(appError(ErrorCode.InvalidIntent, 'no such offer', { offerId }));
  }

  world.contracts.set(offerId, {
    offerId,
    item: offer.item,
    quantity: offer.quantity,
    rewardCoins: offer.rewardCoins,
    deadlineTick: offer.deadlineTick,
    requester: offer.requester,
    acceptedTick: world.tick,
  });
  return ok();
}

/**
 * Checks a delivery is legal. Rejects: no such accepted contract, a passed
 * deadline (the sweep will retire it this tick or the next), or fewer goods
 * than the full quantity — deliveries are all-or-nothing, like every
 * transfer (ADR-011).
 */
export function validateDeliver(world: CommandWorld, offerId: number): ValidationResult {
  const contract = world.contracts.get(offerId);
  if (contract === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such accepted contract', { offerId }));
  }

  if (world.tick >= contract.deadlineTick) {
    return err(appError(ErrorCode.InvalidIntent, 'the contract has expired', { offerId }));
  }

  const held = heldForSale(world, contract.item);
  if (held < contract.quantity) {
    return err(
      appError(ErrorCode.MissingItem, 'not enough held to deliver', {
        item: contract.item,
        quantity: contract.quantity,
        held,
      }),
    );
  }

  return ok();
}

/** Delivers in full: goods out, the frozen reward in, the fact published. */
export function deliverContract(world: CommandWorld, offerId: number): Result<void> {
  const validation = validateDeliver(world, offerId);
  if (!validation.ok) return validation;

  const contract = world.contracts.get(offerId);
  if (contract === undefined) {
    // Unreachable — validated above.
    return err(appError(ErrorCode.InvalidIntent, 'no such accepted contract', { offerId }));
  }

  // Drain in selling's order (ADR-032 §5): inventory, then sheds by id. The
  // total was validated, so this takes exactly `quantity`.
  let remaining = contract.quantity;
  for (const container of sellableContainers(world)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, containerCount(container, contract.item));
    if (take <= 0) continue;
    remaining -= removeItems(container, contract.item, take).removed;
  }

  const credit = addCoins(world.wallet, contract.rewardCoins);
  if (!credit.ok) return credit; // unreachable — the reward is a frozen non-negative integer

  world.contracts.delete(offerId);
  world.contractStats.fulfilled += 1;
  world.events.publish('itemSold', {
    item: contract.item,
    quantity: contract.quantity,
    coins: contract.rewardCoins,
    automatic: false,
  });
  return ok();
}

/** Parses a raw offer id (untrusted input, ADR-010 §5). */
function toOfferId(offerId: number): Result<number> {
  if (!Number.isSafeInteger(offerId) || offerId < 0) {
    return err(appError(ErrorCode.InvalidIntent, 'malformed offer id', { offerId }));
  }
  return ok(offerId);
}

export function registerContractCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('acceptContract', {
    validate: (world, command) => {
      const offerId = toOfferId(command.offerId);
      return offerId.ok ? validateAccept(world, offerId.value) : offerId;
    },
    execute: (context, command) => {
      const offerId = toOfferId(command.offerId);
      return offerId.ok ? acceptContract(context.world, offerId.value) : offerId;
    },
  });

  dispatcher.register('deliverContract', {
    validate: (world, command) => {
      const offerId = toOfferId(command.offerId);
      return offerId.ok ? validateDeliver(world, offerId.value) : offerId;
    },
    execute: (context, command) => {
      const offerId = toOfferId(command.offerId);
      return offerId.ok ? deliverContract(context.world, offerId.value) : offerId;
    },
  });
}
