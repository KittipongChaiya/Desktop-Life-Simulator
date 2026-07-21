/**
 * Event definitions.
 *
 * ONLY events with a real producer AND a real consumer today. `WorldLoaded` and
 * `WorldSaved` arrive with the save system in phase-07, where they immediately
 * gain publishers, subscribers, and tests. Defining them now would create
 * unreachable types — the speculative-API pattern `AI_RULES.md` §1.6 forbids.
 *
 * Naming: PastTense, describing something that HAS HAPPENED. An event is a
 * statement of fact, never a request. `cropHarvested`, not `harvestCrop` — a
 * subscriber may react but can never veto, which is what keeps publishers
 * independent of who is listening (ADR-008 §Naming).
 */

/** Fired once, after the application has finished wiring itself. */
export interface AppStarted {
  /** Build version, for correlating traces with a release. */
  readonly version: string;
}

/** Fired every simulation tick, after all systems have run. */
export interface SimulationTick {
  readonly tick: number;
}

/** Fired when a crop is successfully planted. */
export interface CropPlanted {
  readonly tile: number;
  readonly cropId: string;
  readonly plantedTick: number;
}

/** Fired when a mature crop is harvested. */
export interface CropHarvested {
  readonly tile: number;
  readonly cropId: string;
  readonly yields: readonly { readonly item: string; readonly quantity: number }[];
}

/**
 * The event map. Adding a member here is all a new event needs — the bus,
 * subscription, and dispatch are generic over it.
 *
 * Phase-04 `workerIdle`; phase-05
 * `inventoryChanged`; phase-07 `worldLoaded` / `worldSaved`.
 */
export interface SimEventMap {
  readonly appStarted: AppStarted;
  readonly simulationTick: SimulationTick;
  readonly cropPlanted: CropPlanted;
  readonly cropHarvested: CropHarvested;
}

export type SimEventName = keyof SimEventMap;
