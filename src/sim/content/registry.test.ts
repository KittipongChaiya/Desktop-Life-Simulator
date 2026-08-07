/**
 * The content registry. Phase-08.0d.
 *
 * `TESTING.md` §5.1 has required these since phase-00 — "Content registries:
 * registration, lookup, duplicate-ID rejection" — and the module had no test
 * file. Its rejection paths were reached only incidentally, through the crop
 * and item registries that happen to sit on top of it.
 *
 * That matters more now than it did. Phase-08 wraps this exact module in the
 * public `PluginApi` (ADR-019): every crop, item, building, and tile kind a
 * third party ever registers arrives through `register` below, and the errors
 * asserted here become the errors a plugin author sees. A registry that accepts
 * a malformed id, or silently lets a second definition win, is a plugin that
 * corrupts first-party content — and `plugins/core/` will be its first caller.
 *
 * The dense index is load-bearing in a second way: the tile grid stores kinds as
 * `Uint8Array` values (ADR-004 §2), so `indexOf` IS the on-disk encoding. An
 * index that shifted between runs would silently repaint a saved farm's terrain.
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../shared/errors';
import { asContentId, type ContentId } from '../../shared/ids';

import { createContentRegistry, type ContentDefinition } from './registry';

interface Thing extends ContentDefinition {
  readonly label?: string;
}

const thing = (id: string, label = id): Thing => ({ id: asContentId(id), label });

/**
 * A definition whose id never passed `asContentId`.
 *
 * `asContentId` throws, so a malformed id cannot reach `register` through it —
 * which is exactly why the registry keeps its own check. A plugin manifest is
 * JSON: its `id` arrives as a `string` and something has to be the last place
 * that refuses it (ADR-019, `AI_RULES.md` §2.4). This cast is what that looks
 * like from the registry's side.
 */
const untrusted = (id: string): Thing => ({ id: id as ContentId, label: id });

const registry = (): ReturnType<typeof createContentRegistry<Thing>> =>
  createContentRegistry<Thing>('thing');

