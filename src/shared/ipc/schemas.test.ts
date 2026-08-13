/**
 * IPC payload validators. Every payload crossing from the renderer is
 * untrusted (AI_RULES.md §2.4); these are the whole defence.
 */

import { describe, expect, it } from 'vitest';

import { validateBoolean, validateNullableString, validateNumber, validateVoid } from './schemas';

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

describe('validateNullableString', () => {
  it('accepts a string and an explicit null — the pin has both states', () => {
    const pinned = validateNullableString('0.2.2', 'ch');
    expect(pinned.ok).toBe(true);
    if (pinned.ok) expect(pinned.value).toBe('0.2.2');

    const cleared = validateNullableString(null, 'ch');
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.value).toBeNull();
  });

  it('accepts a string it cannot parse as a version', () => {
    // Shape is this layer's business; meaning is `settings-schema.ts`'s, which
    // deliberately keeps an unreadable pin so it can still hold. Rejecting it
    // here would turn "hold me here" into a failed call and then no pin.
    expect(validateNullableString('the one that works', 'ch').ok).toBe(true);
  });

  it('rejects everything that is neither', () => {
    expect(validateNullableString(undefined, 'ch').ok).toBe(false);
    expect(validateNullableString(42, 'ch').ok).toBe(false);
    expect(validateNullableString({}, 'ch').ok).toBe(false);
    expect(validateNullableString(['0.2.2'], 'ch').ok).toBe(false);
  });
});
