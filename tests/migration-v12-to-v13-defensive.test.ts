/**
 * The second relayout, fed garbage. Phase-30 — ADR-015 §4, `SAVE_FORMAT.md` §5.3.
 *
 * `v12 → v13` re-lays four dense arrays and remaps every stored tile index, so
 * it touches nearly every field in a save — and it is written to **pass
 * anything it does not understand through untouched** rather than to throw. A
 * migration that crashes on a malformed document turns a recoverable save into
 * a lost one, which is the outcome `SAVE_FORMAT.md` §5.3's quarantine exists to
 * avoid.
 *
 * Those guards were entirely unexercised until the RC's coverage gate went red
 * on `src/persistence` branches. That is the same finding phase 23 made at the
 * v0.3 RC, in the same directory, for the same reason: **a link is written
 * against the document it expects, and the `isRecord` / `isArray` arms are what
 * nobody ever demonstrates.**
 *
 * Every case below asserts what the link DOES with the garbage — never merely
 * that it survived it.
 */

import { describe, expect, it } from 'vitest';

import { v12ToV13 } from '../src/persistence/migrations/v12-to-v13';

/** Runs the link and returns the document it produced. */
function migrate(document: Record<string, unknown>): Record<string, unknown> {
  return v12ToV13.migrate(document);
}

const worldOf = (document: Record<string, unknown>): Record<string, unknown> =>
  document['world'] as Record<string, unknown>;

describe('a document missing everything', () => {
  it('still produces a v13 document', () => {
    // The extreme case, and the one that proves the link never reaches into
    // `undefined`: an empty object in, a valid version out.
    const after = migrate({ schemaVersion: 12 });

    expect(after['schemaVersion']).toBe(13);
    expect(worldOf(after)['harvestedAt']).toEqual([]);
  });

  it('assumes the width every pre-v13 save was actually written at', () => {
    // A document with no usable grid dimensions still remaps against 80 —
    // historical fact, so a literal. Tile 81 is (1, 1) at width 80 and must
    // land at (1, 1) at width 112, which is 113.
    const after = migrate({
      schemaVersion: 12,
      world: { crops: [{ tile: 81 }] },
    });

    expect((worldOf(after)['crops'] as { tile: number }[])[0]?.tile).toBe(113);
  });
});

describe('fields of the wrong shape pass through untouched', () => {
  it('a world that is not a record', () => {
    const after = migrate({ schemaVersion: 12, world: 'nonsense' });

    expect(after['schemaVersion']).toBe(13);
    expect(worldOf(after)['harvestedAt']).toEqual([]);
  });

  it('a grid that is not a record', () => {
    const after = migrate({ schemaVersion: 12, world: { grid: 42 } });

    // The grid is rebuilt at the new dimensions rather than propagated.
    expect((worldOf(after)['grid'] as Record<string, unknown>)['width']).toBe(112);
  });

  it('dense arrays that are not strings', () => {
    // `relayBytes`, `relayWords` and `relayBits` each return their input when
    // it is not the base64 string they expect.
    const after = migrate({
      schemaVersion: 12,
      world: { grid: { width: 80, height: 64, kind: 7, owned: null, tilledAt: [], wateredAt: {} } },
    });

    const grid = worldOf(after)['grid'] as Record<string, unknown>;
    expect(grid['kind']).toBe(7);
    expect(grid['owned']).toBeNull();
    expect(grid['tilledAt']).toEqual([]);
    expect(grid['wateredAt']).toEqual({});
  });

  it('collections that are not arrays', () => {
    const after = migrate({
      schemaVersion: 12,
      world: { crops: 'no', buildings: 5, workers: null, lastPlanted: {} },
    });

    const world = worldOf(after);
    expect(world['crops']).toBe('no');
    expect(world['buildings']).toBe(5);
    expect(world['workers']).toBeNull();
    expect(world['lastPlanted']).toEqual({});
  });

  it('entries inside a list that are not records', () => {
    const after = migrate({
      schemaVersion: 12,
      world: { crops: [null, 'text', 81] },
    });

    expect(worldOf(after)['crops']).toEqual([null, 'text', 81]);
  });

  it('a tile field that is not a whole number', () => {
    // Remapping a fraction, a negative, or a string would invent a position.
    const after = migrate({
      schemaVersion: 12,
      world: { crops: [{ tile: 1.5 }, { tile: -3 }, { tile: 'x' }] },
    });

    expect(worldOf(after)['crops']).toEqual([{ tile: 1.5 }, { tile: -3 }, { tile: 'x' }]);
  });
});

describe('a worker with malformed parts', () => {
  it('is passed through when it is not a record at all', () => {
    const after = migrate({ schemaVersion: 12, world: { workers: ['ghost'] } });

    expect(worldOf(after)['workers']).toEqual(['ghost']);
  });

  it('keeps a task and a schedule that are not records', () => {
    const after = migrate({
      schemaVersion: 12,
      world: { workers: [{ position: 81, task: 'busy', schedule: 9, path: 'none' }] },
    });

    const worker = (worldOf(after)['workers'] as Record<string, unknown>[])[0]!;
    expect(worker['position']).toBe(113);
    expect(worker['task']).toBe('busy');
    expect(worker['schedule']).toBe(9);
    expect(worker['path']).toBe('none');
  });

  it('leaves a schedule with no zone alone, and remaps one that has a zone', () => {
    const after = migrate({
      schemaVersion: 12,
      world: {
        workers: [{ schedule: { shift: 'day' } }, { schedule: { zone: [81, 'x'] } }],
      },
    });

    const workers = worldOf(after)['workers'] as Record<string, unknown>[];
    expect(workers[0]?.['schedule']).toEqual({ shift: 'day' });
    expect(workers[1]?.['schedule']).toEqual({ zone: [113, 'x'] });
  });
});

describe('the quarantine, which a corrupt save is exactly where it lives', () => {
  it('is passed through when it is not a record', () => {
    const after = migrate({ schemaVersion: 12, quarantine: 'gone' });

    expect(after['quarantine']).toBeDefined();
  });

  it('remaps a quarantined building’s tile and leaves malformed entries alone', () => {
    const after = migrate({
      schemaVersion: 12,
      quarantine: { buildings: [{ building: { tile: 81 } }, { building: 'wrong' }, null] },
    });

    const entries = (after['quarantine'] as Record<string, unknown>)['buildings'] as unknown[];
    expect((entries[0] as { building: { tile: number } }).building.tile).toBe(113);
    expect(entries[1]).toEqual({ building: 'wrong' });
    expect(entries[2]).toBeNull();
  });
});
