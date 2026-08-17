/**
 * Contracts snapshot projection. Phase-20 — ADR-032 §1, §6.
 *
 * The board as the player sees it: today's derived offers (flagged when
 * already accepted), the active docket with LIVE held counts so "12 / 40"
 * reads without opening the inventory, and the two §6 counters.
 *
 * Republish cadence: the offers half changes once per day; the docket half
 * changes on accept/deliver/expire and whenever the held count of a
 * contracted item moves — which is exactly when the panel's numbers change,
 * so every republish is a visible change (ADR-005 §2).
 */

import { heldForSale } from '../commands/commerce-commands';
import type { CommandWorld } from '../commands/types';
import { RESIDENTS } from '../content/residents';
import { offerDayOf, offersForDay } from '../town/offers';
import { MAX_ACTIVE_CONTRACTS } from '../world/contracts';

/** One board offer, projected. */
export interface OfferView {
  readonly offerId: number;
  readonly item: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly rewardCoins: number;
  /** Display day (1-based, matching the status bar) the deal is due by. */
  readonly dueDay: number;
  readonly requesterName: string;
  readonly accepted: boolean;
}

/** One accepted contract, projected with its live progress. */
export interface ContractView {
  readonly offerId: number;
  readonly item: string;
  readonly itemName: string;
  readonly quantity: number;
  /** Units currently held across inventory and sheds — the progress readout. */
  readonly held: number;
  readonly rewardCoins: number;
  readonly dueDay: number;
  readonly requesterName: string;
  /** Delivered (v9): the row shows a receipt, never a Deliver button. */
  readonly fulfilled: boolean;
}

export interface ContractsSlice {
  readonly offers: readonly OfferView[];
  readonly active: readonly ContractView[];
  /** True when the docket is full — every Accept button disables at once. */
  readonly docketFull: boolean;
  readonly fulfilled: number;
  readonly expired: number;
}

const requesterName = (id: string): string =>
  RESIDENTS.find((resident) => resident.id === id)?.displayName ?? 'a neighbour';

export function projectContracts(world: CommandWorld): ContractsSlice {
  const itemName = (id: string): string => {
    const definition = world.itemRegistry.get(id as never);
    return definition.ok ? definition.value.displayName : id;
  };
  const dueDay = (deadlineTick: number): number => Math.floor(deadlineTick / world.ticksPerDay) + 1;

  const offers = offersForDay(world, offerDayOf(world, world.tick)).map((offer) => ({
    offerId: offer.offerId,
    item: offer.item,
    itemName: itemName(offer.item),
    quantity: offer.quantity,
    rewardCoins: offer.rewardCoins,
    dueDay: dueDay(offer.deadlineTick),
    requesterName: requesterName(offer.requester),
    accepted: world.contracts.has(offer.offerId),
  }));

  const active = [...world.contracts.values()]
    .sort((a, b) => a.offerId - b.offerId)
    .map((contract) => ({
      offerId: contract.offerId,
      item: contract.item,
      itemName: itemName(contract.item),
      quantity: contract.quantity,
      // A delivered contract's progress is settled; live counting it would
      // republish the slice for goods that no longer matter to it.
      held:
        contract.fulfilledTick !== null
          ? contract.quantity
          : Math.min(contract.quantity, heldForSale(world, contract.item)),
      rewardCoins: contract.rewardCoins,
      dueDay: dueDay(contract.deadlineTick),
      requesterName: requesterName(contract.requester),
      fulfilled: contract.fulfilledTick !== null,
    }));

  return {
    offers,
    active,
    docketFull: world.contracts.size >= MAX_ACTIVE_CONTRACTS,
    fulfilled: world.contractStats.fulfilled,
    expired: world.contractStats.expired,
  };
}

export function contractsEqual(a: ContractsSlice, b: ContractsSlice): boolean {
  if (
    a.fulfilled !== b.fulfilled ||
    a.expired !== b.expired ||
    a.docketFull !== b.docketFull ||
    a.offers.length !== b.offers.length ||
    a.active.length !== b.active.length
  ) {
    return false;
  }
  for (const [i, offer] of a.offers.entries()) {
    const other = b.offers[i];
    if (
      other === undefined ||
      offer.offerId !== other.offerId ||
      offer.accepted !== other.accepted
    ) {
      return false;
    }
  }
  for (const [i, contract] of a.active.entries()) {
    const other = b.active[i];
    if (
      other === undefined ||
      contract.offerId !== other.offerId ||
      contract.held !== other.held ||
      contract.fulfilled !== other.fulfilled
    ) {
      return false;
    }
  }
  return true;
}
