/**
 * The migration runner. Phase-07b — ADR-002 §3, ADR-015 §3, acceptance 9.
 *
 * The mechanism is proven with a SYNTHETIC chain before any real migration
 * exists (phase doc §Notes): writing the runner and the first real migration
 * together, under pressure, at the exact moment a mistake destroys real
 * saves, is the failure mode this milestone exists to prevent.
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../shared/errors';

import { runMigrations, validateChain, type Migration, type UnknownSave } from './migrate';

/** A synthetic two-step chain: v1 adds a field, v2 renames one. */
const V1_TO_V2: Migration = {
  from: 1,
  to: 2,
  describe: 'add flavor with the calm default',
  migrate: (doc) => ({ ...doc, schemaVersion: 2, flavor: 'calm' }),
};

const V2_TO_V3: Migration = {
  from: 2,
  to: 3,
  describe: 'rename flavor to mood',
  migrate: (doc) => {
    const { flavor, ...rest } = doc as UnknownSave & { flavor?: unknown };
    return { ...rest, schemaVersion: 3, mood: flavor };
  },
};

describe('validateChain', () => {
  it('accepts the empty chain at version 1 — the shipped v0.1 state', () => {
    expect(() => {
      validateChain([], 1);
    }).not.toThrow();
  });

  it('accepts a contiguous chain ending at the current version', () => {
    expect(() => {
      validateChain([V1_TO_V2, V2_TO_V3], 3);
    }).not.toThrow();
  });

  it('rejects a gap — every version must have its link', () => {
    expect(() => {
      validateChain([V1_TO_V2, { ...V2_TO_V3, from: 3, to: 4 }], 4);
    }).toThrow(/gap|contiguous|expected/i);
  });

  it('rejects a link that skips versions — to must be from + 1', () => {
    expect(() => {
      validateChain([{ ...V1_TO_V2, to: 3 }], 3);
    }).toThrow(/from \+ 1|\+ 1/i);
  });

  it('rejects a chain that stops short of the current version', () => {
    expect(() => {
      validateChain([V1_TO_V2], 3);
    }).toThrow(/end|current/i);
  });

  it('rejects a chain that does not start at version 1', () => {
    expect(() => {
      validateChain([V2_TO_V3], 3);
    }).toThrow(/start|version 1/i);
  });
});

describe('runMigrations', () => {
  it('is a no-op on a document already at the current version (empty chain)', () => {
    const doc: UnknownSave = { schemaVersion: 1, world: { seed: 7 } };
    const result = runMigrations(doc, [], 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document).toEqual(doc);
    expect(result.value.applied).toEqual([]);
  });

  it('runs the chain in order, applying each link exactly once', () => {
    const result = runMigrations({ schemaVersion: 1 }, [V1_TO_V2, V2_TO_V3], 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document).toEqual({ schemaVersion: 3, mood: 'calm' });
    expect(result.value.applied).toEqual([
      '1 -> 2: add flavor with the calm default',
      '2 -> 3: rename flavor to mood',
    ]);
  });

  it('starts mid-chain when the document is partway along', () => {
    const result = runMigrations({ schemaVersion: 2, flavor: 'bright' }, [V1_TO_V2, V2_TO_V3], 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document).toEqual({ schemaVersion: 3, mood: 'bright' });
    expect(result.value.applied).toHaveLength(1);
  });

  it('never mutates the input document (ADR-015 §3 — non-destructive)', () => {
    const doc: UnknownSave = { schemaVersion: 1, world: { seed: 7 } };
    const frozen = JSON.stringify(doc);
    runMigrations(doc, [V1_TO_V2, V2_TO_V3], 3);
    expect(JSON.stringify(doc)).toBe(frozen);
  });

  it('is deterministic — the same input produces the same output on every run', () => {
    const doc: UnknownSave = { schemaVersion: 1, world: { seed: 7 } };
    const first = runMigrations(doc, [V1_TO_V2, V2_TO_V3], 3);
    const second = runMigrations(doc, [V1_TO_V2, V2_TO_V3], 3);
    expect(second).toEqual(first);
  });

  it('refuses a newer document — never partially loads (ADR-015 §4)', () => {
    const result = runMigrations({ schemaVersion: 9 }, [V1_TO_V2, V2_TO_V3], 3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.SaveFromNewerVersion);
  });

  it('rejects a version with no chain link as corrupt — never-shipped versions are indistinguishable from corruption (ADR-015 §4)', () => {
    const result = runMigrations({ schemaVersion: 0 }, [V1_TO_V2, V2_TO_V3], 3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.SaveCorrupt);
  });

  it('converts a throwing link into a typed MigrationFailed, input intact', () => {
    const bomb: Migration = {
      from: 1,
      to: 2,
      describe: 'explodes',
      migrate: () => {
        throw new Error('boom');
      },
    };
    const doc: UnknownSave = { schemaVersion: 1 };
    const result = runMigrations(doc, [bomb], 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.MigrationFailed);
    expect(doc).toEqual({ schemaVersion: 1 }); // the caller still holds the original
  });

  it('rejects a link that lies about its output version', () => {
    const liar: Migration = {
      from: 1,
      to: 2,
      describe: 'forgets to bump',
      migrate: (doc) => ({ ...doc }), // schemaVersion still 1
    };
    const result = runMigrations({ schemaVersion: 1 }, [liar], 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.MigrationFailed);
  });
});
