/**
 * Phase-15a — the rollback boundary, in Node with no installer.
 *
 * ADR-025 §2's acceptance is *"a rollback to a build with a lower
 * `CURRENT_SCHEMA_VERSION` than the save is refused with a clear message, save
 * untouched"*. Two of those three are checked here; the third is checked by
 * this module having no way to touch a save at all — it takes two numbers and
 * returns a decision.
 */

import { describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '../persistence/schema';

import { decideRollback, explainRefusal } from './rollback-guard';

describe('a rollback that would orphan a save is refused', () => {
  it('refuses a build older than the save', () => {
    const decision = decideRollback(6, 5);

    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal.reason).toBe('save-is-newer');
  });

  it('refuses across several versions, not just one', () => {
    expect(decideRollback(6, 1).allowed).toBe(false);
  });

  it('reports both numbers, so the message can state the facts', () => {
    const decision = decideRollback(6, 4);
    if (decision.allowed) throw new Error('expected a refusal');

    expect(decision.refusal.saveVersion).toBe(6);
    expect(decision.refusal.targetVersion).toBe(4);
  });
});

describe('a rollback that is safe is allowed', () => {
  it('allows an EQUAL schema version', () => {
    // The common case, and refusing it would block most rollbacks: a patch
    // release that changed no persisted state reads the same shape.
    expect(decideRollback(6, 6).allowed).toBe(true);
  });

  it('allows a target NEWER than the save', () => {
    // Not really a rollback, but the guard must not invent a rule for it —
    // the newer build migrates the save forward as it always would.
    expect(decideRollback(4, 6).allowed).toBe(true);
  });

  it('allows when there is no save to orphan', () => {
    // A fresh install has no farm. Refusing would strand a player for the
    // sake of data that does not exist.
    expect(decideRollback(null, 3).allowed).toBe(true);
  });

  it('allows when the save version is unreadable rather than guessing', () => {
    expect(decideRollback(Number.NaN, 3).allowed).toBe(true);
  });
});

describe('the refusal names the way out', () => {
  it('points at the pre-migration backup for the target version', () => {
    // Phase-09 writes that backup before any migration and keeps it
    // indefinitely (ADR-027), so a refused rollback is not a dead end.
    const decision = decideRollback(6, 5);
    if (decision.allowed) throw new Error('expected a refusal');

    expect(decision.refusal.recoveryHint).toBe('slot-0-v5-premigration.json');
  });

  it('tells the player their save is untouched, and what to do', () => {
    const decision = decideRollback(6, 5);
    if (decision.allowed) throw new Error('expected a refusal');

    const message = explainRefusal(decision.refusal);
    expect(message).toContain('untouched');
    expect(message).toContain('slot-0-v5-premigration.json');
    // The way out comes before the arithmetic: a player told they cannot do
    // something needs the remedy more than the version numbers.
    expect(message.indexOf('restore the backup')).toBeLessThan(message.indexOf('Save format'));
  });
});

describe('the guard is wired to the real schema version', () => {
  it('would refuse a build one version behind today', () => {
    // Pins the guard to the shipped chain rather than to a literal, so a
    // future bump cannot leave this test passing against a stale number.
    expect(decideRollback(CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION - 1).allowed).toBe(false);
  });

  it('allows a build at today s version', () => {
    expect(decideRollback(CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION).allowed).toBe(true);
  });
});
