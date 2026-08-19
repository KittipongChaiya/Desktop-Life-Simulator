/**
 * Founding the town. Phase-18 — ADR-030 §3.
 *
 * ONE code path stamps the village onto every world: `createWorld` calls this
 * for a new world, and hydration calls it after restoring a loaded one. The
 * guard makes it idempotent — a world holding any town building keeps exactly
 * what it has — and the guard is sound because no command can remove a town
 * building: placement and selling are ownership-gated, and town tiles are
 * never owned. "No town buildings" can only mean "built before the town
 * existed", which is how a migrated v0.2 farm gains its neighbours on first
 * load.
 *
 * Construction-time writes, like `claimCenteredPlot` — not commands. Commands
 * are the only write path into a LIVE world (ADR-010 §1); a world being built
 * or hydrated is not live yet, and this runs before any tick.
 *
 * No RNG is consumed (ADR-030 §4): the layout is a table, so determinism and
 * every seeded world's future are untouched.
 */

import { toIndexUnchecked } from '../../shared/geometry';
import type { BuildingId } from '../../shared/ids';
import type { BuildingRegistry } from '../content/buildings';
import { footprintOf } from '../content/buildings';
import { footprintTiles } from '../content/footprint';
import type { TileKindRegistry } from '../content/tile-kinds';
import { CORE_PATH } from '../content/tile-kinds';
import { TOWN_BUILDING_IDS, TOWN_PLACEMENTS, townPathTiles } from '../content/town';
import type { IdAllocator } from '../entities/id-allocator';

import type { BuildingStore } from './building';
import { createContainer, type Container } from './container';
import { setBlocked, setKind, type TileGrid } from './tile-grid';

/**
 * What founding needs. `World` satisfies this structurally — stated as its own
 * interface so this module never imports the world it is called from
 * (the `SeasonalPricingSource` pattern, `economy.ts`).
 */
export interface TownSite {
  readonly tiles: TileGrid;
  readonly tileKinds: TileKindRegistry;
  readonly buildingRegistry: BuildingRegistry;
  readonly buildings: BuildingStore;
  readonly buildingStorage: Map<BuildingId, Container>;
  readonly ids: IdAllocator;
}

/** True if the world already has its town. */
export function hasTown(world: TownSite): boolean {
  const townIds = new Set<string>(TOWN_BUILDING_IDS);
  for (const building of world.buildings.values()) {
    if (townIds.has(building.buildingId)) return true;
  }
  return false;
}

/**
 * Stamps the village onto the town region: path tiles, then buildings with
 * their blocked bits (and a container where a definition stores). A world that
 * already has its town is left exactly as it is.
 */
export function foundTown(world: TownSite): void {
  if (hasTown(world)) return;

  const pathIndex = world.tileKinds.indexOf(CORE_PATH);
  // A world whose content registered no path tile keeps grass streets — the
  // village still stands, which is the correct degradation for missing
  // content (ADR-022 §5's rule, applied to ground).
  if (pathIndex >= 0) {
    for (const { x, y } of townPathTiles()) {
      setKind(world.tiles, toIndexUnchecked(x, y), pathIndex);
    }
  }

  for (const placement of TOWN_PLACEMENTS) {
    const definition = world.buildingRegistry.get(placement.building);
    // Missing town content degrades to fewer buildings, never to a throw —
    // hydration must survive any content set (ADR-019 §7 lets sources be
    // disabled, and a save is not damaged by what is not installed).
    if (!definition.ok) continue;

    const tile = toIndexUnchecked(placement.x, placement.y);
    const id = world.ids.allocateBuilding();
    world.buildings.set(id, { id, tile, buildingId: placement.building });
    // The whole footprint (phase-41). The town is founded from a fixed layout
    // written when every building was one tile, so a building that grew may now
    // overlap its neighbour — same rule as a legacy save (ADR-042 §4): the
    // tiles are blocked, both buildings work, and nothing is moved or dropped.
    for (const covered of footprintTiles(tile, footprintOf(definition.value)) ?? [tile]) {
      setBlocked(world.tiles, covered, true);
    }

    if (definition.value.storageSlots !== undefined) {
      world.buildingStorage.set(id, createContainer(definition.value.storageSlots));
    }
  }
}
