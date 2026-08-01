/**
 * Building projection tests.
 *
 * The slice shipped in 07.5c without its own tests. `buildingId` was added in
 * 07.7d so the composition root can anchor a sale's coin burst at the market
 * stall, and that field is only correct if it both PROJECTS and participates
 * in the change test — a `buildingsEqual` that ignored it would let a
 * renderer keep a stale identity for a tile.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { CORE_MARKET_STALL, CORE_STORAGE_SHED } from '../content/buildings';
import { createWorld, type World } from '../world/world';

import { buildingsEqual, projectBuildings, type BuildingView } from './buildings-slice';

const TILE = toIndexUnchecked(30, 30);
const OTHER = toIndexUnchecked(32, 30);

/** Places a building directly in the store — the command path is tested elsewhere. */
function place(world: World, id: number, buildingId: string, tile: number): void {
  world.buildings.set(id, {
    id,
    buildingId: buildingId as never,
    tile: tile as never,
  });
}

describe('projection', () => {
  it('projects nothing for a farm with no buildings', () => {
    expect(projectBuildings(createWorld(1))).toEqual([]);
  });

  it('carries the building kind, so a renderer can tell them apart', () => {
    const world = createWorld(1);
    place(world, 1, CORE_MARKET_STALL, TILE);

    expect(projectBuildings(world)[0]?.buildingId).toBe(CORE_MARKET_STALL);
  });

  it('resolves the sprite from the definition', () => {
    const world = createWorld(1);
    place(world, 1, CORE_MARKET_STALL, TILE);

    expect(projectBuildings(world)[0]?.sprite).toBe('buildings:market_stall');
  });

  it('orders by id so the projection is deterministic', () => {
    const world = createWorld(1);
    place(world, 2, CORE_STORAGE_SHED, OTHER);
    place(world, 1, CORE_MARKET_STALL, TILE);

    expect(projectBuildings(world).map((view) => view.id)).toEqual([1, 2]);
  });

  it('projects an empty sprite for content that has vanished', () => {
    // An uninstalled plugin must not throw inside a frame.
    const world = createWorld(1);
    place(world, 1, 'core:nonexistent', TILE);

    expect(projectBuildings(world)[0]?.sprite).toBe('');
  });
});

describe('change test', () => {
  const view = (overrides: Partial<BuildingView> = {}): readonly BuildingView[] => [
    {
      id: 1,
      buildingId: CORE_MARKET_STALL,
      tile: TILE,
      sprite: 'buildings:market_stall',
      ...overrides,
    },
  ];

  it('treats an identical projection as unchanged', () => {
    expect(buildingsEqual(view(), view())).toBe(true);
  });

  it('notices a differing length', () => {
    expect(buildingsEqual([], view())).toBe(false);
  });

  it('notices a moved building', () => {
    expect(buildingsEqual(view(), view({ tile: OTHER }))).toBe(false);
  });

  it('notices a changed KIND even when everything else matches', () => {
    // The assertion the 07.7d field exists for. Without `buildingId` in the
    // comparison this passes as "unchanged" and the renderer keeps a stale
    // identity for the tile.
    expect(buildingsEqual(view(), view({ buildingId: CORE_STORAGE_SHED }))).toBe(false);
  });
});
