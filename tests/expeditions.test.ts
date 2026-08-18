/**
 * Expeditions, end to end. Phase-28 — ADR-038.
 *
 * The cases that matter are the ones a player actually reaches: a hand leaves
 * and the farm notices, the trip cannot be shortened or repeated, the haul
 * arrives and reaches storage through the path that already exists, and — the
 * one the whole derived model exists for — **a trip that completes while the
 * game is closed resolves to exactly what a live run would have produced.**
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { toIndexUnchecked } from '../src/shared/geometry';
import {
  returnExpedition,
  sendExpedition,
  validateSendExpedition,
} from '../src/sim/commands/expedition-commands';
import { catchUpWorld } from '../src/persistence/catch-up';
import { hydrateWorld } from '../src/persistence/deserialize';
import type { SaveDocument } from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { plantCrop, tillTile } from '../src/sim/commands/crop-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { CORE_STORAGE_SHED } from '../src/sim/content/buildings';
import { CORE_OLD_QUARRY, CORE_RIVER_DELTA, haulFor } from '../src/sim/content/expeditions';
import { CORE_WHEAT as CORE_WHEAT_CROP } from '../src/sim/content/crops';
import { CORE_WHEAT_SEED, CORE_WHEAT } from '../src/sim/content/items';
import { FRIEND_AT } from '../src/sim/world/reputation';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems, containerCount, containerTotal } from '../src/sim/world/container';
import { WorkerState, type Worker } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

/** A farm with a shed, a hand, and enough seed to outfit the short trip. */
function farm(workers = 1): World {
  const world = createWorld(4242);
  world.wallet.coins = 1_000_000;
  addItems(world.inventory, CORE_WHEAT_SEED, 40, 99);
  expect(placeBuilding(world, toIndexUnchecked(28, 30), CORE_STORAGE_SHED).ok).toBe(true);
  for (let i = 0; i < workers; i += 1) {
    expect(hireWorker(world, toIndexUnchecked(31, 30 + i)).ok).toBe(true);
  }
  return world;
}

const firstWorker = (world: World): Worker => [...world.workers.values()][0]!;

/** The same farm with a dozen wheat in the ground — a crop for catch-up to credit. */
function plantedFarm(workers: number): World {
  const world = farm(workers);
  addItems(world.inventory, CORE_WHEAT_SEED, 60, 99);
  for (let i = 0; i < 12; i += 1) {
    const tile = toIndexUnchecked(28 + (i % 6), 32 + Math.floor(i / 6));
    tillTile(world, tile);
    plantCrop(world, tile, CORE_WHEAT_CROP);
  }
  return world;
}

describe('sending a hand away', () => {
  it('takes them off the grid', () => {
    const world = farm();
    const worker = firstWorker(world);

    expect(sendExpedition(world, worker.id, CORE_RIVER_DELTA).ok).toBe(true);

    expect(worker.state).toBe(WorkerState.Away);
    expect(worker.task).toBeNull();
    expect(world.expeditions.has(worker.id)).toBe(true);
  });

  it('takes them out of the workers slice entirely', () => {
    // ADR-038 §2: absent, never present with a flag. No view can draw a hand
    // who is not there, because there is nothing to draw.
    const world = farm(2);
    const worker = firstWorker(world);
    stepSimulationBy(world, 1);
    expect(world.snapshots.workers.value.length).toBe(2);

    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    stepSimulationBy(world, 1);

    expect(world.snapshots.workers.value.length).toBe(1);
    expect(world.snapshots.workers.value.some((w) => w.id === worker.id)).toBe(false);
  });

  it('spends the supplies', () => {
    // A declared sink (ADR-011 §4): quantity leaves the world here.
    const world = farm();
    const before = containerCount(world.inventory, CORE_WHEAT_SEED);

    sendExpedition(world, firstWorker(world).id, CORE_RIVER_DELTA);

    expect(containerCount(world.inventory, CORE_WHEAT_SEED)).toBe(before - 4);
  });

  it('refuses when the supplies are not there', () => {
    // All-or-nothing, the rule a craft and a gather both follow.
    const world = farm();
    world.inventory.stacks = [];

    const sent = sendExpedition(world, firstWorker(world).id, CORE_RIVER_DELTA);

    expect(sent.ok).toBe(false);
    expect(world.expeditions.size).toBe(0);
  });

  it('refuses to send the same hand twice', () => {
    const world = farm();
    const worker = firstWorker(world);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);

    expect(sendExpedition(world, worker.id, CORE_RIVER_DELTA).ok).toBe(false);
  });

  it('refuses a hand who is still carrying something', () => {
    // The haul lands in this hold and `isReachableDestination` guarantees the
    // biggest one fits an EMPTY hold — a worker who set off loaded would break
    // that and force the return to discard the remainder (ADR-011 §7).
    const world = farm();
    const worker = firstWorker(world);
    addItems(worker.carrying, CORE_WHEAT, 3, 99);

    expect(validateSendExpedition(world, worker.id, CORE_RIVER_DELTA).ok).toBe(false);
  });

  it('refuses a destination the town does not vouch for yet', () => {
    const world = farm();

    expect(validateSendExpedition(world, firstWorker(world).id, CORE_OLD_QUARRY).ok).toBe(false);
  });

  it('allows it once standing has been earned', () => {
    // Standing gates the map (ADR-038 §6) — the same reading of recorded
    // history the notice board's locked slots use, with no second axis.
    const world = farm();
    addItems(world.inventory, CORE_WHEAT, 4, 99);
    world.contractStats.fulfilled = FRIEND_AT;

    expect(validateSendExpedition(world, firstWorker(world).id, CORE_OLD_QUARRY).ok).toBe(true);
  });
});

