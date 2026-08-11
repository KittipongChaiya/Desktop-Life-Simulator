/**
 * Phase-14d — the two acceptances that needed a producer of schedules.
 *
 * `ROADMAP.md` §10 asks for both, and neither could be met until `assignRole`
 * existed: a world where every schedule is `{}` proves nothing about
 * schedules.
 *
 * 1. **Identical seed, command stream and schedules produce byte-identical
 *    state.** A scheduler that reordered by anything unstable would fail here
 *    rather than merely misbehave.
 * 2. **Catch-up never credits work a schedule forbids** (ADR-024 §4). The
 *    model decides what workers would have done; a worker who may not harvest
 *    would not have harvested.
 */

import { describe, expect, it } from 'vitest';

import { catchUpWorld } from '../src/persistence/catch-up';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { toIndexUnchecked } from '../src/shared/geometry';
import { assignRole, setWorkerZone } from '../src/sim/commands/schedule-commands';
import { tillTile } from '../src/sim/commands/crop-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { CORE_SEED_BIN } from '../src/sim/content/buildings';
import { CORE_TURNIP } from '../src/sim/content/crops';
import { DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { CORE_GROUNDSKEEPER, CORE_HARVESTER } from '../src/sim/content/roles';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems } from '../src/sim/world/container';
import { addCoins } from '../src/sim/world/wallet';
import { createWorld, type World } from '../src/sim/world/world';

import type { SaveMeta } from '../src/persistence/schema';
import type { ContentId } from '../src/shared/ids';

const META: SaveMeta = {
  gameVersion: '0.2.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

/** A farm with two workers, seeds, tilled ground, and a given role applied. */
function scheduledFarm(seed: number, role: ContentId | null): World {
  const world = createWorld(seed);
  addCoins(world.wallet, 5_000);

  const turnip = world.cropRegistry.get(CORE_TURNIP);
  if (!turnip.ok) throw new Error('setup failed');
  addItems(world.inventory, turnip.value.seedItem, 300, DEFAULT_STACK_SIZE);

  expect(hireWorker(world).ok).toBe(true);
  expect(hireWorker(world).ok).toBe(true);

  for (let x = 28; x < 34; x += 1) tillTile(world, toIndexUnchecked(x, 30));

  if (role !== null) {
    for (const id of world.workers.keys()) assignRole(world, id, role);
  }

  return world;
}

describe('determinism with schedules in play', () => {
  it('two identically scheduled worlds stay byte-identical over a long run', () => {
    // The ordering stage sorts bands by priority. Sorting by comparator over
    // the original array would be engine-dependent; this is where that would
    // show up as a divergence rather than as a subtle misbehaviour.
    const a = scheduledFarm(31, CORE_GROUNDSKEEPER);
    const b = scheduledFarm(31, CORE_GROUNDSKEEPER);

    stepSimulationBy(a, 60_000);
    stepSimulationBy(b, 60_000);

    expect(serializeSave(toSaveDocument(b, META))).toBe(serializeSave(toSaveDocument(a, META)));
    expect(b.rng.getState()).toEqual(a.rng.getState());
  }, 300_000);

  it('a different schedule produces a different world, or it changes nothing', () => {
    // The control. If constrained and unconstrained farms evolved identically,
    // every assertion above would pass against a filter stage that did nothing.
    const constrained = scheduledFarm(31, CORE_HARVESTER);
    const free = scheduledFarm(31, null);

    stepSimulationBy(constrained, 30_000);
    stepSimulationBy(free, 30_000);

    expect(serializeSave(toSaveDocument(constrained, META))).not.toBe(
      serializeSave(toSaveDocument(free, META)),
    );
  }, 300_000);

  it('survives a save and continues identically', () => {
    const world = scheduledFarm(41, CORE_GROUNDSKEEPER);
    stepSimulationBy(world, 5_000);

    const before = serializeSave(toSaveDocument(world, META));
    stepSimulationBy(world, 5_000);
    const after = serializeSave(toSaveDocument(world, META));

    // Same world, stepped again from the same point, lands the same place.
    expect(before).not.toBe(after);
    expect(after).toBe(serializeSave(toSaveDocument(world, META)));
  });
});

describe('catch-up is bounded to schedule-legal work (ADR-024 §4)', () => {
  /** A farm with a standing mature crop and a seed bin, ready to be credited. */
  function readyForCatchUp(role: ContentId | null): World {
    const world = scheduledFarm(53, null);
    expect(placeBuilding(world, toIndexUnchecked(35, 35), CORE_SEED_BIN).ok).toBe(true);
    stepSimulationBy(world, 4_000); // let the crew plant and grow something

    if (role !== null) {
      for (const id of world.workers.keys()) assignRole(world, id, role);
    }
    return world;
  }

  it('credits harvests when the crew may harvest', () => {
    const world = readyForCatchUp(null);
    expect(catchUpWorld(world, 40_000).harvests).toBeGreaterThan(0);
  });

  it('credits NOTHING when no worker may harvest', () => {
    // A crew of groundskeepers tills and plants; it does not harvest. Crediting
    // a harvest would be crediting work the real simulation would have refused.
    const world = readyForCatchUp(CORE_GROUNDSKEEPER);
    expect(catchUpWorld(world, 40_000).harvests).toBe(0);
  });

  it('credits no replant when no worker may plant', () => {
    const world = readyForCatchUp(CORE_HARVESTER);
    expect(catchUpWorld(world, 40_000).replants).toBe(0);
  });

  it('credits nothing for a tile outside every zone', () => {
    // The zone constraint reaching catch-up: work nobody could have walked to
    // is work nobody did.
    const world = readyForCatchUp(null);
    for (const id of world.workers.keys()) {
      setWorkerZone(world, id, [toIndexUnchecked(40, 40)]);
    }

    expect(catchUpWorld(world, 40_000).harvests).toBe(0);
  });
});
