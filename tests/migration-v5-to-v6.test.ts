/**
 * v5 → v6, the schedule link. Phase-14b — `SAVE_FORMAT.md` §9, ADR-024 §4.
 *
 * A schedule is **simulation state**, not a preference: two players with one
 * seed and different schedules have different farms. So it goes in the save
 * and in the command stream, and this is the link that puts it there.
 *
 * The whole migration is one decision — **`{}`, not `{ taskKinds: [] }`**.
 * Absent means unconstrained; empty means constrained to nothing. A v5 worker
 * could do anything, anywhere, at any hour, so the empty record states that
 * exactly, and the alternative would have silently idled every worker on every
 * existing save.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hydrateWorld } from '../src/persistence/deserialize';
import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations';
import { CURRENT_SCHEMA_VERSION, type SaveDocument } from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';
import { toIndexUnchecked } from '../src/shared/geometry';
import { selectTask } from '../src/sim/ai/worker-tasks';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { WorkerTaskKind } from '../src/sim/world/worker';
import { addCoins } from '../src/sim/world/wallet';
import { createWorld } from '../src/sim/world/world';

import type { SaveMeta } from '../src/persistence/schema';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v5Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v5-'));

const META: SaveMeta = {
  gameVersion: '0.2.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

function migrated(name: string): SaveDocument {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as { schemaVersion: number };
  const run = runMigrations(raw, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  expect(run.ok, `${name} failed to migrate`).toBe(true);
  if (!run.ok) throw new Error('unreachable');
  return run.value.document as unknown as SaveDocument;
}

describe('the v5 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v5Fixtures.length).toBeGreaterThan(0);
  });

  it.each(v5Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v5Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v5Fixtures)('%s migrates identically when run twice', (name) => {
    expect(JSON.stringify(migrated(name))).toBe(JSON.stringify(migrated(name)));
  });

  it.each(v5Fixtures)('%s gives every worker an EMPTY schedule, not an empty set', (name) => {
    // The whole migration, in one assertion. `{}` is unconstrained;
    // `{ taskKinds: [] }` is a worker who may do nothing.
    for (const worker of migrated(name).world.workers) {
      expect(worker.schedule).toEqual({});
      expect(worker.schedule.taskKinds).toBeUndefined();
      expect(worker.schedule.zone).toBeUndefined();
    }
  });
});

describe('a migrated worker is unconstrained', () => {
  it('is offered work exactly as it was before schedules existed', () => {
    const name = v5Fixtures[0] as string;
    const world = hydrateWorld(migrated(name));
    const first = [...world.workers.values()][0];

    if (first === undefined) return; // a fixture with no workers proves nothing here
    expect(first.schedule).toEqual({});
    expect(selectTask(world, first.position, new Set(), first.schedule)).toEqual(
      selectTask(world, first.position, new Set()),
    );
  });
});

describe('a schedule survives the round trip', () => {
  it('restores a set, an order, and the absent fields as absent', () => {
    // A NON-DEFAULT schedule, because a worker with `{}` round-trips
    // correctly even if the codec drops the field entirely.
    const world = createWorld(5);
    addCoins(world.wallet, 500);
    expect(hireWorker(world).ok).toBe(true);

    const worker = [...world.workers.values()][0];
    if (worker === undefined) throw new Error('setup failed');
    worker.schedule = {
      taskKinds: [WorkerTaskKind.Till],
      zone: new Set([toIndexUnchecked(30, 30), toIndexUnchecked(29, 30)]),
      priority: [WorkerTaskKind.Till],
    };

    const loaded = hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);
    const restored = [...loaded.workers.values()][0];
    if (restored === undefined) throw new Error('round trip lost the worker');

    expect(restored.schedule.taskKinds).toEqual([WorkerTaskKind.Till]);
    expect([...(restored.schedule.zone ?? [])].sort((a, b) => a - b)).toEqual(
      [toIndexUnchecked(29, 30), toIndexUnchecked(30, 30)].sort((a, b) => a - b),
    );
    expect(restored.schedule.priority).toEqual([WorkerTaskKind.Till]);
    // Absent stays ABSENT — the distinction the vocabulary rests on.
    expect(restored.schedule.shift).toBeUndefined();
  });

  it('keeps an EMPTY constraint empty, not absent', () => {
    // The other half: a worker constrained to nothing must still be
    // constrained to nothing after a save.
    const world = createWorld(6);
    addCoins(world.wallet, 500);
    hireWorker(world);
    const worker = [...world.workers.values()][0];
    if (worker === undefined) throw new Error('setup failed');
    worker.schedule = { taskKinds: [] };

    const loaded = hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);
    const restored = [...loaded.workers.values()][0];

    expect(restored?.schedule.taskKinds).toEqual([]);
  });

  it('serializes the zone deterministically', () => {
    // Sets have insertion order; the bytes must not (SAVE_FORMAT.md §3.2).
    const build = (order: readonly number[]) => {
      const world = createWorld(7);
      addCoins(world.wallet, 500);
      hireWorker(world);
      const worker = [...world.workers.values()][0];
      if (worker === undefined) throw new Error('setup failed');
      worker.schedule = { zone: new Set(order) };
      return serializeSave(toSaveDocument(world, META));
    };

    expect(build([5, 1, 9])).toBe(build([9, 5, 1]));
  });
});
