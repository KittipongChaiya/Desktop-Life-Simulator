/**
 * Crop snapshot projection. ADR-005 §2.
 *
 * The sim→view boundary for crops. Plain, immutable presentation data — the
 * tile and the sprite key for the stage the crop has reached — so the renderer
 * draws a growing farm without touching a `Crop`, the store, or the registry.
 *
 * THE VIEW CARRIES THE RESOLVED STAGE SPRITE, NEVER ELAPSED TICKS. That is not
 * a convenience: growth advances every tick, so a view carrying `plantedTick`
 * or an elapsed count would differ on every tick and republish the slice 20
 * times a second forever (ADR-005 §2, PERFORMANCE.md §4.2). A crop passes
 * through four stages in its life, so this projection changes exactly four
 * times — and `publishIfChanged` republishes exactly that often.
 */

import { stageFor, type CropRegistry } from '../content/crops';
import { growthProgress, type GrowthSource } from '../time/growth';
import { type CropStore } from '../world/crop';

/** One planted crop, projected for rendering. */
export interface CropView {
  readonly tile: number;
  /** Stage sprite key from the manifest, resolved from the definition. */
  readonly sprite: string;
}

/** The world state the projection reads. `World` satisfies this structurally. */
export interface CropProjectionSource extends GrowthSource {
  readonly crops: CropStore;
  readonly cropRegistry: CropRegistry;
  readonly tick: number;
}

/** Every planted crop, projected and ordered by tile (deterministic). */
export function projectCrops(source: CropProjectionSource): readonly CropView[] {
  return [...source.crops.values()]
    .sort((a, b) => a.tile - b.tile)
    .map((crop) => {
      const definition = source.cropRegistry.get(crop.cropId);
      // Content that has vanished — an uninstalled plugin — draws nothing
      // rather than throwing inside a frame (SAVE_FORMAT.md §5.3 quarantines).
      if (!definition.ok) return { tile: crop.tile, sprite: '' };

      const stage = stageFor(definition.value, growthProgress(source, crop, source.tick));
      return { tile: crop.tile, sprite: definition.value.stageSprites[stage] ?? '' };
    });
}

/** Change test for the crops slice — republishes only on a real change. */
export function cropsEqual(a: readonly CropView[], b: readonly CropView[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return false;
    if (x.tile !== y.tile || x.sprite !== y.sprite) return false;
  }
  return true;
}
