/**
 * Publishes changed snapshot slices to views.
 *
 * Runs LAST in the tick (ADR-007 §4) so views only ever observe fully settled
 * state, never a half-stepped world.
 */

import {
  buildingsEqual,
  economyEquals,
  inventoryEqual,
  projectBuildings,
  projectEconomy,
  projectInventory,
  projectStatus,
  projectWallet,
  projectWorkers,
  publishIfChanged,
  statusEquals,
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
  // Inventory republishes only when the player's aggregated holdings change (crit 17).
  publishIfChanged(world.snapshots.inventory, projectInventory(world), inventoryEqual);
  // Coins republish on change only; prices only when an INTEGER price moves —
  // never per recovery period, let alone per tick (crit 16).
  publishIfChanged(world.snapshots.wallet, projectWallet(world), walletEquals);
  publishIfChanged(world.snapshots.economy, projectEconomy(world), economyEquals);
}
