/**
 * The building economy: costs charged, buildings sold back, hiring billed.
 * Phase-06c, GAME_DESIGN.md §4.1, §5, §5.2, ADR-013.
 *
 * Placement and hiring become real sinks: validated against the wallet,
 * spending through it, all-or-nothing. Selling a building refunds exactly 50%
 * (§5.2) and may never destroy stored goods — a storing building sells only
 * once its container is empty (ADR-011 §7, resolved interpretation 7).
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../shared/errors';
import { toIndexUnchecked } from '../../shared/geometry';
import { type TileIndex } from '../../shared/ids';
import {
  CORE_MARKET_STALL,
  CORE_REST_HUT,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
} from '../content/buildings';
import { CORE_TURNIP } from '../content/crops';
import { DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation } from '../tick';
import { addItems } from '../world/container';
import { isBlocked } from '../world/tile-grid';
import { addCoins } from '../world/wallet';
import { createWorld, type World } from '../world/world';

import { CommandSource } from './types';

const CENTER = toIndexUnchecked(32, 32);

function place(world: World, tile: TileIndex, buildingId: string): void {
  world.commands.dispatch(
    { type: 'placeBuilding', tile, buildingId },
    { source: CommandSource.Player },
  );
  stepSimulation(world);
}

describe('the §5 building table', () => {
  it('registers all four v0.1 buildings at their exact costs', () => {
    const world = createWorld(1);
    const expected = [
      { id: CORE_STORAGE_SHED, cost: 200 },
      { id: CORE_REST_HUT, cost: 300 },
      { id: CORE_SEED_BIN, cost: 500 },
      { id: CORE_MARKET_STALL, cost: 1_200 },
    ];
    for (const row of expected) {
      const definition = world.buildingRegistry.get(row.id);
      expect(definition.ok).toBe(true);
      if (definition.ok) expect(definition.value.cost).toBe(row.cost);
    }
  });

  it('the market stall stores (it receives deposits); the rest hut and seed bin do not', () => {
    const world = createWorld(1);
    const slotsOf = (id: typeof CORE_REST_HUT): number | undefined => {
      const definition = world.buildingRegistry.get(id);
      return definition.ok ? definition.value.storageSlots : -1;
    };
    expect(slotsOf(CORE_MARKET_STALL)).toBeGreaterThan(0);
    expect(slotsOf(CORE_REST_HUT)).toBeUndefined();
    expect(slotsOf(CORE_SEED_BIN)).toBeUndefined();
  });
});

describe('placement charges the wallet (crit 8)', () => {
  it('spends exactly the building cost', () => {
    const world = createWorld(1);
    addCoins(world.wallet, 400); // 500 total
    place(world, CENTER, CORE_STORAGE_SHED); // 200

    expect(world.buildings.size).toBe(1);
    expect(world.wallet.coins).toBe(300);
  });

  it('rejects an unaffordable building and places nothing (crit 7)', () => {
    const world = createWorld(1); // 100 coins < 200
    const result = world.commands.dispatch(
      { type: 'placeBuilding', tile: CENTER, buildingId: CORE_STORAGE_SHED },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InsufficientFunds);
    stepSimulation(world);

    expect(world.buildings.size).toBe(0);
    expect(world.wallet.coins).toBe(100);
    expect(isBlocked(world.tiles, CENTER)).toBe(false);
  });
});

describe('sellBuilding (crit 15)', () => {
  function placedShed(world: World): number {
    addCoins(world.wallet, 900); // 1,000 total
    place(world, CENTER, CORE_STORAGE_SHED); // -> 800
    return [...world.buildings.values()][0]!.id;
  }

  it('refunds exactly 50% of cost, unblocks the tile, and removes the building', () => {
    const world = createWorld(1);
    const id = placedShed(world);

    world.commands.dispatch(
      { type: 'sellBuilding', building: id },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    expect(world.buildings.size).toBe(0);
    expect(world.wallet.coins).toBe(900); // 800 + floor(200 × 0.5)
    expect(isBlocked(world.tiles, CENTER)).toBe(false);
    expect(world.buildingStorage.size).toBe(0);
  });

  it('refuses to sell a storing building whose container is not empty', () => {
    const world = createWorld(1);
    const id = placedShed(world);
    const storage = world.buildingStorage.get([...world.buildingStorage.keys()][0]!);
    addItems(storage!, CORE_TURNIP, 3, DEFAULT_STACK_SIZE);

    const result = world.commands.dispatch(
      { type: 'sellBuilding', building: id },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InvalidIntent);
    stepSimulation(world);

    expect(world.buildings.size).toBe(1); // still standing, goods intact
    expect(world.wallet.coins).toBe(800);
  });

  it('rejects an unknown building id', () => {
    const world = createWorld(1);
    const result = world.commands.dispatch(
      { type: 'sellBuilding', building: 999 },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
  });
});

describe('hiring charges the wallet (§4.1, interpretation 8)', () => {
  it('spends hireCost(0) = 150 on the first hire', () => {
    const world = createWorld(1);
    addCoins(world.wallet, 100); // 200 total
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    stepSimulation(world);

    expect(world.workers.size).toBe(1);
    expect(world.wallet.coins).toBe(50);
  });

  it('rejects an unaffordable hire and spawns nothing — the stage-2 gate', () => {
    const world = createWorld(1); // 100 < 150: a fresh farm cannot hire yet
    const result = world.commands.dispatch(
      { type: 'hireWorker' },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InsufficientFunds);
    stepSimulation(world);

    expect(world.workers.size).toBe(0);
    expect(world.wallet.coins).toBe(100);
  });

  it('escalates: the second hire costs hireCost(1) = 240', () => {
    const world = createWorld(1);
    addCoins(world.wallet, 500); // 600 total
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    stepSimulation(world); // -150 -> 450
    world.commands.dispatch({ type: 'hireWorker' }, { source: CommandSource.Player });
    stepSimulation(world); // -240 -> 210

    expect(world.workers.size).toBe(2);
    expect(world.wallet.coins).toBe(210);
  });
});

describe('grantCoins — the declared dev-only source', () => {
  it('credits the wallet through the ordinary command path', () => {
    const world = createWorld(1);
    world.commands.dispatch(
      { type: 'grantCoins', amount: 5_000 },
      { source: CommandSource.Automation },
    );
    stepSimulation(world);
    expect(world.wallet.coins).toBe(5_100);
  });

  it('rejects a non-positive or fractional amount', () => {
    const world = createWorld(1);
    for (const amount of [0, -50, 2.5]) {
      const result = world.commands.dispatch(
        { type: 'grantCoins', amount },
        { source: CommandSource.Automation },
      );
      expect(result.ok).toBe(false);
    }
    expect(world.wallet.coins).toBe(100);
  });
});
