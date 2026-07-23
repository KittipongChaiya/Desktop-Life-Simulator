/**
 * The economy system. Phase-06, GAME_DESIGN.md §6.2, ADR-013.
 *
 * Runs in the `economy` phase, after workers act and before events flush
 * (ADR-007 §4 — order is data, declared in `systems/index.ts`).
 *
 * v0.1 scope: price recovery. Every 20 ticks each depressed multiplier climbs
 * 0.005 toward 1.00. The boundary is `tick % 20 === 0` — derived from the tick
 * counter, never a private timer — so phase-07's offline catchUp can reproduce
 * any absence exactly from elapsed ticks (ADR-009's pattern, ADR-013 §offline).
 *
 * Tick 0 is excluded: a world begins there, nothing can have been sold yet,
 * and treating creation as a recovery period would make the first real period
 * shorter than the other nineteen.
 *
 * Phase-06c adds the market stall sweep here.
 */

import { RECOVERY_PERIOD_TICKS, recoverAll } from '../world/economy';
import type { World } from '../world/world';

export function economySystem(world: World): void {
  if (world.tick === 0 || world.tick % RECOVERY_PERIOD_TICKS !== 0) return;
  recoverAll(world.economy);
}
