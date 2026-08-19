/**
 * A save written before buildings had a size still loads. Phase-52.
 *
 * ## The one way v0.5 could have destroyed a farm
 *
 * v0.5 gave buildings multi-tile footprints (ADR-042). Every version before it
 * placed buildings one tile apart quite legally, so **worlds saved by v0.1–v0.4
 * contain buildings that the current placement rule would refuse**: a mill now
 * covers nine tiles where it covered one, and its neighbour is sitting in three
 * of them.
 *
 * A rendering change is not allowed to eat somebody's mill. ADR-042 §4 fixed
 * the rule before the problem could be discovered in the field: **loading never
 * fails and never moves a building.** Only NEW placements are validated.
 *
 * `save-compatibility-report.md` §14.2 states that guarantee to a player. This
 * is what makes it true rather than intended — and it is a load-path test on
 * purpose, because `building-footprints.test.ts` covers the placement and sell
 * paths and neither of those is where an old file arrives.
 */

import { describe, expect, it } from 'vitest';

import { hydrateWorld } from '../src/persistence/deserialize';
import type { SaveBuilding, SaveDocument, SaveMeta } from '../src/persistence/schema';
import { toSaveDocument } from '../src/persistence/serialize';
import {
  CORE_BUILDINGS,
  CORE_MILL,
  CORE_STORAGE_SHED,
  footprintOf,
} from '../src/sim/content/buildings';
import { footprintTiles } from '../src/sim/content/footprint';
import { asBuildingId } from '../src/shared/ids';
import { toIndexUnchecked } from '../src/shared/geometry';
import { isBlocked } from '../src/sim/world/tile-grid';
import { createWorld } from '../src/sim/world/world';

/** Read from content, so this test cannot disagree with the definition. */
const MILL_FOOTPRINT = footprintOf(
  CORE_BUILDINGS.find((definition) => definition.id === CORE_MILL) ??
    (() => {
      throw new Error('the mill left the core building set');
    })(),
);

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

/**
 * A document holding buildings at the given origins, whatever the current rule
 * would say about them.
 *
 * Written into the document rather than placed through the command, because
 * the command is exactly what would refuse this — which is the situation being
 * reproduced: a file from a build that had no such rule.
 */
function documentWithBuildings(buildings: readonly SaveBuilding[]): SaveDocument {
  const base = toSaveDocument(createWorld(4242), META);
  return { ...base, world: { ...base.world, buildings } };
}

describe('a pre-footprint save with overlapping buildings', () => {
  // A mill at (30, 33) covers x 30..32, y 31..33. The shed at (31, 32) sits
  // squarely inside it — two tiles of overlap, which no v0.5 placement allows.
  const MILL_ORIGIN = toIndexUnchecked(30, 33);
  const SHED_ORIGIN = toIndexUnchecked(31, 32);

  // Ids well clear of the town's own buildings, which `hydrateWorld` founds
  // before it reads the saved list — a collision would silently REPLACE a
  // cottage and the test would be measuring that instead.
  const MILL_ID = 9001;
  const SHED_ID = 9002;

  const OVERLAPPING: readonly SaveBuilding[] = [
    { id: MILL_ID, tile: MILL_ORIGIN, buildingId: CORE_MILL },
    { id: SHED_ID, tile: SHED_ORIGIN, buildingId: CORE_STORAGE_SHED },
  ];

  it('loads at all', () => {
    // THE promise. Everything below is about the state afterwards; this is the
    // one a player would notice.
    expect(() => hydrateWorld(documentWithBuildings(OVERLAPPING))).not.toThrow();
  });

  it('keeps both buildings, and moves neither', () => {
    const world = hydrateWorld(documentWithBuildings(OVERLAPPING));

    for (const saved of OVERLAPPING) {
      const record = world.buildings.get(asBuildingId(saved.id));
      expect(record, `${saved.buildingId} vanished`).toBeDefined();
      expect(record?.tile, `${saved.buildingId} was relocated`).toBe(saved.tile);
      expect(record?.buildingId).toBe(saved.buildingId);
    }
  });

  it('blocks every tile both of them cover', () => {
    // The mechanism, pinned: the grid records WHETHER a tile is blocked, not
    // who blocked it, so an overlap is not a conflict there is anything to
    // resolve. Both rectangles are marked and the shared tiles are marked
    // twice, which is the same as marked once.
    const world = hydrateWorld(documentWithBuildings(OVERLAPPING));

    for (const saved of OVERLAPPING) {
      const definition = world.buildingRegistry.get(saved.buildingId);
      expect(definition.ok).toBe(true);
      if (!definition.ok) return;

      const covered = footprintTiles(saved.tile, footprintOf(definition.value));
      expect(covered).not.toBeNull();
      for (const tile of covered ?? []) {
        expect(
          isBlocked(world.tiles, tile),
          `${saved.buildingId} left ${String(tile)} walkable`,
        ).toBe(true);
      }
    }

    // NOT VACUOUS. A world where everything happened to be blocked would pass
    // every assertion above while proving nothing, so one tile just outside
    // both rectangles has to still be walkable.
    expect(isBlocked(world.tiles, toIndexUnchecked(34, 33))).toBe(false);
  });
});

describe('a legacy building too close to the map edge', () => {
  it('loads, and blocks its origin rather than a clamped rectangle', () => {
    // `footprintTiles` returns null rather than clamping, because a building
    // that silently shrank would block fewer tiles than its art covers and a
    // worker would walk through its wall. The load falls back to the origin
    // tile: less than the art covers, but a load that refused would be worse,
    // and this farm was legal when it was written.
    const topRow = toIndexUnchecked(4, 0);

    // The rectangle a mill wants grows UP, off the top of the world.
    expect(footprintTiles(topRow, MILL_FOOTPRINT)).toBeNull();

    const world = hydrateWorld(
      documentWithBuildings([{ id: 9001, tile: topRow, buildingId: CORE_MILL }]),
    );

    expect(world.buildings.get(asBuildingId(9001))?.tile).toBe(topRow);
    expect(isBlocked(world.tiles, topRow)).toBe(true);
  });
});
