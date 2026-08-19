/**
 * Buildings that stand on more than one tile. Phase-41 — ADR-042 §3.
 *
 * The visual point of footprints is that a house stops being an icon in a box.
 * The SIMULATION point is narrower and is what this file guards: the tiles a
 * building covers are blocked, refused to anything else, and released when it
 * goes. A footprint the renderer draws and the simulation does not know about
 * is a wall workers walk through.
 *
 * Nothing here asserts a particular size. Sizes are content and will move; what
 * must not move is that occupancy follows whatever size content declares.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { ErrorCode } from '../src/shared/errors';
import { toIndexUnchecked } from '../src/shared/geometry';
import {
  placeBuilding,
  sellBuilding,
  validatePlacement,
} from '../src/sim/commands/building-commands';
import {
  CORE_MARKET_STALL,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
  footprintOf,
} from '../src/sim/content/buildings';
import { footprintTiles } from '../src/sim/content/footprint';
import { isBlocked } from '../src/sim/world/tile-grid';
import { createWorld, type World } from '../src/sim/world/world';

/** A world with money to spend, so placement fails on land rather than funds. */
function richFarm(): World {
  const world = createWorld(11);
  world.wallet.coins = 10_000;
  return world;
}

/** The declared footprint of a building, read the way the simulation reads it. */
function tilesFor(world: World, buildingId: typeof CORE_STORAGE_SHED, x: number, y: number) {
  const definition = world.buildingRegistry.get(buildingId);
  if (!definition.ok) throw new Error('missing definition');
  const tiles = footprintTiles(toIndexUnchecked(x, y), footprintOf(definition.value));
  if (tiles === null) throw new Error('footprint does not fit');
  return tiles;
}

describe('a multi-tile building occupies every tile it stands on', () => {
  it('blocks its whole footprint, not just the tile it was placed on', () => {
    const world = richFarm();
    const tiles = tilesFor(world, CORE_STORAGE_SHED, 30, 33);

    expect(tiles.length).toBeGreaterThan(1); // the shed is not 1x1 in this content
    expect(placeBuilding(world, toIndexUnchecked(30, 33), CORE_STORAGE_SHED).ok).toBe(true);

    for (const tile of tiles) {
      expect(isBlocked(world.tiles, tile), `tile ${String(tile)} should be blocked`).toBe(true);
    }
  });

  it('refuses a second building that would overlap any of those tiles', () => {
    // Not just the origin. The first version of placement checked the clicked
    // tile alone, which would have let two sheds interlock like puzzle pieces.
    const world = richFarm();
    expect(placeBuilding(world, toIndexUnchecked(30, 33), CORE_STORAGE_SHED).ok).toBe(true);

    // Every tile the first shed covers must refuse the second, including the
    // ones that are not its origin.
    const covered = tilesFor(world, CORE_STORAGE_SHED, 30, 33);
    expect(covered.length).toBeGreaterThan(1);

    for (const tile of covered) {
      expect(validatePlacement(world, tile, CORE_SEED_BIN).ok, `overlap at ${String(tile)}`).toBe(
        false,
      );
    }
  });

  it('releases every tile when the building is sold', () => {
    const world = richFarm();
    const tiles = tilesFor(world, CORE_STORAGE_SHED, 30, 33);
    expect(placeBuilding(world, toIndexUnchecked(30, 33), CORE_STORAGE_SHED).ok).toBe(true);

    const placed = [...world.buildings.values()].find((b) => b.buildingId === CORE_STORAGE_SHED);
    expect(placed).toBeDefined();
    if (placed === undefined) return;

    expect(sellBuilding(world, placed.id).ok).toBe(true);

    for (const tile of tiles) {
      expect(isBlocked(world.tiles, tile), `tile ${String(tile)} should be free`).toBe(false);
    }
  });

  it('does not unblock a neighbour’s tiles when one of two buildings is sold', () => {
    // The overlap case ADR-042 §4 keeps loadable: two buildings can share tiles
    // in a world founded or saved before they had sizes. Selling one must not
    // punch a walkable hole through the other.
    const world = richFarm();
    expect(placeBuilding(world, toIndexUnchecked(30, 33), CORE_STORAGE_SHED).ok).toBe(true);
    expect(placeBuilding(world, toIndexUnchecked(33, 33), CORE_MARKET_STALL).ok).toBe(true);

    const stallTiles = tilesFor(world, CORE_MARKET_STALL, 33, 33);
    const shed = [...world.buildings.values()].find((b) => b.buildingId === CORE_STORAGE_SHED);
    expect(shed).toBeDefined();
    if (shed === undefined) return;

    expect(sellBuilding(world, shed.id).ok).toBe(true);

    for (const tile of stallTiles) {
      expect(isBlocked(world.tiles, tile), `stall tile ${String(tile)} lost its wall`).toBe(true);
    }
  });
});

describe('a footprint that does not fit is refused with a reason', () => {
  it('refuses when the building would reach outside the owned plot', () => {
    // The starting plot is 8x8; a building placed on its top row grows up into
    // land the player does not own. The refusal names the tile that failed, so
    // the UI can say which corner is the problem rather than "no".
    const world = richFarm();
    const result = validatePlacement(world, toIndexUnchecked(28, 28), CORE_STORAGE_SHED);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.TileNotOwned);
  });

  it('still accepts a single-tile building anywhere a tile is free', () => {
    // The regression that would hurt most: footprints must cost nothing to the
    // buildings that do not have one.
    const world = richFarm();

    expect(placeBuilding(world, toIndexUnchecked(28, 28), CORE_SEED_BIN).ok).toBe(true);
    expect(isBlocked(world.tiles, toIndexUnchecked(28, 28))).toBe(true);
  });
});