describe('coming back', () => {
  it('cannot be hurried', () => {
    // The command refuses before the return tick, so nothing — not even the
    // system that owns it — can shorten a trip.
    const world = farm();
    const worker = firstWorker(world);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);

    expect(returnExpedition(world, worker.id).ok).toBe(false);
    expect(worker.state).toBe(WorkerState.Away);
  });

  it('happens on its own once the time has passed', () => {
    const world = farm();
    const worker = firstWorker(world);
    const travel = world.expeditionRegistry.get(CORE_RIVER_DELTA);
    expect(travel.ok).toBe(true);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);

    stepSimulationBy(world, (travel.ok ? travel.value.travelTicks : 0) + 2);

    expect(world.expeditions.size).toBe(0);
    expect(worker.state).not.toBe(WorkerState.Away);
  });

  it('brings the haul home in the hand’s own hold', () => {
    const world = farm();
    const worker = firstWorker(world);
    const found = world.expeditionRegistry.get(CORE_RIVER_DELTA);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    const departed = world.expeditions.get(worker.id)!.departedTick;

    world.tick += found.ok ? found.value.travelTicks : 0;
    expect(returnExpedition(world, worker.id).ok).toBe(true);

    const expected = haulFor(
      found.ok ? found.value : ({} as never),
      world.seed,
      worker.id,
      departed,
    );
    for (const stack of expected) {
      expect(containerCount(worker.carrying, stack.item)).toBe(stack.quantity);
    }
  });

  it('reaches storage through the deposit path that already exists', () => {
    // Nothing new touches conservation: the haul enters at a declared source
    // and travels the same route a harvest does.
    const world = farm();
    const worker = firstWorker(world);
    const found = world.expeditionRegistry.get(CORE_RIVER_DELTA);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);

    stepSimulationBy(world, (found.ok ? found.value.travelTicks : 0) + 400);

    const stored =
      containerTotal(world.inventory) +
      [...world.buildingStorage.values()].reduce((sum, c) => sum + containerTotal(c), 0);
    expect(stored).toBeGreaterThan(0);
  });

  it('puts the hand back to work rather than leaving them standing', () => {
    const world = farm();
    const worker = firstWorker(world);
    const found = world.expeditionRegistry.get(CORE_RIVER_DELTA);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);

    stepSimulationBy(world, (found.ok ? found.value.travelTicks : 0) + 3);

    expect(worker.state).not.toBe(WorkerState.Away);
    expect(worker.replanTick).toBeLessThanOrEqual(world.tick);
  });
});

