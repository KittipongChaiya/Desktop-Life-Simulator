/**
 * What the logistics commands REFUSE. Phase-30 — ADR-036, ADR-010 §5.
 *
 * `haul-commands.ts` was the single largest branch gap in `src/sim` at the RC —
 * 45 uncovered branch points, better than half the file — and the reason is the
 * one the rest of this RC keeps finding: phase 26 proved the chain RUNS, over
 * 576,000 ticks, and never demonstrated what happens when it cannot.
 *
 * These are not hypothetical states. A player removes a shed a route points at;
 * a factory eats the goods a hauler was walking toward; a devtools command
 * carries a malformed id. Each one has a written refusal, and each was an
 * unverified claim.
 *
 * ## The two that are not refusals, and matter more
 *
 * `haulPickup` takes what is THERE rather than what was claimed, and
 * `haulDeliver` releases the worker's `hauling` even when the destination has
 * vanished. Both are the never-jam rule (ADR-036 §5): a chain must not strand a
 * worker because the world changed mid-journey. A reservation IS the task
 * (ADR-036 as amended), so a task that ends without clearing it is a leak that
 * no sweep exists to catch.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { toIndexUnchecked } from '../src/shared/geometry';
import { asBuildingId, asContentId, asWorkerId } from '../src/shared/ids';
import { placeBuilding } from '../src/sim/commands/building-commands';
import {
  addRoute,
  haulDeliver,
  haulPickup,
  removeRoute,
  validateAddRoute,
  validateHaulPickup,
} from '../src/sim/commands/haul-commands';
import { CommandSource } from '../src/sim/commands/types';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { CORE_MILL, CORE_REST_HUT, CORE_STORAGE_SHED } from '../src/sim/content/buildings';
import { CORE_WHEAT as CORE_WHEAT_ITEM } from '../src/sim/content/items';
import { addItems, containerCount } from '../src/sim/world/container';
import { asRouteId } from '../src/sim/world/route';
import { createWorld, type World } from '../src/sim/world/world';

/** A farm with a shed, a mill, and one hand. */
function chain(): {
  world: World;
  shed: ReturnType<typeof asBuildingId>;
  mill: ReturnType<typeof asBuildingId>;
} {
  const world = createWorld(4242);
  world.wallet.coins = 1_000_000;
  // Buildings have FOOTPRINTS since phase-41 (ADR-042 §3): the shed is 2x2,
  // the mill 3x3, the kitchen 3x2. The old layout put them two or three tiles
  // apart on one row, which was fine when each was a single tile and now either
  // overlaps or runs off the 8x8 starting plot (cols 28-35, rows 28-35). These
  // origins are the bottom-left of each footprint and do not collide.
  expect(placeBuilding(world, toIndexUnchecked(28, 31), CORE_STORAGE_SHED).ok).toBe(true);
  const shed = [...world.buildings.keys()].at(-1)!;
  expect(placeBuilding(world, toIndexUnchecked(31, 31), CORE_MILL).ok).toBe(true);
  const mill = [...world.buildings.keys()].at(-1)!;
  expect(hireWorker(world, toIndexUnchecked(33, 30)).ok).toBe(true);
  return { world, shed, mill };
}

const worker = (world: World): ReturnType<typeof asWorkerId> => [...world.workers.values()][0]!.id;

const NO_BUILDING = asBuildingId(9_999);
const NO_ROUTE = asRouteId(9_999);

describe('declaring a route refuses what could never run', () => {
  it('refuses a route to itself', () => {
    const { world, shed } = chain();

    expect(validateAddRoute(world, shed, shed, CORE_WHEAT_ITEM).ok).toBe(false);
  });

  it('refuses a source that was never placed', () => {
    const { world, mill } = chain();

    expect(validateAddRoute(world, NO_BUILDING, mill, CORE_WHEAT_ITEM).ok).toBe(false);
  });

  it('refuses a destination that was never placed', () => {
    const { world, shed } = chain();

    expect(validateAddRoute(world, shed, NO_BUILDING, CORE_WHEAT_ITEM).ok).toBe(false);
  });

  it('refuses an item nobody registered', () => {
    const { world, shed, mill } = chain();

    expect(validateAddRoute(world, shed, mill, asContentId('test:nothing')).ok).toBe(false);
  });

  it('refuses an endpoint nothing can be taken from', () => {
    // A rest hut holds no container, so a route out of it would be a standing
    // instruction that silently never runs — which to a player is a route that
    // does nothing, with no explanation (ADR-036 §2).
    const { world, mill } = chain();
    expect(placeBuilding(world, toIndexUnchecked(34, 31), CORE_REST_HUT).ok).toBe(true);
    const hut = [...world.buildings.keys()].at(-1)!;

    expect(validateAddRoute(world, hut, mill, CORE_WHEAT_ITEM).ok).toBe(false);
  });

  it('refuses an endpoint nothing can be given to', () => {
    const { world, shed } = chain();
    expect(placeBuilding(world, toIndexUnchecked(34, 31), CORE_REST_HUT).ok).toBe(true);
    const hut = [...world.buildings.keys()].at(-1)!;

    expect(validateAddRoute(world, shed, hut, CORE_WHEAT_ITEM).ok).toBe(false);
  });

  it('accepts a route with two real ends, and allocates an id', () => {
    const { world, shed, mill } = chain();

    expect(addRoute(world, shed, mill, CORE_WHEAT_ITEM).ok).toBe(true);
    expect(world.routes.size).toBe(1);
  });
});

