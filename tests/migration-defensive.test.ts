/**
 * The links' defensive arms, fed the malformed shapes they guard against.
 * Phase-23 — the RC coverage gate, and the v0.1 report's own prediction
 * (`save-compatibility-report.md` §11: the uncovered remainder is "the
 * defensive arms of validation and repair that arbitrary-world tests do not
 * reach — closing it means adversarial input tests").
 *
 * The contract under test: a link NEVER throws on a malformed document. It
 * shrugs — defaults where the shape is missing, pass-through where an entry
 * is unrecognizable — and structural validation rejects the result later,
 * with a message instead of a stack. A migration that threw would turn a
 * corrupt file into a crash on the load path, which §8 of the report forbids.
 */

import { describe, expect, it } from 'vitest';

import { v2ToV3 } from '../src/persistence/migrations/v2-to-v3';
import { v3ToV4 } from '../src/persistence/migrations/v3-to-v4';
import { v4ToV5 } from '../src/persistence/migrations/v4-to-v5';
import { v5ToV6 } from '../src/persistence/migrations/v5-to-v6';
import { v7ToV8 } from '../src/persistence/migrations/v7-to-v8';
import { v8ToV9 } from '../src/persistence/migrations/v8-to-v9';
import { v9ToV10 } from '../src/persistence/migrations/v9-to-v10';

type Doc = Record<string, unknown>;
const worldOf = (document: unknown): Doc => (document as { world: Doc }).world;

describe('a document with no world at all', () => {
  it.each([
    ['v2 → v3', v2ToV3, 3],
    ['v3 → v4', v3ToV4, 4],
    ['v4 → v5', v4ToV5, 5],
    ['v5 → v6', v5ToV6, 6],
    ['v7 → v8', v7ToV8, 8],
    ['v8 → v9', v8ToV9, 9],
    ['v9 → v10', v9ToV10, 10],
  ] as const)('%s defaults instead of throwing', (_name, link, to) => {
    const out = link.migrate({ schemaVersion: to - 1 }) as Doc;
    expect(out['schemaVersion']).toBe(to);
    expect(typeof out['world']).toBe('object');
  });
});

describe('malformed members shrug through, never crash', () => {
  it('v4 → v5: a grid that is not a record still yields a wateredAt', () => {
    const out = v4ToV5.migrate({ schemaVersion: 4, world: { grid: 'nonsense' } });
    expect(worldOf(out)['grid']).toHaveProperty('wateredAt');
  });

  it('v5 → v6: an unrecognizable worker entry passes through untouched', () => {
    const out = v5ToV6.migrate({ schemaVersion: 5, world: { workers: [42, { id: 1 }] } });
    expect(worldOf(out)['workers']).toEqual([42, { id: 1, schedule: {} }]);
  });

  it('v8 → v9: contracts that are not an array become an empty store', () => {
    const out = v8ToV9.migrate({ schemaVersion: 8, world: { contracts: 'x' } });
    expect(worldOf(out)['contracts']).toEqual([]);
  });

  it('v8 → v9: an unrecognizable contract entry passes through untouched', () => {
    const out = v8ToV9.migrate({ schemaVersion: 8, world: { contracts: [7] } });
    expect(worldOf(out)['contracts']).toEqual([7]);
  });

  it('v9 → v10: contracts that are not an array become an empty store, like v8 → v9', () => {
    const out = v9ToV10.migrate({ schemaVersion: 9, world: { contracts: 'x' } });
    expect(worldOf(out)['contracts']).toEqual([]);
    expect(worldOf(out)['quests']).toEqual({});
  });

  it('v9 → v10: an entry without a numeric offerId is not re-keyed, only kept', () => {
    const out = v9ToV10.migrate({
      schemaVersion: 9,
      world: { contracts: [{ offerId: 'eighty' }, 5, { item: 'core:turnip' }] },
    });
    expect(worldOf(out)['contracts']).toEqual([{ offerId: 'eighty' }, 5, { item: 'core:turnip' }]);
  });

  it('v9 → v10: contractStats that are not a record still gain the empty map', () => {
    const out = v9ToV10.migrate({ schemaVersion: 9, world: { contractStats: 9 } });
    expect(worldOf(out)['contractStats']).toEqual({ byRequester: {} });
  });
});
