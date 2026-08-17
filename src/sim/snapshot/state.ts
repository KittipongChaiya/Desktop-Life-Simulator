/**
 * Versioned slice storage.
 *
 * The simulation writes here; views read. Sim never calls out to a subscriber —
 * that would let view code run inside the tick and break both purity and
 * determinism. Instead each slice carries a monotonic version, and the renderer
 * polls versions per frame (ADR-005 §2).
 */

import {
  DEFAULT_DAYS_PER_SEASON,
  DEFAULT_TICKS_PER_DAY,
  DEFAULT_TICKS_PER_WEATHER_PERIOD,
} from '../../shared/constants';

import { buildingsEqual, projectBuildings, type BuildingView } from './buildings-slice';
import { contractsEqual, projectContracts, type ContractsSlice } from './contracts-slice';
import { cropsEqual, projectCrops, type CropView } from './crops-slice';
import {
  economyEquals,
  projectEconomy,
  projectWallet,
  walletEquals,
  type EconomyView,
  type WalletView,
} from './economy-slice';
import { inventoryEqual, projectInventory, type InventoryView } from './inventory-slice';
import { projectResidents, residentsEqual, type ResidentView } from './residents-slice';
import { projectStatus, statusEquals, type SliceMap, type StatusSlice } from './slices';
import { projectTime, timeEquals, type TimeView } from './time-slice';
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
  readonly crops: VersionedSlice<readonly CropView[]>;
  readonly inventory: VersionedSlice<InventoryView>;
  readonly wallet: VersionedSlice<WalletView>;
  readonly economy: VersionedSlice<EconomyView>;
  readonly time: VersionedSlice<TimeView>;
  readonly residents: VersionedSlice<readonly ResidentView[]>;
  readonly contracts: VersionedSlice<ContractsSlice>;
}

export function createSnapshotState(): SnapshotState {
  return {
    status: { version: 0, value: projectStatus(0) },
    // A world begins with no workers, buildings, or crops; the slices fill as
    // they appear.
    workers: { version: 0, value: [] },
    buildings: { version: 0, value: [] },
    crops: { version: 0, value: [] },
    // Corrected to the real capacity on the first tick's projection.
    inventory: { version: 0, value: { stacks: [], capacity: 0, usedSlots: 0 } },
    // Corrected to the real balance and price list on the first tick.
    wallet: { version: 0, value: { coins: 0 } },
    economy: { version: 0, value: { prices: [], expansionsPurchased: 0, nextExpansionCost: null } },
    // Exact rather than a placeholder: tick 0 is day 0 in the first phase under
    // ANY day length, so the length passed here cannot change the answer. A
    // save resuming mid-day corrects it on its first tick, like every other
    // slice.
    // Empty until the first tick projects the real village — exactly the
    // workers pattern, and correct at tick 0 regardless (everyone is indoors
    // before their first wake).
    residents: { version: 0, value: [] },
    // Corrected on the first tick, like the wallet and inventory seeds.
    contracts: {
      version: 0,
      value: { offers: [], active: [], docketFull: false, fulfilled: 0, expired: 0 },
    },
    time: {
      version: 0,
      value: projectTime({
        tick: 0,
        ticksPerDay: DEFAULT_TICKS_PER_DAY,
        daysPerSeason: DEFAULT_DAYS_PER_SEASON,
        // Empty rather than the shipped year: the season a world runs on is
        // its own frozen list, and this seed exists only until the first tick
        // projects the real one.
        seasons: [],
        ticksPerWeatherPeriod: DEFAULT_TICKS_PER_WEATHER_PERIOD,
        seed: 0,
        weatherKindRegistry: { all: () => [] },
      }),
    },
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
    crops: state.crops.version,
    inventory: state.inventory.version,
    wallet: state.wallet.version,
    economy: state.economy.version,
    time: state.time.version,
    residents: state.residents.version,
    contracts: state.contracts.version,
  };
}

export {
  statusEquals,
  projectStatus,
  workersEqual,
  projectWorkers,
  buildingsEqual,
  projectBuildings,
  cropsEqual,
  projectCrops,
  inventoryEqual,
  projectInventory,
  walletEquals,
  projectWallet,
  economyEquals,
  projectEconomy,
  timeEquals,
  projectTime,
  residentsEqual,
  projectResidents,
  contractsEqual,
  projectContracts,
};
