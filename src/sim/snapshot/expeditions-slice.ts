/**
 * Expedition snapshot projection. Phase-28 — ADR-005 §2, ADR-038 §3.
 *
 * What the map panel reads: which destinations exist, whether standing has
 * opened them, and who is out where.
 *
 * ## The slice carries no countdown, and that is the whole discipline
 *
 * A trip's remaining time changes every tick, so projecting it would republish
 * this slice 20 times a second for as long as anyone was away — hours, on a
 * mechanic designed to run for hours. That is the exact defect ADR-005 §2
 * names, and it is the third time this version has had to refuse the tempting
 * field (crop growth, node regrowth, and now travel).
 *
 * The panel is handed `departedTick` and `travelTicks` instead and does the
 * subtraction itself against the tick it is already re-rendering on. A
 * countdown belongs to whoever is already changing every frame; the simulation
 * is not.
 *
 * `unlocked` is projected rather than left to the UI because it is a RULE — the
 * command enforces the same gate (ADR-038 §6), and a panel that computed its
 * own answer would be a second place the requirement is decided.
 */

import type { ContentId } from '../../shared/ids';
import type { ExpeditionRegistry } from '../content/expeditions';
import type { ItemStack } from '../world/container';
import type { ContractStats } from '../world/contracts';
import type { ExpeditionStore } from '../world/expedition';
import { standingAtLeast, standingOf } from '../world/reputation';

/** One destination, projected for the map panel. */
export interface DestinationView {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly sprite: string;
  readonly travelTicks: number;
  readonly supplies: readonly { readonly item: string; readonly quantity: number }[];
  readonly yields: readonly { readonly item: string; readonly quantity: number }[];
  /** Standing this asks for — shown on a locked row, so progression reads. */
  readonly requires: string;
  /** Whether the town vouches for you there yet. The command decides the same. */
  readonly unlocked: boolean;
}

/** One worker currently away. No countdown — see the module header. */
export interface TripView {
  readonly worker: number;
  readonly destination: string;
  readonly departedTick: number;
  readonly returnsAtTick: number;
}

export interface ExpeditionsSlice {
  readonly destinations: readonly DestinationView[];
  readonly trips: readonly TripView[];
}

export interface ExpeditionProjectionSource {
  readonly expeditionRegistry: ExpeditionRegistry;
  readonly expeditions: ExpeditionStore;
  readonly contractStats: ContractStats;
}

const stacks = (
  list: readonly ItemStack[],
): readonly { readonly item: string; readonly quantity: number }[] =>
  list.map((stack) => ({ item: stack.item, quantity: stack.quantity }));

export function projectExpeditions(source: ExpeditionProjectionSource): ExpeditionsSlice {
  const standing = standingOf(source.contractStats);

  const destinations = source.expeditionRegistry.all().map((destination) => ({
    id: destination.id,
    displayName: destination.displayName,
    description: destination.description,
    sprite: destination.sprite,
    travelTicks: destination.travelTicks,
    supplies: stacks(destination.supplies),
    yields: stacks(destination.yields),
    requires: destination.requires,
    unlocked: standingAtLeast(standing, destination.requires),
  }));

  // Ascending worker order, so two identical states reached by sending workers
  // in a different order compare equal and do not republish for nothing.
  const trips = [...source.expeditions.values()]
    .sort((a, b) => a.worker - b.worker)
    .map((trip) => ({
      worker: trip.worker,
      destination: trip.destination,
      departedTick: trip.departedTick,
      returnsAtTick: returnsAt(source, trip.destination, trip.departedTick),
    }));

  return { destinations, trips };
}

function returnsAt(
  source: ExpeditionProjectionSource,
  destination: ContentId,
  departedTick: number,
): number {
  const found = source.expeditionRegistry.get(destination);
  // A destination that vanished under a running trip: the system brings the
  // worker home on the next tick, so "returns now" is the honest answer.
  return found.ok ? departedTick + found.value.travelTicks : departedTick;
}

/** Change test — republishes on a real change only. */
export function expeditionsEqual(a: ExpeditionsSlice, b: ExpeditionsSlice): boolean {
  if (a.trips.length !== b.trips.length) return false;
  if (a.destinations.length !== b.destinations.length) return false;

  for (let i = 0; i < a.trips.length; i += 1) {
    const x = a.trips[i];
    const y = b.trips[i];
    if (x === undefined || y === undefined) return false;
    if (x.worker !== y.worker || x.destination !== y.destination) return false;
    if (x.departedTick !== y.departedTick) return false;
  }

  // Destinations are content and never change within a session — EXCEPT
  // `unlocked`, which moves when standing does. Comparing that one field is
  // what makes the third slot open without a reload (the phase-22 lesson).
  for (let i = 0; i < a.destinations.length; i += 1) {
    if (a.destinations[i]?.unlocked !== b.destinations[i]?.unlocked) return false;
    if (a.destinations[i]?.id !== b.destinations[i]?.id) return false;
  }

  return true;
}
