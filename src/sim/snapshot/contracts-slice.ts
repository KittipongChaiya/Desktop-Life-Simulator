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
import { QUEST_CHAINS } from '../content/quests';
import { RESIDENTS } from '../content/residents';
import { offerDayOf, offersForDay, requiredStandingFor } from '../town/offers';
import { MAX_ACTIVE_CONTRACTS, openContracts } from '../world/contracts';
import { counterValue, stepsPaid } from '../world/quests';
import { nextStandingAt, standingAtLeast, standingOf, type Standing } from '../world/reputation';

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
  /** The tier this slot asks for (ADR-034 §2). */
  readonly requiredStanding: Standing;
  /** True while the player's standing is below the slot's ask. */
  readonly locked: boolean;
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

/** One quest chain's live line (ADR-034 §4). */
export interface QuestChainView {
  readonly id: string;
  readonly displayName: string;
  /** The current step's ask, or null once the chain is complete. */
  readonly objective: string | null;
  /** Counter progress toward the current threshold, capped at it. */
  readonly progress: number;
  readonly threshold: number | null;
  readonly rewardCoins: number | null;
  readonly stepsDone: number;
  readonly stepsTotal: number;
}

export interface ContractsSlice {
  readonly offers: readonly OfferView[];
  readonly active: readonly ContractView[];
  /** Every chain, in content order — complete ones stay as receipts. */
  readonly questChains: readonly QuestChainView[];
  /** True when the docket is full — every Accept button disables at once. */
  readonly docketFull: boolean;
  readonly fulfilled: number;
  readonly expired: number;
  /** The player's name in town — derived, never stored (ADR-034 §1). */
  readonly standing: Standing;
  /** Deliveries the next tier asks for, or null at the top. */
  readonly nextStandingAt: number | null;
}

const requesterName = (id: string): string =>
  RESIDENTS.find((resident) => resident.id === id)?.displayName ?? 'a neighbour';

export function projectContracts(world: CommandWorld): ContractsSlice {
  const itemName = (id: string): string => {
    const definition = world.itemRegistry.get(id as never);
    return definition.ok ? definition.value.displayName : id;
  };
  const dueDay = (deadlineTick: number): number => Math.floor(deadlineTick / world.ticksPerDay) + 1;

  const standing = standingOf(world.contractStats);
  const offers = offersForDay(world, offerDayOf(world, world.tick)).map((offer) => {
    const requiredStanding = requiredStandingFor(offer.offerId);
    return {
      offerId: offer.offerId,
      item: offer.item,
      itemName: itemName(offer.item),
      quantity: offer.quantity,
      rewardCoins: offer.rewardCoins,
      dueDay: dueDay(offer.deadlineTick),
      requesterName: requesterName(offer.requester),
      accepted: world.contracts.has(offer.offerId),
      requiredStanding,
      locked: !standingAtLeast(standing, requiredStanding),
    };
  });

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

  const questChains = QUEST_CHAINS.map((chain): QuestChainView => {
    const stepsDone = stepsPaid(world.quests, chain.id);
    const current = chain.steps[stepsDone];
    const value = counterValue(world.contractStats, chain.counter);
    return {
      id: chain.id,
      displayName: chain.displayName,
      objective: current?.objective ?? null,
      progress: current === undefined ? value : Math.min(value, current.threshold),
      threshold: current?.threshold ?? null,
      rewardCoins: current?.rewardCoins ?? null,
      stepsDone,
      stepsTotal: chain.steps.length,
    };
  });

  return {
    offers,
    active,
    questChains,
    // OPEN contracts, matching the validator: a delivered receipt riding to
    // its deadline must not read as a full docket (the v9 rule, both ends).
    docketFull: openContracts(world.contracts) >= MAX_ACTIVE_CONTRACTS,
    fulfilled: world.contractStats.fulfilled,
    expired: world.contractStats.expired,
    standing,
    nextStandingAt: nextStandingAt(world.contractStats),
  };
}

export function contractsEqual(a: ContractsSlice, b: ContractsSlice): boolean {
  if (
    a.fulfilled !== b.fulfilled ||
    a.expired !== b.expired ||
    a.docketFull !== b.docketFull ||
    a.standing !== b.standing ||
    a.nextStandingAt !== b.nextStandingAt ||
    a.offers.length !== b.offers.length ||
    a.active.length !== b.active.length ||
    a.questChains.length !== b.questChains.length
  ) {
    return false;
  }
  // Chains are content-fixed in count and order; what moves is progress.
  for (const [i, chain] of a.questChains.entries()) {
    const other = b.questChains[i];
    if (
      other === undefined ||
      chain.id !== other.id ||
      chain.stepsDone !== other.stepsDone ||
      chain.progress !== other.progress
    ) {
      return false;
    }
  }
  for (const [i, offer] of a.offers.entries()) {
    const other = b.offers[i];
    if (
      other === undefined ||
      offer.offerId !== other.offerId ||
      offer.accepted !== other.accepted ||
      offer.locked !== other.locked
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
