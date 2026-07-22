/**
 * Placed buildings. Phase-05, ADR-004 §2, §5.
 *
 * An instance stores only what cannot be derived: which building, and where.
 * Its definition (cost, sprite, storage size) lives in the registry and is
 * referenced by id — the same definition/instance split as crops and items.
 *
 * A building that stores owns a container, held in a SIDE-TABLE keyed by
 * building id (`world.buildingStorage`), not a field on every building
 * (ADR-004 §4, ADR-011). Only storing buildings pay for a container.
 */

import type { BuildingId, ContentId, TileIndex } from '../../shared/ids';

export interface Building {
  readonly id: BuildingId;
  /** The tile it occupies. Blocks walkability there (tile-grid `blocked`). */
  readonly tile: TileIndex;
  /** Which building kind — references a `BuildingDefinition`. */
  readonly buildingId: ContentId;
}

/** Sparse store keyed by branded id (ADR-004 §2). */
export type BuildingStore = Map<BuildingId, Building>;

export function createBuildingStore(): BuildingStore {
  return new Map();
}
