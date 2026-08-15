/**
 * The town's founding. Phase-18 — ADR-030 §3, §4.
 *
 * The properties that matter are the ones the whole design leans on: the
 * village is identical on every world (a table, not a roll), it stands only on
 * town land, nothing about it consumes RNG, founding is idempotent, and no
 * command — placement or sale — can reach a town building.
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { loadWorld } from '../../persistence/load';
import type { SaveMeta } from '../../persistence/schema';
import { serializeSave, toSaveDocument } from '../../persistence/serialize';
import { FARM_SIZE, TOWN_MIN_X } from '../../shared/constants';
import { toIndexUnchecked, toPosition } from '../../shared/geometry';
import { validatePlacement, validateSellBuilding } from '../commands/building-commands';
import { CORE_PATH } from '../content/tile-kinds';
import {
  CORE_CASTLE,
  CORE_COTTAGE,
  CORE_NOTICE_BOARD,
  CORE_WELL,
  TOWN_PLACEMENTS,
  townPathTiles,
} from '../content/town';

import { getKind, isBlocked, isOwned } from './tile-grid';
import { foundTown, hasTown } from './town';
import { addCoins } from './wallet';
import { createWorld } from './world';

const META: SaveMeta = {
  gameVersion: '0.3.0-dev',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

function townBuildings(world: ReturnType<typeof createWorld>) {
  return [...world.buildings.values()].filter((building) =>
    [CORE_COTTAGE, CORE_WELL, CORE_NOTICE_BOARD, CORE_CASTLE].includes(
      building.buildingId as never,
    ),
  );
}

describe('every world is founded with the same village (ADR-030 §4)', () => {
  it('a new world has four cottages, a well, a notice board, and the castle', () => {
    const world = createWorld(7);
    const town = townBuildings(world);

    expect(town.filter((b) => b.buildingId === CORE_COTTAGE)).toHaveLength(4);
    expect(town.filter((b) => b.buildingId === CORE_WELL)).toHaveLength(1);
    expect(town.filter((b) => b.buildingId === CORE_NOTICE_BOARD)).toHaveLength(1);
    expect(town.filter((b) => b.buildingId === CORE_CASTLE)).toHaveLength(1);
    expect(hasTown(world)).toBe(true);
  });

  it('two different seeds get an identical village', () => {
    const positions = (seed: number) =>
      townBuildings(createWorld(seed)).map((b) => [b.buildingId, b.tile]);

    expect(positions(1)).toEqual(positions(999_983));
  });

  it('consumes no RNG — a seeded future is untouched by the village', () => {
    const withTown = createWorld(42);
    const withoutTown = createWorld(42, { foundTown: false });

    expect(withTown.rng.getState()).toEqual(withoutTown.rng.getState());
  });
});

describe('the village stands only on town land (ADR-030 §1)', () => {
  it('every placement and path tile is east of the farm region', () => {
    for (const placement of TOWN_PLACEMENTS) {
      expect(placement.x, `${placement.building} stands on farm land`).toBeGreaterThanOrEqual(
        TOWN_MIN_X,
      );
    }
    for (const tile of townPathTiles()) {
      expect(tile.x).toBeGreaterThanOrEqual(FARM_SIZE);
    }
  });

  it('town tiles are unowned, buildings block, and streets are path kind', () => {
    const world = createWorld(7);
    const pathIndex = world.tileKinds.indexOf(CORE_PATH);

    for (const building of townBuildings(world)) {
      expect(isOwned(world.tiles, building.tile)).toBe(false);
      expect(isBlocked(world.tiles, building.tile)).toBe(true);
    }
    for (const { x, y } of townPathTiles()) {
      const tile = toIndexUnchecked(x, y);
      if (isBlocked(world.tiles, tile)) continue; // the well stands in the plaza
      expect(getKind(world.tiles, tile)).toBe(pathIndex);
    }
  });

  it('placements agree with the layout table, in coordinates', () => {
    const world = createWorld(7);
    const placed = townBuildings(world).map((building) => {
      const position = toPosition(building.tile);
      if (!position.ok) throw new Error('town building off the grid');
      return { building: building.buildingId, x: position.value.x, y: position.value.y };
    });

    expect(placed).toEqual(TOWN_PLACEMENTS.map((p) => ({ building: p.building, x: p.x, y: p.y })));
  });
});

describe('founding is idempotent (ADR-030 §3)', () => {
  it('founding an already-founded world changes nothing', () => {
    const world = createWorld(7);
    const before = [...world.buildings.keys()];

    foundTown(world);

    expect([...world.buildings.keys()]).toEqual(before);
  });

  it('a save round-trip carries exactly one village', () => {
    const world = createWorld(7);
    const document = JSON.parse(serializeSave(toSaveDocument(world, META))) as never;
    const loaded = loadWorld(document, null);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.world.buildings.size).toBe(world.buildings.size);
    expect(townBuildings(loaded.value.world)).toHaveLength(TOWN_PLACEMENTS.length);
  });
});

describe('no command reaches a town building', () => {
  it('placeBuilding refuses a town definition even on owned land with coins', () => {
    const world = createWorld(7);
    addCoins(world.wallet, 100_000);

    const result = validatePlacement(world, toIndexUnchecked(32, 32), CORE_COTTAGE);
    expect(result.ok).toBe(false);
  });

  it('sellBuilding refuses the well — not the player’s to sell', () => {
    const world = createWorld(7);
    const well = townBuildings(world).find((b) => b.buildingId === CORE_WELL);
    if (well === undefined) throw new Error('no well founded');

    const result = validateSellBuilding(world, well.id);
    expect(result.ok).toBe(false);
  });
});
