/**
 * Sending a worker away, and bringing them back. Phase-28 — ADR-038, ADR-011 §4.
 *
 * Two commands, and the asymmetry between them is the design:
 *
 * - **Sending is the player's decision.** It costs supplies (a declared sink),
 *   takes a hand off the farm for a long time, and is refused for every reason
 *   below rather than half-applied.
 * - **Returning is not a decision at all.** It happens because a tick passed,
 *   so it is issued by `expeditionSystem` — but it still goes through a command
 *   (ADR-010 §6), because a system has no privileged write path either.
 *
 * **THERE IS NO RECALL.** Supplies are consumed at departure and never
 * refunded, so a cancellable expedition would be a free option on an outcome
 * the hash has already decided (ADR-038 §5). A player who changes their mind
 * waits, exactly as they would for a crop.
 */

import { appError, ErrorCode } from '../../shared/errors';
import { asContentId, isContentId, type ContentId, type WorkerId } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { haulFor, returnTickOf } from '../content/expeditions';
import { addItems, containerCount, containerTotal, removeItems } from '../world/container';
import { standingAtLeast, standingOf } from '../world/reputation';
import { WorkerState } from '../world/worker';

import { heldForSale, sellableContainers } from './commerce-commands';
import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

/** Checks this worker may be sent to this destination right now. */
export function validateSendExpedition(
  world: CommandWorld,
  worker: WorkerId,
  destinationId: ContentId,
): ValidationResult {
  const traveller = world.workers.get(worker);
  if (traveller === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such worker', { worker }));
  }

  const found = world.expeditionRegistry.get(destinationId);
  if (!found.ok) {
    return err(
      appError(ErrorCode.InvalidIntent, 'no such destination', { destination: destinationId }),
    );
  }
  const destination = found.value;

  if (world.expeditions.has(worker)) {
    return err(appError(ErrorCode.InvalidIntent, 'this worker is already away', { worker }));
  }

  // A worker part-way through a route is carrying a DELIVERY, not a harvest
  // (ADR-036 as amended): its task is the reservation, and sending it away
  // would strand goods the destination is already counting on.
  if (traveller.hauling !== null) {
    return err(
      appError(ErrorCode.InvalidIntent, 'this worker is part-way through a haul', { worker }),
    );
  }

  // LEAVES EMPTY-HANDED, and the rule earns its keep on the way back. The haul
  // lands in this hold, and `isReachableDestination` guarantees the biggest
  // possible one fits an EMPTY hold — a worker who set off carrying would break
  // that guarantee and force the return to discard the remainder, which
  // ADR-011 §7 forbids. It is also the legible rule: you drop off, then you go.
  if (containerTotal(traveller.carrying) > 0) {
    return err(
      appError(ErrorCode.InvalidIntent, 'this worker is still carrying something', { worker }),
    );
  }

  // Standing gates the map, enforced here rather than in the panel — the same
  // place ADR-034 §3 gates a locked board slot, and for the same reason: a UI
  // check is a hint, and a command check is the rule.
  if (!standingAtLeast(standingOf(world.contractStats), destination.requires)) {
    return err(
      appError(ErrorCode.InvalidIntent, 'the town does not vouch for you there yet', {
        destination: destinationId,
        requires: destination.requires,
      }),
    );
  }

  // All-or-nothing, the rule a craft and a gather both follow: every supply
  // must be present, or none is taken.
  //
  // ACROSS INVENTORY AND SHEDS, through the helper selling and contract
  // delivery both use. Checking `world.inventory` alone was the first version
  // and it is the phase-06 defect exactly, one system later: a player who had
  // built a shed — which the game encourages — would find Send silently
  // refused, because their seed had been tidied away. One definition of "what
  // the farm holds" or the three channels drift apart.
  for (const stack of destination.supplies) {
    if (heldForSale(world, stack.item) < stack.quantity) {
      return err(
        appError(ErrorCode.MissingItem, 'not enough supplies to outfit the trip', {
          destination: destinationId,
          item: stack.item,
        }),
      );
    }
  }

  return ok();
}