describe('removing a route', () => {
  it('refuses one that does not exist', () => {
    expect(removeRoute(chain().world, NO_ROUTE).ok).toBe(false);
  });

  it('removes one that does', () => {
    const { world, shed, mill } = chain();
    addRoute(world, shed, mill, CORE_WHEAT_ITEM);
    const id = [...world.routes.keys()][0]!;

    expect(removeRoute(world, id).ok).toBe(true);
    expect(world.routes.size).toBe(0);
  });
});

describe('collecting refuses what it cannot collect', () => {
  it('refuses a worker who does not exist', () => {
    const { world, shed, mill } = chain();
    addRoute(world, shed, mill, CORE_WHEAT_ITEM);
    const id = [...world.routes.keys()][0]!;

    expect(validateHaulPickup(world, asWorkerId(9_999), id).ok).toBe(false);
  });

  it('refuses a route that does not exist', () => {
    const { world } = chain();

    expect(validateHaulPickup(world, worker(world), NO_ROUTE).ok).toBe(false);
  });

  it('refuses when the source has nothing left', () => {
    // The ordinary race: a factory consumed the goods between the worker
    // claiming them and arriving. Refusing is correct; the worker replans.
    const { world, shed, mill } = chain();
    addRoute(world, shed, mill, CORE_WHEAT_ITEM);
    const id = [...world.routes.keys()][0]!;

    expect(validateHaulPickup(world, worker(world), id).ok).toBe(false);
  });

  it('takes what is THERE rather than what was claimed', () => {
    // ADR-036 §5's never-jam rule. Moving less is correct; failing the whole
    // haul because the number changed would strand a chain over a race.
    const { world, shed, mill } = chain();
    addItems(world.buildingStorage.get(shed)!, CORE_WHEAT_ITEM, 3, 99);
    addRoute(world, shed, mill, CORE_WHEAT_ITEM);
    const id = [...world.routes.keys()][0]!;

    expect(haulPickup(world, worker(world), id).ok).toBe(true);

    const hauler = [...world.workers.values()][0]!;
    expect(containerCount(hauler.carrying, CORE_WHEAT_ITEM)).toBe(3);
    expect(hauler.hauling).toBe(id);
  });
});

describe('delivering never strands a hauler', () => {
  it('refuses a worker who does not exist', () => {
    const { world } = chain();

    expect(haulDeliver(world, asWorkerId(9_999), NO_ROUTE).ok).toBe(false);
  });

  it('releases the claim when the route vanished mid-journey', () => {
    // THE ONE THAT MATTERS. A reservation IS the task (ADR-036 as amended), so
    // a delivery that fails without clearing `hauling` is a leak with no sweep
    // to catch it — and the worker would carry a delivery nobody wants for the
    // rest of the game.
    const { world, shed, mill } = chain();
    addItems(world.buildingStorage.get(shed)!, CORE_WHEAT_ITEM, 3, 99);
    addRoute(world, shed, mill, CORE_WHEAT_ITEM);
    const id = [...world.routes.keys()][0]!;
    haulPickup(world, worker(world), id);
    world.routes.delete(id);

    expect(haulDeliver(world, worker(world), id).ok).toBe(false);
    expect([...world.workers.values()][0]!.hauling).toBeNull();
  });

  it('releases the claim when the destination building is gone', () => {
    const { world, shed, mill } = chain();
    addItems(world.buildingStorage.get(shed)!, CORE_WHEAT_ITEM, 3, 99);
    addRoute(world, shed, mill, CORE_WHEAT_ITEM);
    const id = [...world.routes.keys()][0]!;
    haulPickup(world, worker(world), id);
    world.buildings.delete(mill);
    world.buildingStorage.delete(mill);
    world.factories.delete(mill);

    expect(haulDeliver(world, worker(world), id).ok).toBe(false);
    expect([...world.workers.values()][0]!.hauling).toBeNull();
  });

  it('delivers, and releases the claim', () => {
    const { world, shed, mill } = chain();
    addItems(world.buildingStorage.get(shed)!, CORE_WHEAT_ITEM, 3, 99);
    addRoute(world, shed, mill, CORE_WHEAT_ITEM);
    const id = [...world.routes.keys()][0]!;
    haulPickup(world, worker(world), id);

    expect(haulDeliver(world, worker(world), id).ok).toBe(true);

    const hauler = [...world.workers.values()][0]!;
    expect(hauler.hauling).toBeNull();
    expect(containerCount(hauler.carrying, CORE_WHEAT_ITEM)).toBe(0);
    expect(containerCount(world.factories.get(mill)!.input, CORE_WHEAT_ITEM)).toBe(3);
  });
});

describe('the haul commands, through the dispatcher', () => {
  it('refuses a malformed building id', () => {
    const { world, mill } = chain();

    expect(
      world.commands.dispatch(
        { type: 'addRoute', from: 0, to: mill, item: 'core:wheat' },
        { source: CommandSource.Player },
      ).ok,
    ).toBe(false);
  });

  it('refuses a malformed item id', () => {
    const { world, shed, mill } = chain();

    expect(
      world.commands.dispatch(
        { type: 'addRoute', from: shed, to: mill, item: 'no-namespace' },
        { source: CommandSource.Player },
      ).ok,
    ).toBe(false);
  });

  it('refuses a malformed route id on removal', () => {
    const { world } = chain();

    expect(
      world.commands.dispatch({ type: 'removeRoute', route: 0 }, { source: CommandSource.Player })
        .ok,
    ).toBe(false);
  });

  it('accepts a well-formed route', () => {
    const { world, shed, mill } = chain();

    expect(
      world.commands.dispatch(
        { type: 'addRoute', from: shed, to: mill, item: 'core:wheat' },
        { source: CommandSource.Player },
      ).ok,
    ).toBe(true);
  });
});
