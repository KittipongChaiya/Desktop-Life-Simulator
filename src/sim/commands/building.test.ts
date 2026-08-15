/**
 * Storage buildings. Phase-05c, ADR-011.
 *
 * Placement validation, buildings blocking walkability (through the tile model,
 * not a buildings query), and workers depositing to the nearest shed via the
 * target-selection service.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asWorkerId, type TileIndex } from '../../shared/ids';
import { CORE_STORAGE_SHED } from '../content/buildings';
import { CORE_TURNIP } from '../content/crops';
import { DEFAULT_STACK_SIZE } from '../content/items';
import { findPath } from '../pathing/astar';
import { stepSimulation, stepSimulationBy } from '../tick';
import { addItems, containerCount, containerTotal } from '../world/container';
import { isBlocked } from '../world/tile-grid';
import { addCoins } from '../world/wallet';
import { createWorker } from '../world/worker';
import { createWorld, type World } from '../world/world';

import { CommandSource } from './types';

const CENTER = toIndexUnchecked(32, 32);

/** The player's sheds — every world also carries the founded village (ADR-030). */
function sheds(world: World) {
  return [...world.buildings.values()].filter((b) => b.buildingId === CORE_STORAGE_SHED);
}

function placeShed(world: World, tile: TileIndex): void {
  // Placement charges since 06c; fund the attempt (legality of the TILE is
  // what these tests probe, so affordability must never be the rejection).
  addCoins(world.wallet, 200);
  world.commands.dispatch(
    { type: 'placeBuilding', tile, buildingId: CORE_STORAGE_SHED },
    { source: CommandSource.Player },
  );
  stepSimulation(world);
}

describe('placement validation (crit 9)', () => {
  it('places a shed on owned walkable land, blocks the tile, and opens its container', () => {
    const world = createWorld(1);
    placeShed(world, CENTER);

    expect(sheds(world)).toHaveLength(1);
    expect(isBlocked(world.tiles, CENTER)).toBe(true);
    const shed = sheds(world)[0];
    expect(world.buildingStorage.get(shed!.id)?.capacity).toBe(50);
  });

  it('rejects placement on unowned land', () => {
    const world = createWorld(1);
    placeShed(world, toIndexUnchecked(0, 0));
    expect(sheds(world)).toHaveLength(0);
  });

  it('rejects placement on a crop or a second building', () => {
    const world = createWorld(1);
    world.crops.set(CENTER, { cropId: CORE_TURNIP, tile: CENTER, plantedTick: 0 });
    placeShed(world, CENTER);
    expect(sheds(world)).toHaveLength(0);

    const other = toIndexUnchecked(30, 30);
    placeShed(world, other);
    placeShed(world, other); // same tile twice
    expect(sheds(world)).toHaveLength(1);
  });
});

describe('buildings participate in walkability (crit 10, 11)', () => {
  it('a shed makes its tile impassable and forces routing around it', () => {
    const world = createWorld(1);
    placeShed(world, CENTER);

    // The shed tile is not a walkable goal.
    expect(findPath(world, toIndexUnchecked(30, 32), CENTER).ok).toBe(false);

    // A route across the shed's row goes around it, never through it.
    const path = findPath(world, toIndexUnchecked(30, 32), toIndexUnchecked(34, 32));
    expect(path.ok).toBe(true);
    if (path.ok) expect(path.value).not.toContain(CENTER);
  });
});

describe('deposit target selection (crit 12, 13)', () => {
  function workerWithHold(world: World): ReturnType<typeof createWorker> {
    const worker = createWorker(asWorkerId(1), CENTER);
    addItems(worker.carrying, CORE_TURNIP, 12, DEFAULT_STACK_SIZE); // past the deposit threshold
    world.workers.set(worker.id, worker);
    return worker;
  }

  it('deposits a full hold into a storage shed, not the player inventory', () => {
    const world = createWorld(1);
    placeShed(world, toIndexUnchecked(30, 30));
    const shed = sheds(world)[0];
    const worker = workerWithHold(world);

    stepSimulationBy(world, 3); // idle -> dispatch deposit -> apply

    expect(containerTotal(worker.carrying)).toBe(0);
    expect(containerCount(world.buildingStorage.get(shed!.id)!, CORE_TURNIP)).toBe(12);
    expect(containerCount(world.inventory, CORE_TURNIP)).toBe(0);
  });

  it('falls back to the player inventory when no shed exists', () => {
    const world = createWorld(1);
    const worker = workerWithHold(world);

    stepSimulationBy(world, 3);

    expect(containerTotal(worker.carrying)).toBe(0);
    expect(containerCount(world.inventory, CORE_TURNIP)).toBe(12);
  });
});