/** Sends the worker: supplies leave the farm, the worker leaves the grid. */
export function sendExpedition(
  world: CommandWorld,
  worker: WorkerId,
  destinationId: ContentId,
): Result<void> {
  const validation = validateSendExpedition(world, worker, destinationId);
  if (!validation.ok) return validation;

  const traveller = world.workers.get(worker);
  const found = world.expeditionRegistry.get(destinationId);
  if (traveller === undefined || !found.ok) {
    // Unreachable — validated above; handled over asserted (`CODE_STYLE.md` §1.2).
    return err(appError(ErrorCode.InvalidIntent, 'no such worker or destination', { worker }));
  }

  // Drained the same way a sale and a contract delivery drain: the player's
  // own inventory first, then sheds in id order (deterministic).
  for (const stack of found.value.supplies) {
    let remaining = stack.quantity;
    for (const container of sellableContainers(world)) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, containerCount(container, stack.item));
      if (take <= 0) continue;
      remaining -= removeItems(container, stack.item, take).removed;
    }
  }

  // Off the grid (ADR-038 §2). The task and path go with them: a claim held by
  // someone who is not here would block a tile for hours.
  traveller.state = WorkerState.Away;
  traveller.task = null;
  traveller.path = [];
  traveller.pathCursor = 0;
  traveller.actionProgress = 0;

  world.expeditions.set(worker, {
    worker,
    destination: destinationId,
    departedTick: world.tick,
  });
  return ok();
}

/**
 * Brings a worker home with their haul.
 *
 * Refused before the return tick, so a caller cannot shorten a trip — the
 * system is the only thing that should ever issue this, and the check is what
 * makes that true rather than merely intended.
 */
export function returnExpedition(world: CommandWorld, worker: WorkerId): Result<void> {
  const trip = world.expeditions.get(worker);
  if (trip === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'this worker is not away', { worker }));
  }

  const traveller = world.workers.get(worker);
  const found = world.expeditionRegistry.get(trip.destination);
  if (traveller === undefined || !found.ok) {
    // A worker or a destination that vanished under a running trip — an
    // uninstalled content pack (SAVE_FORMAT.md §5.3). Drop the trip rather
    // than stranding the hand for ever.
    world.expeditions.delete(worker);
    if (traveller !== undefined) traveller.state = WorkerState.Idle;
    return ok();
  }

  if (world.tick < returnTickOf(found.value, trip.departedTick)) {
    return err(appError(ErrorCode.InvalidIntent, 'this worker is still travelling', { worker }));
  }

  // The haul enters the world HERE — a declared source (ADR-011 §4) — in the
  // worker's own hold, exactly as a crop harvest and a gather do. It reaches
  // storage through the deposit path that already exists, so nothing new
  // touches conservation.
  for (const stack of haulFor(found.value, world.seed, worker, trip.departedTick)) {
    const definition = world.itemRegistry.get(stack.item);
    const stackSize = definition.ok ? definition.value.stackSize : 1;
    addItems(traveller.carrying, stack.item, stack.quantity, stackSize);
  }

  traveller.state = WorkerState.Idle;
  // Replan immediately: a hand that just walked back in should not wait out an
  // idle cadence before doing anything.
  traveller.replanTick = world.tick;
  world.expeditions.delete(worker);
  return ok();
}

/**
 * Parses a raw destination field (untrusted input, ADR-010 §5).
 *
 * `asContentId` THROWS on a malformed id, and the first version of the
 * registration below called it directly — so a command carrying
 * `"not-a-content-id"` crashed inside the dispatcher instead of being refused.
 * Every source is untrusted here, not just the player's: a replay, the
 * developer console, and a plugin all arrive through this door.
 *
 * Found by the RC's coverage gate going red and the rejection test written to
 * close it, which is the second time a branch nobody had exercised turned out
 * to be a defect rather than dead weight.
 */
function toDestination(destination: unknown): Result<ContentId> {
  if (typeof destination !== 'string' || !isContentId(destination)) {
    return err(
      appError(ErrorCode.UnknownContent, 'malformed destination id', {
        destination: String(destination),
      }),
    );
  }
  return ok(asContentId(destination));
}

export function registerExpeditionCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('sendExpedition', {
    validate: (world, command) => {
      const destination = toDestination(command.destination);
      return destination.ok
        ? validateSendExpedition(world, command.worker as WorkerId, destination.value)
        : destination;
    },
    execute: (context, command) => {
      const destination = toDestination(command.destination);
      return destination.ok
        ? sendExpedition(context.world, command.worker as WorkerId, destination.value)
        : destination;
    },
  });

  dispatcher.register('returnExpedition', {
    validate: (world, command) => {
      const worker = command.worker as WorkerId;
      return world.expeditions.has(worker)
        ? ok()
        : err(appError(ErrorCode.InvalidIntent, 'this worker is not away', { worker }));
    },
    execute: (context, command) => returnExpedition(context.world, command.worker as WorkerId),
  });
}
