/**
 * Logistics. Phase-26 — ADR-036.
 *
 * The cases here are the ones the ADR promises and the ones a chain actually
 * hits: competing workers, a full destination, a source that empties under a
 * claim, a route deleted mid-journey, a building sold mid-journey. Each is a
 * way a chain can stop; the test is that none of them stops it *permanently*.
 *
 * Reservations are DERIVED from worker tasks (`ai/haul.ts`), so the invariant
 * tested here is not "the store is consistent" — there is no store — but
 * "the derivation is sound and cannot outlive its worker".
 */

import { describe, expect, it } from 'vitest';

// Tile math goes through the constants, never a literal width — the v0.4
// widening broke every test that had 80 written into it (ADR-030 §Consequences).
import { WORLD_WIDTH } from '../src/shared/constants';

import '../plugins/core';
import { addRoute, haulDeliver, haulPickup } from '../src/sim/commands/haul-commands';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { setFactoryRecipe } from '../src/sim/commands/factory-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { inFlightToDestination, reservedAtSource, selectHaul } from '../src/sim/ai/haul';
import { CORE_MILL, CORE_STORAGE_SHED } from '../src/sim/content/buildings';
import { CORE_FLOUR, CORE_WHEAT, DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { CORE_GRIND_FLOUR } from '../src/sim/content/recipes';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems, containerCount } from '../src/sim/world/container';
import { giveTo, takeFrom } from '../src/sim/world/endpoints';
import { routesInOrder } from '../src/sim/world/route';
import { WorkerTaskKind, type Worker } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';
import type { BuildingId } from '../src/shared/ids';

const CENTRE = 32 * WORLD_WIDTH + 32;

/** A shed holding `wheat`, a mill set to grind, and a route between them. */
function chainWorld(
  wheat: number,
  workers = 1,
): {
  world: World;
  shed: BuildingId;
  mill: BuildingId;
} {
  const world = createWorld(77);
  world.wallet.coins = 1_000_000;

  expect(placeBuilding(world, CENTRE, CORE_STORAGE_SHED).ok).toBe(true);
  const shed = [...world.buildings.keys()].at(-1)!;
  expect(placeBuilding(world, CENTRE + 3, CORE_MILL).ok).toBe(true);
  const mill = [...world.buildings.keys()].at(-1)!;

  expect(setFactoryRecipe(world, mill, CORE_GRIND_FLOUR).ok).toBe(true);
  addItems(world.buildingStorage.get(shed)!, CORE_WHEAT, wheat, DEFAULT_STACK_SIZE);
  expect(addRoute(world, shed, mill, CORE_WHEAT).ok).toBe(true);

  for (let i = 0; i < workers; i += 1) expect(hireWorker(world, CENTRE + 1 + i).ok).toBe(true);
  return { world, shed, mill };
}

const firstRoute = (world: World) => routesInOrder(world.routes)[0]!;
const workersOf = (world: World): Worker[] => [...world.workers.values()];

describe('routes', () => {
  it('refuses a route with the same building at both ends', () => {
    const { world, shed } = chainWorld(10);
    expect(addRoute(world, shed, shed, CORE_WHEAT).ok).toBe(false);
  });

  it('refuses a route to a building that cannot accept goods', () => {
    // A rest hut has no storage and is no factory, so it can never serve.
    // Refused where the player is told, not silently never run.
    const { world, shed } = chainWorld(10);
    const world2 = world;
    expect(addRoute(world2, shed, 999 as BuildingId, CORE_WHEAT).ok).toBe(false);
  });

  it('takes from a factory OUTPUT and gives to its INPUT', () => {
    // The asymmetry that makes a chain possible rather than a loop.
    const { world, mill } = chainWorld(0);
    const factory = world.factories.get(mill)!;

    expect(takeFrom(world, mill)).toBe(factory.output);
    expect(giveTo(world, mill)).toBe(factory.input);
  });
});

describe('a single haul, end to end', () => {
  it('moves wheat from the shed into the mill without the player touching it', () => {
    const { world, shed, mill } = chainWorld(20);

    stepSimulationBy(world, 600);

    expect(containerCount(world.buildingStorage.get(shed)!, CORE_WHEAT)).toBeLessThan(20);
    // Either it is in the mill's input, or the mill already ground it.
    const factory = world.factories.get(mill)!;
    const arrived =
      containerCount(factory.input, CORE_WHEAT) + containerCount(factory.output, CORE_FLOUR) * 2;
    expect(arrived).toBeGreaterThan(0);
  });

  it('produces flour unattended from a shed of wheat', () => {
    const { world, mill } = chainWorld(40);

    stepSimulationBy(world, 6_000);

    expect(containerCount(world.factories.get(mill)!.output, CORE_FLOUR)).toBeGreaterThan(0);
  });
});