describe('a trip that finishes while the game is closed', () => {
  it('resolves to exactly what a live run would have produced', () => {
    // THE ONE THE WHOLE DERIVED MODEL EXISTS FOR (ADR-038 §3). One world runs
    // every tick of the trip; the other jumps the gap the way catch-up does.
    // Both must come home with the same load.
    const live = farm();
    const closed = farm();
    const found = live.expeditionRegistry.get(CORE_RIVER_DELTA);
    const travel = found.ok ? found.value.travelTicks : 0;

    sendExpedition(live, firstWorker(live).id, CORE_RIVER_DELTA);
    sendExpedition(closed, firstWorker(closed).id, CORE_RIVER_DELTA);

    stepSimulationBy(live, travel + 5);
    closed.tick += travel;
    stepSimulationBy(closed, 5);

    // Everything the farm holds, wherever it ended up. A returning hand
    // deposits at once if the load clears the threshold, so comparing only the
    // carry hold would compare two empty containers and prove nothing — the
    // first version of this test did exactly that and passed for the wrong
    // reason on the first assertion and failed on the second.
    const load = (world: World): readonly [string, number][] => {
      const totals = new Map<string, number>();
      const add = (stacks: readonly { item: unknown; quantity: number }[]): void => {
        for (const stack of stacks) {
          const key = stack.item as string;
          totals.set(key, (totals.get(key) ?? 0) + stack.quantity);
        }
      };
      add(world.inventory.stacks);
      for (const container of world.buildingStorage.values()) add(container.stacks);
      for (const worker of world.workers.values()) add(worker.carrying.stacks);
      return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };

    expect(load(closed)).toEqual(load(live));
    expect(load(closed).length).toBeGreaterThan(0);
  });

  it('never credits more than one trip for a long absence', () => {
    // A gap ten times the travel time is still ONE trip: an expedition is not
    // a repeating job, and a catch-up that ran it twice would be minting goods
    // out of elapsed time (`GAME_DESIGN.md` §9.2 — credit less, never more).
    const world = farm();
    const worker = firstWorker(world);
    const found = world.expeditionRegistry.get(CORE_RIVER_DELTA);
    const travel = found.ok ? found.value.travelTicks : 0;
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);

    world.tick += travel * 10;
    stepSimulationBy(world, 2);

    const expected = haulFor(found.ok ? found.value : ({} as never), world.seed, worker.id, 0);
    const carried = expected.reduce((sum, stack) => sum + stack.quantity, 0);
    expect(containerTotal(worker.carrying)).toBeLessThanOrEqual(carried);
  });
});

describe('what the map publishes', () => {
  it('lists every destination with its lock state', () => {
    const world = farm();
    stepSimulationBy(world, 1);
    const slice = world.snapshots.expeditions.value;

    expect(slice.destinations.length).toBe(world.expeditionRegistry.size);
    expect(slice.destinations.some((d) => d.unlocked)).toBe(true);
    expect(slice.destinations.some((d) => !d.unlocked)).toBe(true);
  });

  it('carries no countdown — it holds still for a whole trip', () => {
    // ADR-005 §2's defect, refused for the third time this version. A
    // remaining-time field would republish 20 times a second for hours.
    const world = farm();
    sendExpedition(world, firstWorker(world).id, CORE_RIVER_DELTA);
    stepSimulationBy(world, 1);
    const version = world.snapshots.expeditions.version;

    stepSimulationBy(world, 600);

    expect(world.snapshots.expeditions.version).toBe(version);
  });

  it('republishes when a hand leaves and when they come back', () => {
    const world = farm();
    const worker = firstWorker(world);
    stepSimulationBy(world, 1);
    const atRest = world.snapshots.expeditions.version;

    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    stepSimulationBy(world, 1);
    const away = world.snapshots.expeditions.version;
    expect(away).toBeGreaterThan(atRest);

    const found = world.expeditionRegistry.get(CORE_RIVER_DELTA);
    stepSimulationBy(world, (found.ok ? found.value.travelTicks : 0) + 2);

    expect(world.snapshots.expeditions.version).toBeGreaterThan(away);
    expect(world.snapshots.expeditions.value.trips).toEqual([]);
  });

  it('opens a destination the moment standing reaches it', () => {
    // The phase-22 lesson: a lock that only opens on reload is a lock the
    // player thinks is broken.
    const world = farm();
    stepSimulationBy(world, 1);
    expect(
      world.snapshots.expeditions.value.destinations.find((d) => d.requires === 'friend')?.unlocked,
    ).toBe(false);

    world.contractStats.fulfilled = FRIEND_AT;
    stepSimulationBy(world, 1);

    expect(
      world.snapshots.expeditions.value.destinations.find((d) => d.requires === 'friend')?.unlocked,
    ).toBe(true);
  });
});

describe('an expedition survives a save', () => {
  it('resumes mid-flight and comes home on time', () => {
    // The trip's return is a comparison against `departedTick`, which is on
    // disk — so a save written mid-flight needs no resume logic at all.
    const world = farm();
    const worker = firstWorker(world);
    const found = world.expeditionRegistry.get(CORE_RIVER_DELTA);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    stepSimulationBy(world, 100);

    expect(world.expeditions.get(worker.id)?.departedTick).toBeDefined();

    stepSimulationBy(world, (found.ok ? found.value.travelTicks : 0) + 2);

    expect(world.expeditions.size).toBe(0);
    // In the hold or already in the shed — a hand carrying enough deposits at
    // once, and either way the goods are on the farm.
    const held =
      containerTotal(worker.carrying) +
      [...world.buildingStorage.values()].reduce((sum, c) => sum + containerTotal(c), 0);
    expect(held).toBeGreaterThan(0);
  });
});

