/**
 * Snapshot slices — the read-only projection views consume. ADR-005 §2.
 *
 * The snapshot is NOT one object. It is independent slices, each with its own
 * version counter, so a component subscribes only to what it reads. Coins
 * changing must re-render the coin readout and nothing else.
 *
 * THE RULE: a slice republishes only when its content actually changes. A slice
 * that republishes every tick is a defect — it would drive the UI at 20 Hz
 * forever and blow the idle CPU budget (PERFORMANCE.md §4.2), which is the
 * exact failure ADR-005 exists to prevent.
 */

import { ticksToWholeSeconds } from '../time/game-clock';

import type { BuildingView } from './buildings-slice';
import type { ContractsSlice } from './contracts-slice';
import type { CropView } from './crops-slice';
import type { EconomyView, WalletView } from './economy-slice';
import type { ExpeditionsSlice } from './expeditions-slice';
import type { FactoryView } from './factories-slice';
import type { InventoryView } from './inventory-slice';
import type { ResidentView } from './residents-slice';
import type { TimeView } from './time-slice';
import type { WorkerView } from './workers-slice';

/**
 * Status readout for the collapsed status bar.
 *
 * `uptimeSeconds` is deliberately coarse. Projecting the raw tick would change
 * every tick and republish 20x/second forever; whole seconds change 1x/second,
 * which is all a glanceable readout needs (VISION.md §2.1). `tick` rides along
 * so the value is exact at the moment of publication — and watching it advance
 * by ~20 per second is direct proof the simulation is running at rate.
 */
export interface StatusSlice {
  readonly tick: number;
  readonly uptimeSeconds: number;
}

/** Every slice, keyed by name. Extended as phases add systems. */
export interface SliceMap {
  readonly status: StatusSlice;
  /** Workers, projected for rendering and selection. Phase-04c. */
  readonly workers: readonly WorkerView[];
  /** Placed buildings, projected for rendering. Phase-05c. */
  readonly buildings: readonly BuildingView[];
  /** Planted crops, projected for rendering. Republishes on STAGE change only. */
  readonly crops: readonly CropView[];
  /** The player's aggregated holdings, for the inventory panel. Phase-05d. */
  readonly inventory: InventoryView;
  /** The coin balance, alone — so it re-renders alone. Phase-06d. */
  readonly wallet: WalletView;
  /** Live integer prices and the expansion counter. Phase-06d. */
  readonly economy: EconomyView;
  /** The day and its phase. Republishes on a PHASE boundary only. Phase-10b. */
  readonly time: TimeView;
  /**
   * The village's people, DERIVED from the tick (ADR-031). Empty at night —
   * the sleeping town publishes nothing. Phase-19.
   */
  readonly residents: readonly ResidentView[];
  readonly factories: readonly FactoryView[];
  /** The notice board: today's offers, the docket, the counters. Phase-20. */
  readonly contracts: ContractsSlice;
  /**
   * Tiles in the wilds whose node has been worked and has not come back.
   *
   * WHERE the nodes are is absent by design — it is a hash of the seed the
   * renderer already holds (ADR-037 §3). Only what changes crosses. Phase-27.
   */
  readonly wilds: readonly number[];
  /** The map: destinations, their locks, and who is away (phase-28). */
  readonly expeditions: ExpeditionsSlice;
}

export type SliceName = keyof SliceMap;

export const SLICE_NAMES = [
  'status',
  'workers',
  'buildings',
  'crops',
  'inventory',
  'wallet',
  'economy',
  'time',
  'residents',
  'factories',
  'contracts',
  'wilds',
  'expeditions',
] as const satisfies readonly SliceName[];

/** Projects the status slice from world state. Pure. */
export function projectStatus(tick: number): StatusSlice {
  return { tick, uptimeSeconds: ticksToWholeSeconds(tick) };
}

/**
 * Change test for a slice.
 *
 * Shallow comparison is correct here because slices are flat records of
 * primitives by construction. A slice that needs deep comparison is a slice
 * that should be split.
 */
export function statusEquals(a: StatusSlice, b: StatusSlice): boolean {
  return a.uptimeSeconds === b.uptimeSeconds;
}