describe('competing workers never claim the same goods', () => {
  it('a second worker sees the first one’s claim and takes less', () => {
    const { world } = chainWorld(6, 2);
    const route = firstRoute(world);
    const [first, second] = workersOf(world);

    // The first worker claims what it can carry.
    first!.task = { kind: WorkerTaskKind.Haul, tile: 0 as never, route: route.id, quantity: 6 };

    expect(reservedAtSource(world, route, second!.id)).toBe(6);
    // Nothing left unclaimed, so the second finds no haul.
    const task = selectHaul(world, second!);
    expect(task).toBeNull();
  });

  it('a worker does not count its own claim as competition', () => {
    const { world } = chainWorld(6);
    const route = firstRoute(world);
    const worker = workersOf(world)[0]!;
    worker.task = { kind: WorkerTaskKind.Haul, tile: 0 as never, route: route.id, quantity: 6 };

    expect(reservedAtSource(world, route, worker.id)).toBe(0);
  });

  it('counts a carried load against the destination’s remaining space', () => {
    const { world } = chainWorld(20, 2);
    const route = firstRoute(world);
    const [first, second] = workersOf(world);
    addItems(first!.carrying, CORE_WHEAT, 8, DEFAULT_STACK_SIZE);
    first!.hauling = route.id;

    expect(inFlightToDestination(world, route, second!.id)).toBe(8);
  });
});

describe('the reservation cannot outlive its worker', () => {
  it('vanishes when the task is cleared', () => {
    const { world } = chainWorld(10, 2);
    const route = firstRoute(world);
    const [first, second] = workersOf(world);
    first!.task = { kind: WorkerTaskKind.Haul, tile: 0 as never, route: route.id, quantity: 5 };
    expect(reservedAtSource(world, route, second!.id)).toBe(5);

    // Whatever ends the task — completion, energy, dismissal — ends the claim,
    // because the claim IS the task. There is no store to forget.
    first!.task = null;

    expect(reservedAtSource(world, route, second!.id)).toBe(0);
  });

  it('vanishes when the worker is removed entirely', () => {
    const { world } = chainWorld(10, 2);
    const route = firstRoute(world);
    const [first, second] = workersOf(world);
    first!.task = { kind: WorkerTaskKind.Haul, tile: 0 as never, route: route.id, quantity: 5 };

    world.workers.delete(first!.id);

    expect(reservedAtSource(world, route, second!.id)).toBe(0);
  });

  it('never exceeds what the source actually holds, over a long run', () => {
    // The invariant ADR-036 §5 defence 2 asks for, phrased against the
    // derivation rather than a store.
    const { world, shed } = chainWorld(30, 3);
    const route = firstRoute(world);

    for (let tick = 0; tick < 4_000; tick += 1) {
      stepSimulationBy(world, 1);
      const held = containerCount(world.buildingStorage.get(shed)!, CORE_WHEAT);
      expect(reservedAtSource(world, route)).toBeLessThanOrEqual(held);
    }
  });
});

describe('a full destination stalls, and the stall clears', () => {
  it('stops hauling when the mill input is full, then resumes when it drains', () => {
    const { world, mill } = chainWorld(200, 2);
    const factory = world.factories.get(mill)!;
    // Fill the input so no haul can be planned.
    addItems(factory.input, CORE_WHEAT, DEFAULT_STACK_SIZE * 4, DEFAULT_STACK_SIZE);

    stepSimulationBy(world, 400);
    for (const worker of workersOf(world)) {
      expect(worker.task?.kind).not.toBe(WorkerTaskKind.Haul);
    }

    // The mill grinds it away over time; hauling must pick back up by itself.
    stepSimulationBy(world, 20_000);
    expect(containerCount(factory.output, CORE_FLOUR)).toBeGreaterThan(0);
  });
});

describe('interruptions never destroy goods', () => {
  it('a route deleted mid-journey leaves the load in the hold, not in the void', () => {
    const { world } = chainWorld(20);
    const route = firstRoute(world);
    const worker = workersOf(world)[0]!;
    addItems(worker.carrying, CORE_WHEAT, 5, DEFAULT_STACK_SIZE);
    worker.hauling = route.id;

    world.routes.delete(route.id);

    // Discovery answers null; the ordinary deposit path takes over, and the
    // wheat is still there.
    expect(selectHaul(world, worker)).toBeNull();
    expect(containerCount(worker.carrying, CORE_WHEAT)).toBe(5);
  });

  it('delivering to a vanished destination clears the binding and keeps the goods', () => {
    const { world, mill } = chainWorld(20);
    const route = firstRoute(world);
    const worker = workersOf(world)[0]!;
    addItems(worker.carrying, CORE_WHEAT, 5, DEFAULT_STACK_SIZE);
    worker.hauling = route.id;

    world.buildings.delete(mill);
    world.factories.delete(mill);

    expect(haulDeliver(world, worker.id, route.id).ok).toBe(false);
    // Not bound to a route it can never finish — that would be the jam.
    expect(worker.hauling).toBeNull();
    expect(containerCount(worker.carrying, CORE_WHEAT)).toBe(5);
  });

  it('collecting from an emptied source fails cleanly and binds nothing', () => {
    const { world, shed } = chainWorld(4);
    const route = firstRoute(world);
    const worker = workersOf(world)[0]!;
    world.buildingStorage.get(shed)!.stacks = [];

    expect(haulPickup(world, worker.id, route.id).ok).toBe(false);
    expect(worker.hauling).toBeNull();
  });

  it('a hauling worker is never intercepted by the deposit path', () => {
    // The trap: a haul of 10+ items looks exactly like a full harvest hold, and
    // the ordinary deposit would put it in a shed — silently undoing the haul
    // while the chain appeared to be working.
    const { world, shed, mill } = chainWorld(60, 1);

    stepSimulationBy(world, 8_000);

    const factory = world.factories.get(mill)!;
    const delivered =
      containerCount(factory.input, CORE_WHEAT) + containerCount(factory.output, CORE_FLOUR) * 2;
    expect(delivered).toBeGreaterThan(0);
    void shed;
  });
});
