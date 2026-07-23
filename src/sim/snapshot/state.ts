/**
 * Versioned slice storage.
 *
 * The simulation writes here; views read. Sim never calls out to a subscriber —
 * that would let view code run inside the tick and break both purity and
 * determinism. Instead each slice carries a monotonic version, and the renderer
 * polls versions per frame (ADR-005 §2).
 */

import { buildingsEqual, projectBuildings, type BuildingView } from './buildings-slice';
import {
  economyEquals,
  projectEconomy,
  projectWallet,
  walletEquals,
  type EconomyView,
  type WalletView,
} from './economy-slice';
import { inventoryEqual, projectInventory, type InventoryView } from './inventory-slice';
import { projectStatus, statusEquals, type SliceMap, type StatusSlice } from './slices';
import { projectWorkers, workersEqual, type WorkerView } from './workers-slice';

export interface VersionedSlice<T> {
  /** Bumped only when `value` actually changes. Never decreases. */
  version: number;
  value: T;
}

export interface SnapshotState {
  readonly status: VersionedSlice<StatusSlice>;
  readonly workers: VersionedSlice<readonly WorkerView[]>;
  readonly buildings: VersionedSlice<readonly BuildingView[]>;
  readonly inventory: VersionedSlice<InventoryView>;
  readonly wallet: VersionedSlice<WalletView>;
  readonly economy: VersionedSlice<EconomyView>;
}

export function createSnapshotState(): SnapshotState {
  return {
    status: { version: 0, value: projectStatus(0) },
    // A world begins with no workers or buildings; the slices fill as they appear.
    workers: { version: 0, value: [] },
    buildings: { version: 0, value: [] },
    // Corrected to the real capacity on the first tick's projection.
    inventory: { version: 0, value: { stacks: [], capacity: 0, usedSlots: 0 } },
    // Corrected to the real balance and price list on the first tick.
    wallet: { version: 0, value: { coins: 0 } },
    economy: { version: 0, value: { prices: [], expansionsPurchased: 0, nextExpansionCost: null } },
  };
}

/**
 * Replaces a slice's value only if it changed, bumping the version if so.
 *
 * @returns true if the slice was republished.
 */
export function publishIfChanged<T>(
  slice: VersionedSlice<T>,
  next: T,
  equals: (a: T, b: T) => boolean,
): boolean {
  if (equals(slice.value, next)) return false;

  slice.value = next;
  slice.version += 1;
  return true;
}

/** Current version of every slice. Used by the renderer to detect changes. */
export function sliceVersions(state: SnapshotState): Record<keyof SliceMap, number> {
  return {
    status: state.status.version,
    workers: state.workers.version,
    buildings: state.buildings.version,
    inventory: state.inventory.version,
    wallet: state.wallet.version,
    economy: state.economy.version,
  };
}

export {
  statusEquals,
  projectStatus,
  workersEqual,
  projectWorkers,
  buildingsEqual,
  projectBuildings,
  inventoryEqual,
  projectInventory,
  walletEquals,
  projectWallet,
  economyEquals,
  projectEconomy,
};
