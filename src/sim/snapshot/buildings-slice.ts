/**
 * Building snapshot projection. Phase-05c, ADR-005 §2.
 *
 * The sim→view boundary for buildings. Plain, immutable presentation data — id,
 * tile, and the sprite key — so the renderer draws sheds without touching a
 * `Building`, the store, or the registry. Buildings change rarely (a placement),
 * so the slice republishes only then.
 */

import type { BuildingRegistry } from '../content/buildings';
import type { BuildingStore } from '../world/building';

/** One placed building, projected for rendering. */
export interface BuildingView {
  readonly id: number;
  /**
   * Which KIND of building this is (07.7d).
   *
   * Presentation legitimately needs it: the composition root anchors a sale's
   * coin burst at the market stall, and matching on the sprite key instead
   * would break the moment two buildings shared art.
   */
  readonly buildingId: string;
  readonly tile: number;
  /** Sprite key from the manifest, resolved from the definition. */
  readonly sprite: string;
}

/** The world state the projection reads. `World` satisfies this structurally. */
export interface BuildingProjectionSource {
  readonly buildings: BuildingStore;
  readonly buildingRegistry: BuildingRegistry;
}

/** Every building, projected and ordered by id (deterministic). */
export function projectBuildings(source: BuildingProjectionSource): readonly BuildingView[] {
  return [...source.buildings.values()]
    .sort((a, b) => a.id - b.id)
    .map((building) => {
      const definition = source.buildingRegistry.get(building.buildingId);
      return {
        id: building.id,
        buildingId: building.buildingId,
        tile: building.tile,
        sprite: definition.ok ? definition.value.sprite : '',
      };
    });
}

/** Change test for the buildings slice — republishes only on a real change. */
export function buildingsEqual(a: readonly BuildingView[], b: readonly BuildingView[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return false;
    if (x.id !== y.id || x.tile !== y.tile || x.sprite !== y.sprite) return false;
    if (x.buildingId !== y.buildingId) return false;
  }
  return true;
}
