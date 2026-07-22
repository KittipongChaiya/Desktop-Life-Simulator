/**
 * Harvest → container resource flow. Phase-05b, ADR-011.
 *
 * Harvest is a source: it creates the yield into a container — the player
 * inventory for a player harvest, the worker's hold for a worker harvest. A
 * full destination blocks the harvest and destroys nothing (crit 4).
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asWorkerId, type TileIndex } from '../../shared/ids';
import { asContentId } from '../../shared/ids';
import { CORE_TURNIP } from '../content/crops';
import { DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation, stepSimulationBy } from '../tick';
import { addItems, containerCount, containerTotal } from '../world/container';
import { createWorker } from '../world/worker';
import { createWorld, type World } from '../world/world';

import { CommandSource } from './types';

const TILE = toIndexUnchecked(32, 32);

function matureTurnip(world: World, tile: TileIndex): void {
  world.crops.set(tile, { cropId: CORE_TURNIP, tile, plantedTick: 0 });
  world.tick = 100_000; // far past turnip growth
}

describe('player harvest deposits into the inventory (crit 1)', () => {
  it('adds the yield to the player inventory and removes the crop', () => {
    const world = createWorld(1);
    matureTurnip(world, TILE);

    world.commands.dispatch({ type: 'harvestCrop', tile: TILE }, { source: CommandSource.Player });
    stepSimulation(world);

    expect(containerCount(world.inventory, CORE_TURNIP)).toBe(1);
    expect(world.crops.has(TILE)).toBe(false);
  });
});

describe('a full inventory blocks harvest (crit 4)', () => {
  it('leaves the crop and adds nothing when the destination is full', () => {
    const world = createWorld(1);
    matureTurnip(world, TILE);
    // Fill every slot with wheat so a turnip has nowhere to go.
    const wheat = asContentId('core:wheat');
    for (let slot = 0; slot < world.inventory.capacity; slot += 1) {
      addItems(world.inventory, wheat, DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
    }

    world.commands.dispatch({ type: 'harvestCrop', tile: TILE }, { source: CommandSource.Player });
    stepSimulation(world);

    expect(world.crops.has(TILE)).toBe(true); // crop preserved, not discarded
    expect(containerCount(world.inventory, CORE_TURNIP)).toBe(0);
  });
});

describe('worker harvest → hold, then deposit → inventory', () => {
  it("a worker's harvest lands in its own hold", () => {
    const world = createWorld(1);
    const worker = createWorker(asWorkerId(1), TILE);
    world.workers.set(worker.id, worker);
    matureTurnip(world, TILE);

    stepSimulationBy(world, 45); // harvest action (30t) + submit + apply

    // The turnip is now in the worker's hold (below the deposit threshold of 10),
    // not the player inventory.
    expect(containerCount(worker.carrying, CORE_TURNIP)).toBeGreaterThanOrEqual(1);
  });

  it('deposits a full-enough hold into the player inventory', () => {
    const world = createWorld(1);
    const worker = createWorker(asWorkerId(1), TILE);
    // Pre-load the hold past the deposit threshold.
    addItems(worker.carrying, CORE_TURNIP, 12, DEFAULT_STACK_SIZE);
    world.workers.set(worker.id, worker);

    stepSimulationBy(world, 3); // idle → dispatch deposit → apply

    expect(containerTotal(worker.carrying)).toBe(0);
    expect(containerCount(world.inventory, CORE_TURNIP)).toBe(12);
  });
});
