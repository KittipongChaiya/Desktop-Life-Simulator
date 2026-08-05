/**
 * Event definitions.
 *
 * ONLY events with a real producer AND a real consumer today.
 *
 * `WorldLoaded` and `WorldSaved` were expected to arrive with the save system.
 * Phase-07 shipped complete WITHOUT them, and they are deliberately still
 * absent: the sim never learns saves exist (`ARCHITECTURE.md` §2.1), so both
 * would have a publisher outside it and no subscriber inside it. Load
 * reporting reaches the player through the composition root's return summary
 * and the devtools note; save reporting through the save controller's status.
 * Adding the events anyway would be the unreachable-type pattern
 * `AI_RULES.md` §1.6 forbids — the very thing this comment was written to
 * prevent. They arrive if and when a SIMULATION system needs to react.
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

/**
 * Fired when a tile is successfully tilled.
 *
 * Its consumer is the composition root, which invalidates the tile's terrain
 * chunk so the tilled soil is drawn. It has to be an event rather than a
 * snapshot slice: tilling moves `tilledAt`, which no slice projects, and
 * projecting the whole 4,096-tile grid to catch one changed byte would cost
 * more every tick than the redraw costs once.
 *
 * A worker tilling produces the identical event, so autonomous work is drawn
 * on the same path as the player's — there is no second route to keep in sync.
 */
export interface TileTilled {
  readonly tile: number;
  /** Tick recorded on the tile, i.e. what `tilledAt` now holds. */
  readonly tick: number;
}

/**
 * Fired when a tile stops being tilled — in v0.1, when its crop is harvested
 * (`GAME_DESIGN.md` §2.2, 07.9).
 *
 * The mirror of `TileTilled`, and it exists for the same reason: `tilledAt`
 * reaches no snapshot slice, so the composition root would never learn the
 * terrain chunk went stale and the tilled soil would outlive the crop that
 * stood in it. A worker's harvest produces the identical event, so autonomous
 * work is drawn on the same path as the player's.
 *
 * It carries no tick. `TileTilled` reports what `tilledAt` now holds; here that
 * value is zero by definition, and the event ring already stamps every
 * observation with the tick it arrived on.
 */
export interface TileUntilled {
  readonly tile: number;
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
 * Fired when items are sold at the market boundary — manually (`sellItems`) or,
 * from 06c, by the market stall's auto-sell. `automatic` distinguishes the two
 * so phase-07's return summary can report what the farm earned unattended.
 */
export interface ItemSold {
  readonly item: string;
  readonly quantity: number;
  /** Coins credited for the whole batch. Integer, always. */
  readonly coins: number;
  readonly automatic: boolean;
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
  readonly tileTilled: TileTilled;
  readonly tileUntilled: TileUntilled;
  readonly cropPlanted: CropPlanted;
  readonly cropHarvested: CropHarvested;
  readonly itemSold: ItemSold;
}

export type SimEventName = keyof SimEventMap;