describe('register', () => {
  it('accepts a well-formed definition', () => {
    const r = registry();
    expect(r.register(thing('core:one')).ok).toBe(true);
    expect(r.has(asContentId('core:one'))).toBe(true);
    expect(r.size).toBe(1);
  });

  it('rejects a malformed id, naming the shape it wanted', () => {
    // The registry is the last place a malformed id can be refused before it
    // becomes content — see `untrusted` above for why it can get this far.
    for (const bad of ['nonamespace', ':name', 'core:', 'core:name:extra', '', 'Core:Name']) {
      const result = registry().register(untrusted(bad));
      expect(result.ok, bad).toBe(false);
      if (result.ok) continue;
      expect(result.error.code, bad).toBe(ErrorCode.InvalidIntent);
      expect(result.error.message, bad).toContain('thing');
    }
  });

  it('rejects a duplicate id and keeps the FIRST definition', () => {
    const r = registry();
    r.register(thing('core:one', 'first'));
    const result = r.register(thing('core:one', 'second'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.DuplicateContent);

    const stored = r.get(asContentId('core:one'));
    expect(stored.ok && stored.value.label).toBe('first');
    expect(r.size).toBe(1);
  });

  it('names the registry kind in every error, so a plugin author knows what failed', () => {
    const crops = createContentRegistry<Thing>('crop');
    const malformed = crops.register(untrusted('oops'));
    crops.register(thing('core:wheat'));
    const duplicate = crops.register(thing('core:wheat'));

    expect(malformed.ok).toBe(false);
    expect(duplicate.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.message).toContain('crop');
    if (!duplicate.ok) expect(duplicate.error.message).toContain('crop');
  });

  it('keeps different namespaces apart — the same name twice is not a duplicate', () => {
    // ADR-026's isolation invariant in miniature: `mod:wheat` must not collide
    // with `core:wheat`, or installing a plugin breaks first-party content.
    const r = registry();
    expect(r.register(thing('core:wheat')).ok).toBe(true);
    expect(r.register(thing('mod:wheat')).ok).toBe(true);
    expect(r.size).toBe(2);
  });
});

describe('get', () => {
  it('returns a registered definition', () => {
    const r = registry();
    r.register(thing('core:one', 'the one'));
    const result = r.get(asContentId('core:one'));
    expect(result.ok && result.value.label).toBe('the one');
  });

  it('returns a typed error for an unknown id rather than undefined', () => {
    const result = registry().get(asContentId('core:absent'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.UnknownContent);
  });

  it('does not resolve an id whose registration was rejected', () => {
    const r = registry();
    r.register(thing('core:one'));
    r.register(thing('core:one'));
    r.register(untrusted('malformed'));
    expect(r.has('malformed' as ContentId)).toBe(false);
    expect(r.size).toBe(1);
  });
});

describe('has', () => {
  it('is true only for what registered successfully', () => {
    const r = registry();
    r.register(thing('core:one'));
    r.register(untrusted('bad'));
    expect(r.has(asContentId('core:one'))).toBe(true);
    expect(r.has('bad' as ContentId)).toBe(false);
    expect(r.has(asContentId('core:absent'))).toBe(false);
  });
});

describe('all', () => {
  it('is empty for a fresh registry', () => {
    expect(registry().all()).toEqual([]);
    expect(registry().size).toBe(0);
  });

  it('preserves registration order, which is what makes indices stable', () => {
    const r = registry();
    for (const id of ['core:c', 'core:a', 'core:b']) r.register(thing(id));
    expect(r.all().map((t) => t.id)).toEqual(['core:c', 'core:a', 'core:b']);
  });

  it('omits rejected registrations', () => {
    const r = registry();
    r.register(thing('core:a'));
    r.register(thing('core:a'));
    r.register(untrusted('nope'));
    expect(r.all()).toHaveLength(1);
  });
});

describe('indexOf and byIndex — the on-disk encoding for tile kinds', () => {
  it('assigns dense indices from zero in registration order', () => {
    const r = registry();
    for (const id of ['core:a', 'core:b', 'core:c']) r.register(thing(id));
    expect(['core:a', 'core:b', 'core:c'].map((id) => r.indexOf(asContentId(id)))).toEqual([
      0, 1, 2,
    ]);
  });

  it('round-trips every registered definition through its index', () => {
    const r = registry();
    for (const id of ['core:a', 'core:b', 'core:c']) r.register(thing(id));
    for (const definition of r.all()) {
      expect(r.byIndex(r.indexOf(definition.id))).toBe(definition);
    }
  });

  it('does not consume an index for a rejected registration', () => {
    // A gap here would shift every later kind's byte, and a saved grid would
    // decode to different terrain than it was written with.
    const r = registry();
    r.register(thing('core:a'));
    r.register(thing('core:a')); // duplicate
    r.register(untrusted('bad')); // malformed
    r.register(thing('core:b'));
    expect(r.indexOf(asContentId('core:b'))).toBe(1);
  });

  it('reports -1 for an unregistered id rather than a usable index', () => {
    expect(registry().indexOf(asContentId('core:absent'))).toBe(-1);
  });

  it('returns undefined for an index outside the registry', () => {
    const r = registry();
    r.register(thing('core:a'));
    expect(r.byIndex(1)).toBeUndefined();
    expect(r.byIndex(-1)).toBeUndefined();
    expect(r.byIndex(99)).toBeUndefined();
  });
});

describe('two registries are independent', () => {
  it('does not share ids, order, or indices', () => {
    const a = createContentRegistry<Thing>('a');
    const b = createContentRegistry<Thing>('b');
    a.register(thing('core:one'));

    expect(b.has(asContentId('core:one'))).toBe(false);
    expect(b.size).toBe(0);
    expect(b.register(thing('core:one')).ok).toBe(true); // not a duplicate in b
    expect(b.indexOf(asContentId('core:one'))).toBe(0);
  });
});
