/**
 * Planted crop instances. ADR-004 §5, ADR-009 §2.
 *
 * An instance stores ONLY what cannot be derived: which crop, which tile, and
 * when it was planted. Growth stage is computed from `world.tick - plantedTick`
 * and the definition — never stored (ADR-009 §2).
 *
 * That is what makes offline progress exact: loading a save from eight hours
 * ago and advancing the tick produces precisely the state the crop would have
 * had, with no catch-up pass and no error budget.
 */

import type { ContentId, TileIndex } from '../../shared/ids';

export interface Crop {
  readonly cropId: ContentId;
  readonly tile: TileIndex;
  /** Tick at which this crop was planted. The only growth state there is. */
  readonly plantedTick: number;
}

/** Sparse store: most tiles have no crop (ADR-004 §2). */
export type CropStore = Map<TileIndex, Crop>;

export function createCropStore(): CropStore {
  return new Map();
}

/** Ticks this crop has been growing. Negative elapsed is clamped to zero. */
export function elapsedTicks(crop: Crop, currentTick: number): number {
  return Math.max(0, currentTick - crop.plantedTick);
}
