/**
 * Bringing workers home. Phase-28 — ADR-038 §7.
 *
 * One comparison per expedition per tick, over a table bounded by the worker
 * count. There is nothing to advance: a trip has no progress field, because
 * `departedTick` plus the destination's `travelTicks` already says when it
 * ends. A countdown would be an accumulator where a recorded fact does the job
 * (ADR-009 §1), and it would have to be caught up after an absence — the exact
 * work this model exists to avoid.
 *
 * **The return is dispatched as a COMMAND, not applied here.** A system has no
 * privileged write path (ADR-010 §6), and the alternative — mutating the worker
 * and the hold directly because "it is only the engine" — is how a second write
 * path gets built one convenience at a time.
 *
 * It runs in the WORKERS phase, before `workerSystem`: a hand who lands this
 * tick should be given work on this tick rather than standing in the yard for
 * one. Commands dispatched here apply at the start of the next tick
 * (ADR-010 §3), so the returning worker is back in the pipeline immediately
 * after — and `returnExpedition` stamps `replanTick` so nothing makes them wait
 * out an idle cadence on top of that.
 */

import { CommandSource } from '../commands/types';
import { returnTickOf } from '../content/expeditions';
import { expeditionsInOrder } from '../world/expedition';
import type { World } from '../world/world';

export function expeditionSystem(world: World): void {
  // Ascending worker order — deterministic, and the same rule every keyed
  // collection in this project scans by (ADR-007 §4).
  for (const trip of expeditionsInOrder(world.expeditions)) {
    const destination = world.expeditionRegistry.get(trip.destination);
    // A destination that vanished under a running trip (an uninstalled content
    // pack) is handled by the command, which brings the worker home
    // empty-handed rather than stranding them for ever.
    if (destination.ok && world.tick < returnTickOf(destination.value, trip.departedTick)) {
      continue;
    }

    world.commands.dispatch(
      { type: 'returnExpedition', worker: trip.worker },
      { source: CommandSource.Worker },
    );
  }
}