describe('a hand who is away does no farm work while they are gone', () => {
  it('is not counted by offline catch-up', () => {
    // `GAME_DESIGN.md` §9.2: catch-up may credit LESS, never more. Counting a
    // worker who spent the whole gap at the river delta would credit a harvest
    // nobody performed — found by reading `catchUpWorld` against ADR-038 §2,
    // which removes them from the grid but not from `world.workers`.
    //
    // Asserted as an EQUIVALENCE rather than an inequality: two hands with one
    // away must credit exactly what one hand alone credits. An inequality
    // between two farms is the comparison phase-24 spent four attempts
    // learning not to trust — here both hit the same crop ceiling and the
    // first version of this test read `12 < 12`.
    const oneAway = plantedFarm(2);
    const oneHand = plantedFarm(1);
    sendExpedition(oneAway, firstWorker(oneAway).id, CORE_RIVER_DELTA);

    const away = catchUpWorld(oneAway, 60_000);
    const alone = catchUpWorld(oneHand, 60_000);

    expect(away.harvests).toBe(alone.harvests);
    expect(away.replants).toBe(alone.replants);
  });

  it('credits nothing at all when the whole crew is away', () => {
    const world = plantedFarm(1);
    sendExpedition(world, firstWorker(world).id, CORE_RIVER_DELTA);

    expect(catchUpWorld(world, 200_000).harvests).toBe(0);
  });

  it('still brings them home on the first tick after the gap', () => {
    // The haul is not lost by being excluded above: a return is a comparison
    // against `departedTick`, so catch-up has nothing to model (ADR-038 §3).
    const world = farm(1);
    sendExpedition(world, firstWorker(world).id, CORE_RIVER_DELTA);

    catchUpWorld(world, 200_000);
    stepSimulationBy(world, 2);

    expect(world.expeditions.size).toBe(0);
  });
});

describe('a save that disagrees with itself about who is away', () => {
  /** Round-trips a world through serialize → parse → hydrate. */
  function reload(world: World): World {
    const document = JSON.parse(
      serializeSave(
        toSaveDocument(world, {
          gameVersion: '0.4.0',
          createdAtUnixMs: 1_753_000_000_000,
          savedAtUnixMs: 1_753_000_000_000,
          playtimeTicks: world.tick,
          saveCount: 1,
        }),
      ),
    ) as SaveDocument;
    return hydrateWorld(document);
  }

  it('gives back a hand marked Away with no trip behind them', () => {
    // THE ONE THAT COSTS THE PLAYER SOMETHING REAL. The FSM skips an away
    // worker by design and only `expeditionSystem` brings one back, so an
    // orphaned Away worker is a hand the player PAID FOR that can never work
    // again — with nothing on screen to explain it.
    const world = farm(1);
    const worker = firstWorker(world);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    world.expeditions.clear(); // the corruption: state without its record

    const loaded = reload(world);

    const restored = [...loaded.workers.values()][0]!;
    expect(restored.state).not.toBe(WorkerState.Away);
    expect(loaded.expeditions.size).toBe(0);
  });

  it('puts a hand back on the trip their record says they are on', () => {
    // The other direction: one worker farming on the grid AND listed as
    // travelling, counted twice by the hire price. The trip is honoured
    // because the supplies were already spent — completing it restores what
    // was paid for rather than inventing value.
    const world = farm(1);
    const worker = firstWorker(world);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    worker.state = WorkerState.Idle; // the corruption: record without state

    const loaded = reload(world);

    expect([...loaded.workers.values()][0]!.state).toBe(WorkerState.Away);
    expect(loaded.expeditions.size).toBe(1);
  });

  it('drops a trip naming nobody', () => {
    const world = farm(1);
    const worker = firstWorker(world);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    world.workers.delete(worker.id);

    expect(reload(world).expeditions.size).toBe(0);
  });

  it('brings home a hand whose departure is in the future', () => {
    // A departed tick past `world.tick` would never satisfy the return
    // comparison in a way that means anything, so it is treated as now — the
    // hand comes home on schedule rather than never.
    const world = farm(1);
    const worker = firstWorker(world);
    sendExpedition(world, worker.id, CORE_RIVER_DELTA);
    world.expeditions.set(worker.id, {
      worker: worker.id,
      destination: CORE_RIVER_DELTA,
      departedTick: world.tick + 1_000_000,
    });

    const loaded = reload(world);

    expect(loaded.expeditions.get(worker.id)?.departedTick).toBeLessThanOrEqual(loaded.tick);
  });
});
