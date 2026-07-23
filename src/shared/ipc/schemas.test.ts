/**
 * IPC payload validators. Every payload crossing from the renderer is
 * untrusted (AI_RULES.md §2.4); these are the whole defence.
 */

import { describe, expect, it } from 'vitest';

import { validateBoolean, validateNumber, validateVoid } from './schemas';

describe('validateBoolean', () => {
  it('accepts booleans and rejects everything else', () => {
    expect(validateBoolean(true, 'ch').ok).toBe(true);
    expect(validateBoolean(false, 'ch').ok).toBe(true);
    expect(validateBoolean('true', 'ch').ok).toBe(false);
    expect(validateBoolean(1, 'ch').ok).toBe(false);
    expect(validateBoolean(undefined, 'ch').ok).toBe(false);
  });
});

describe('validateNumber', () => {
  it('accepts finite numbers', () => {
    const result = validateNumber(65, 'ch');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(65);
  });

  it('rejects non-numbers and non-finite numbers', () => {
    expect(validateNumber('65', 'ch').ok).toBe(false);
    expect(validateNumber(Number.NaN, 'ch').ok).toBe(false);
    expect(validateNumber(Number.POSITIVE_INFINITY, 'ch').ok).toBe(false);
    expect(validateNumber(null, 'ch').ok).toBe(false);
    expect(validateNumber(undefined, 'ch').ok).toBe(false);
  });
});

describe('validateVoid', () => {
  it('accepts only an absent payload', () => {
    expect(validateVoid(undefined, 'ch').ok).toBe(true);
    expect(validateVoid(null, 'ch').ok).toBe(true);
    expect(validateVoid(0, 'ch').ok).toBe(false);
    expect(validateVoid({}, 'ch').ok).toBe(false);
  });
});
