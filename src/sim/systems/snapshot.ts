/**
 * Publishes changed snapshot slices to views.
 *
 * Runs LAST in the tick (ADR-007 §4) so views only ever observe fully settled
 * state, never a half-stepped world.
 */

import {
  buildingsEqual,
  cropsEqual,
  economyEquals,
  inventoryEqual,
  projectBuildings,
  projectCrops,
  projectEconomy,
  projectInventory,
  projectResidents,
  projectStatus,
  projectWallet,
  projectWorkers,
  projectTime,
  publishIfChanged,
  residentsEqual,
  statusEquals,
  timeEquals,
  walletEquals,
  workersEqual,
} from '../snapshot/state';
import type { World } from '../world/world';

export function snapshotSystem(world: World): void {
  publishIfChanged(world.snapshots.status, projectStatus(world.tick), statusEquals);
  // Republishes whenever a worker visibly changes — every tick while one is
  // moving (its position genuinely changes), and never when all are idle.
  publishIfChanged(world.snapshots.workers, projectWorkers(world), workersEqual);
  // Buildings change only on placement, so this republishes rarely.
  publishIfChanged(world.snapshots.buildings, projectBuildings(world), buildingsEqual);
  // Crops grow every tick but LOOK different only four times in a life, and the
  // projection carries the stage sprite rather than the elapsed time — so this
  // republishes on a stage change, never per tick (ADR-005 §2).
  publishIfChanged(world.snapshots.crops, projectCrops(world), cropsEqual);
  // Inventory republishes only when the player's aggregated holdings change (crit 17).
  publishIfChanged(world.snapshots.inventory, projectInventory(world), inventoryEqual);
  // Coins republish on change only; prices only when an INTEGER price moves —
  // never per recovery period, let alone per tick (crit 16).
  publishIfChanged(world.snapshots.wallet, projectWallet(world), walletEquals);
  publishIfChanged(world.snapshots.economy, projectEconomy(world), economyEquals);
  // The calendar is DERIVED from the tick, so this projects on every tick and
  // republishes on four of them per day — once per phase boundary (ADR-020 §3).
  publishIfChanged(world.snapshots.time, projectTime(world), timeEquals);
  // Residents are derived too (ADR-031): republishes every tick while someone
  // walks, on dwell boundaries otherwise, and never while the town sleeps —
  // the night slice is empty and empty equals empty.
  publishIfChanged(world.snapshots.residents, projectResidents(world), residentsEqual);
}
