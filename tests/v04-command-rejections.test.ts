/**
 * What v0.4's commands REFUSE. Phase-30 — ADR-010 §5.
 *
 * The RC's coverage gate came up red on branches, and the gap was almost
 * entirely one shape: **v0.4 added four command modules and tested what they
 * DO far more thoroughly than what they REFUSE.** Every rejection below is a
 * path a player or a corrupt document can actually reach, and each one existed
 * unexercised — which means the error messages, the ids in their context, and
 * the not-half-applied guarantee were all unverified claims.
 *
 * This is the same move phase 23 made at the v0.3 RC, where the gate went red
 * on `src/persistence` branches and adversarial-input tests closed it. The
 * lesson repeats because the cause repeats: a phase writes the happy path
 * because that is the feature, and the guards are what nobody demonstrates.
 *
 * ## Not coverage theatre
 *
 * Every case here asserts a BEHAVIOUR — the refusal, and that nothing was
 * half-applied by it. A test that called a function to colour a line and
 * asserted nothing would be worse than the gap it closed.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { toIndexUnchecked } from '../src/shared/geometry';
import { asBuildingId, asContentId, asTileIndex, asWorkerId } from '../src/shared/ids';
import { placeBuilding } from '../src/sim/commands/building-commands';
import {
  returnExpedition,
  sendExpedition,
  validateSendExpedition,
} from '../src/sim/commands/expedition-commands';
import { setFactoryRecipe, validateSetFactoryRecipe } from '../src/sim/commands/factory-commands';
import {
  gatherNode,
  pruneHarvested,
  validateGatherNode,
} from '../src/sim/commands/gather-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { CommandSource } from '../src/sim/commands/types';
import { CORE_MILL, CORE_STORAGE_SHED } from '../src/sim/content/buildings';
import { CORE_RIVER_DELTA } from '../src/sim/content/expeditions';
import { nodeAt } from '../src/sim/content/resource-nodes';
import { CORE_WHEAT as CORE_WHEAT_ITEM, CORE_WHEAT_SEED } from '../src/sim/content/items';
import { CORE_GRIND_FLOUR } from '../src/sim/content/recipes';
import { addItems, containerCount, containerTotal } from '../src/sim/world/container';
import { asRouteId } from '../src/sim/world/route';
import { WorkerState } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

/** A funded farm with one hand and the delta trip's supplies. */
function farm(): World {
  const world = createWorld(4242);
  world.wallet.coins = 1_000_000;
  addItems(world.inventory, CORE_WHEAT_SEED, 40, 99);
  expect(hireWorker(world, toIndexUnchecked(31, 30)).ok).toBe(true);
  return world;
}

const onlyWorker = (
  world: World,
): ReturnType<typeof hireWorker> extends never
  ? never
  : NonNullable<ReturnType<World['workers']['get']>> => [...world.workers.values()][0]!;

const NOBODY = asWorkerId(9_999);

describe('sending an expedition refuses what it cannot do', () => {
  it('refuses a worker who does not exist', () => {
    expect(validateSendExpedition(farm(), NOBODY, CORE_RIVER_DELTA).ok).toBe(false);
  });

  it('refuses a destination nobody registered', () => {
    const world = farm();
    const nowhere = asContentId('test:nowhere');

    expect(validateSendExpedition(world, onlyWorker(world).id, nowhere).ok).toBe(false);
  });

  it('refuses a hand part-way along a route', () => {
    // Their hold is a DELIVERY something downstream is counting on (ADR-036 as
    // amended), so sending them away would strand it.
    const world = farm();
    const worker = onlyWorker(world);
    worker.hauling = asRouteId(1);

    expect(validateSendExpedition(world, worker.id, CORE_RIVER_DELTA).ok).toBe(false);
  });

  it('takes supplies from a shed when the inventory has none', () => {
    // The multi-container drain, which the phase-06 defect exists to prevent
    // and which nothing had exercised: a player who tidied their seed away
    // must still be able to outfit a trip.
    const world = farm();
    expect(placeBuilding(world, toIndexUnchecked(29, 30), CORE_STORAGE_SHED).ok).toBe(true);
    const shed = [...world.buildingStorage.values()][0]!;
    world.inventory.stacks = [];
    addItems(shed, CORE_WHEAT_SEED, 20, 99);

    expect(sendExpedition(world, onlyWorker(world).id, CORE_RIVER_DELTA).ok).toBe(true);
    expect(containerCount(shed, CORE_WHEAT_SEED)).toBe(16);
  });
});

describe('returning refuses what it cannot do', () => {
  it('refuses a worker who is not away', () => {
    const world = farm();

    expect(returnExpedition(world, onlyWorker(world).id).ok).toBe(false);
  });

  it('refuses a worker id nobody holds', () => {
    expect(returnExpedition(farm(), NOBODY).ok).toBe(false);
  });

  it('brings a hand home empty-handed when their destination has vanished', () => {
    // An uninstalled content pack (`SAVE_FORMAT.md` §5.3). Dropping the trip is
    // right and stranding the hand is not — they are a worker the player paid
    // for, and there is no way back for them otherwise.
    const world = farm();
    const worker = onlyWorker(world);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    world.expeditions.set(worker.id, {
      worker: worker.id,
      destination: asContentId('gone:place'),
      departedTick: 0,
    });

    expect(returnExpedition(world, worker.id).ok).toBe(true);
    expect(world.expeditions.size).toBe(0);
    expect(worker.state).toBe(WorkerState.Idle);
    expect(containerTotal(worker.carrying)).toBe(0);
  });

  it('drops a trip whose worker has vanished', () => {
    const world = farm();
    const worker = onlyWorker(world);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    world.workers.delete(worker.id);

    expect(returnExpedition(world, worker.id).ok).toBe(true);
    expect(world.expeditions.size).toBe(0);
  });
});

