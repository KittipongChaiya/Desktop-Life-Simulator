/**
 * The serializer's sorts, exercised with something to sort. Phase-23 — the
 * RC coverage gate.
 *
 * Byte-stability (`SAVE_FORMAT.md` §3.2) rests on every keyed collection
 * being written in sorted order — but a comparator that is never handed two
 * out-of-order entries is a promise never tested. Every suite before this
 * one happened to hold at most one multiplier, one requester, one quest
 * watermark; these worlds hold several, inserted backwards, so each
 * comparator actually runs in both directions.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { hydrateWorld } from '../src/persistence/deserialize';
import type { SaveMeta } from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { asContentId, asTileIndex, asWorkerId } from '../src/shared/ids';
import { addItems, createContainer } from '../src/sim/world/container';
import { createWorld, type World } from '../src/sim/world/world';

const META: SaveMeta = {
  gameVersion: '0.3.0-dev',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

/** A world whose every sorted collection holds entries inserted BACKWARDS. */
function unsortedWorld(): World {
  const world = createWorld(23);

  world.economy.multipliers.set(asContentId('core:wheat'), 0.9);
  world.economy.multipliers.set(asContentId('core:turnip'), 0.8);
  world.economy.multipliers.set(asContentId('core:carrot'), 0.85);

  world.contractStats.byRequester['core:resident_tobin'] = 2;
  world.contractStats.byRequester['core:resident_prue'] = 1;
  world.contractStats.byRequester['core:resident_marla'] = 3;

  world.quests.set('core:quest_tobin', 1);
  world.quests.set('core:quest_good_neighbour', 2);

  // A worker with EVERY optional schedule field present, an unsorted zone,
  // and a Plant task carrying its crop — the present-arm of each spread.
  const id = asWorkerId(world.ids.allocateWorker());
  const carrying = createContainer(4);
  addItems(carrying, asContentId('core:wheat'), 2, 99);
  world.workers.set(id, {
    id,
    position: asTileIndex(2050),
    state: 'idle',
    task: { kind: 'plant', tile: asTileIndex(2051), cropId: asContentId('core:turnip') },
    path: [],
    pathCursor: 0,
    actionProgress: 0,
    energy: 90,
    energyTimer: 3,
    schedule: {
      taskKinds: ['plant', 'harvest'],
      zone: new Set([2051, 2050, 2052]),
      shift: ['day', 'dusk'],
      priority: ['harvest'],
    },
    carrying,
    replanTick: 0,
  } as never);

  return world;
}

describe('sorted collections with several entries', () => {
  it('writes every keyed collection in codepoint order regardless of insertion', () => {
    const document = toSaveDocument(unsortedWorld(), META);

    expect(document.world.economy.multipliers.map((entry) => entry.item)).toEqual([
      'core:carrot',
      'core:turnip',
      'core:wheat',
    ]);
    expect(Object.keys(document.world.contractStats.byRequester)).toEqual([
      'core:resident_marla',
      'core:resident_prue',
      'core:resident_tobin',
    ]);
    expect(Object.keys(document.world.quests)).toEqual([
      'core:quest_good_neighbour',
      'core:quest_tobin',
    ]);

    const worker = document.world.workers[0];
    expect(worker?.schedule.zone).toEqual([2050, 2051, 2052]);
    expect(worker?.schedule.shift).toEqual(['day', 'dusk']);
    expect(worker?.task).toEqual({ kind: 'plant', tile: 2051, cropId: 'core:turnip' });
  });

  it('serializes byte-identically twice, and survives the round trip', () => {
    const world = unsortedWorld();
    const first = serializeSave(toSaveDocument(world, META));
    expect(serializeSave(toSaveDocument(world, META))).toBe(first);

    const loaded = hydrateWorld(JSON.parse(first) as never);
    expect(loaded.contractStats.byRequester).toEqual({
      'core:resident_marla': 3,
      'core:resident_prue': 1,
      'core:resident_tobin': 2,
    });
    expect(loaded.quests.get('core:quest_good_neighbour')).toBe(2);
    expect(loaded.quests.get('core:quest_tobin')).toBe(1);
    expect(serializeSave(toSaveDocument(loaded, META))).toBe(first);
  });
});