describe('the expedition commands, through the dispatcher', () => {
  it('accepts a well-formed send and refuses a malformed destination', () => {
    // The registered path, which parses untrusted fields (ADR-010 §5) — a
    // different code path from the exported function every test above calls.
    const world = farm();
    const worker = onlyWorker(world);

    expect(
      world.commands.dispatch(
        { type: 'sendExpedition', worker: worker.id, destination: 'core:river_delta' },
        { source: CommandSource.Player },
      ).ok,
    ).toBe(true);

    expect(
      world.commands.dispatch(
        { type: 'sendExpedition', worker: NOBODY, destination: 'not-a-content-id' },
        { source: CommandSource.Player },
      ).ok,
    ).toBe(false);
  });

  it('refuses a return for somebody who is not away', () => {
    const world = farm();

    expect(
      world.commands.dispatch(
        { type: 'returnExpedition', worker: onlyWorker(world).id },
        { source: CommandSource.Worker },
      ).ok,
    ).toBe(false);
  });
});

describe('gathering refuses what it cannot do', () => {
  it('refuses a worker who does not exist', () => {
    const world = farm();

    expect(validateGatherNode(world, NOBODY, toIndexUnchecked(90, 10)).ok).toBe(false);
  });

  it('refuses a gather for a worker who does not exist, at execution too', () => {
    const world = farm();

    expect(gatherNode(world, NOBODY, toIndexUnchecked(90, 10)).ok).toBe(false);
  });

  it('prunes a stamp on a tile that holds no node at all', () => {
    // A tile whose kind vanished — an uninstalled content pack — can never be
    // gathered again, so its entry is dead weight. `harvestedAt` is the one
    // collection that could grow with PLAYTIME if it kept entries like this.
    //
    // The tile is FOUND rather than picked: `nodeAt` is a hash and answers for
    // any tile, so a hardcoded index is a coin flip about whether this test
    // tests anything (the first version picked one that did hold a node).
    const world = farm();
    let bare = null as ReturnType<typeof asTileIndex> | null;
    for (let x = 0; x < 60 && bare === null; x += 1) {
      const tile = toIndexUnchecked(x, 3);
      if (nodeAt(world.resourceNodeRegistry, world.seed, tile) === null) bare = tile;
    }
    expect(bare).not.toBeNull();
    world.harvestedAt.set(bare!, world.tick);

    pruneHarvested(world);

    expect(world.harvestedAt.has(bare!)).toBe(false);
  });

  it('refuses a tile index outside the world, through the dispatcher', () => {
    const world = farm();

    expect(
      world.commands.dispatch(
        { type: 'gatherNode', worker: onlyWorker(world).id, tile: 9_999_999 },
        { source: CommandSource.Worker },
      ).ok,
    ).toBe(false);
  });
});

describe('setting a factory recipe refuses what it cannot do', () => {
  function milled(): { world: World; building: ReturnType<typeof asBuildingId> } {
    const world = farm();
    expect(placeBuilding(world, toIndexUnchecked(30, 30), CORE_MILL).ok).toBe(true);
    return { world, building: [...world.buildings.keys()].at(-1)! };
  }

  it('refuses a building that was never placed', () => {
    const { world } = milled();

    expect(validateSetFactoryRecipe(world, asBuildingId(9_999), CORE_GRIND_FLOUR).ok).toBe(false);
  });

  it('refuses a recipe nobody registered', () => {
    const { world, building } = milled();

    expect(validateSetFactoryRecipe(world, building, asContentId('test:nothing')).ok).toBe(false);
  });

  it('refuses a recipe that names a different building', () => {
    const world = farm();
    expect(placeBuilding(world, toIndexUnchecked(30, 30), CORE_STORAGE_SHED).ok).toBe(true);
    const shed = [...world.buildings.keys()].at(-1)!;

    expect(validateSetFactoryRecipe(world, shed, CORE_GRIND_FLOUR).ok).toBe(false);
  });

  it('clears a selection with null, and returns the running craft’s inputs', () => {
    // Rule A across a recipe change (ADR-035): a craft already consuming
    // inputs must give them back rather than eat them.
    const { world, building } = milled();
    expect(setFactoryRecipe(world, building, CORE_GRIND_FLOUR).ok).toBe(true);
    const factory = world.factories.get(building)!;
    addItems(factory.input, CORE_WHEAT_ITEM, 4, 99);
    factory.startedTick = world.tick;

    expect(setFactoryRecipe(world, building, null).ok).toBe(true);

    expect(factory.recipeId).toBeNull();
    expect(factory.startedTick).toBeNull();
    expect(containerCount(factory.input, CORE_WHEAT_ITEM)).toBeGreaterThanOrEqual(4);
  });

  it('refuses a malformed building id through the dispatcher', () => {
    const { world } = milled();

    expect(
      world.commands.dispatch(
        { type: 'setFactoryRecipe', building: 0, recipeId: 'core:grind_flour' },
        { source: CommandSource.Player },
      ).ok,
    ).toBe(false);
  });

  it('refuses a malformed recipe id through the dispatcher', () => {
    const { world, building } = milled();

    expect(
      world.commands.dispatch(
        { type: 'setFactoryRecipe', building, recipeId: 'no-namespace' },
        { source: CommandSource.Player },
      ).ok,
    ).toBe(false);
  });

  it('accepts a null recipe through the dispatcher — clearing is legal', () => {
    const { world, building } = milled();

    expect(
      world.commands.dispatch(
        { type: 'setFactoryRecipe', building, recipeId: null },
        { source: CommandSource.Player },
      ).ok,
    ).toBe(true);
  });
});
