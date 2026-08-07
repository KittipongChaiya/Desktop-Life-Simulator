/**
 * Load-order resolution. Phase-09a — ADR-019 §6.
 *
 * `ROADMAP.md` §5 states the acceptance directly: a dependency cycle, a missing
 * dependency, an unsupported API version, and a namespace collision each
 * **refuse exactly one source, name it, and leave the rest loaded**. Those four
 * are the spine of this file, and each is written with a healthy source beside
 * the broken one, because "fails closed" is only meaningful if something
 * survives.
 *
 * The determinism cases matter as much and are easier to lose. Load order
 * decides registration order, registration order decides tile-kind indices, and
 * those indices are bytes in every save (ADR-004 §2). A resolver that returned
 * a different order on a different machine would decode the same farm into
 * different terrain.
 */

import { describe, expect, it } from 'vitest';

import type { SourceManifest } from './manifest';
import { resolveSources, satisfiesRange } from './resolve';

const manifest = (id: string, overrides: Partial<SourceManifest> = {}): SourceManifest => ({
  id,
  namespaces: [id],
  name: id,
  version: '1.0.0',
  apiVersion: 1,
  provenance: 'thirdParty',
  dependencies: {},
  ...overrides,
});

const ids = (manifests: readonly SourceManifest[]): string[] => manifests.map((m) => m.id);

describe('every source gets a verdict', () => {
  it('loads independent sources', () => {
    const resolution = resolveSources([manifest('alpha'), manifest('beta')]);
    expect(ids(resolution.loaded)).toEqual(['alpha', 'beta']);
    expect(resolution.refused).toEqual([]);
  });

  it('accounts for every manifest handed in, loaded or refused', () => {
    const input = [
      manifest('good'),
      manifest('future', { apiVersion: 99 }),
      manifest('orphan', { dependencies: { absent: '*' } }),
    ];
    const resolution = resolveSources(input);

    const accounted = [...ids(resolution.loaded), ...resolution.refused.map((r) => r.id)].sort();
    expect(accounted).toEqual(['future', 'good', 'orphan']);
  });

  it('returns an empty resolution for no manifests', () => {
    expect(resolveSources([])).toEqual({ loaded: [], refused: [] });
  });
});

describe('the four refusals ROADMAP §5 names', () => {
  it('refuses a dependency cycle and loads everything outside it', () => {
    const resolution = resolveSources([
      manifest('healthy'),
      manifest('ouroboros', { dependencies: { tail: '*' } }),
      manifest('tail', { dependencies: { ouroboros: '*' } }),
    ]);

    expect(ids(resolution.loaded)).toEqual(['healthy']);
    expect(resolution.refused.map((r) => r.id)).toEqual(['ouroboros', 'tail']);
    for (const refusal of resolution.refused) {
      expect(refusal.error.message).toContain('cycle');
      expect(refusal.error.context).toMatchObject({ source: refusal.id });
    }
  });

  it('refuses a source whose dependency is missing, and names the dependency', () => {
    const resolution = resolveSources([
      manifest('healthy'),
      manifest('needy', { dependencies: { ghost: '*' } }),
    ]);

    expect(ids(resolution.loaded)).toEqual(['healthy']);
    expect(resolution.refused).toHaveLength(1);
    expect(resolution.refused[0]?.error.context).toMatchObject({
      source: 'needy',
      dependency: 'ghost',
    });
  });

  it('refuses a source targeting an API version this engine does not support', () => {
    const resolution = resolveSources([
      manifest('healthy'),
      manifest('fromthefuture', { apiVersion: 99 }),
    ]);

    expect(ids(resolution.loaded)).toEqual(['healthy']);
    expect(resolution.refused[0]?.id).toBe('fromthefuture');
    expect(resolution.refused[0]?.error.context).toMatchObject({ apiVersion: 99 });
  });

  it('refuses BOTH claimants of a contested namespace, naming them', () => {
    // `plugins/manifest.schema.json` states it for the `id` field: a collision
    // is rejected "for both sources". Picking a winner needs a rule for who is
    // first, and the resolver has only manifests -- deciding by alphabet would
    // mean whose content survives depends on what they called it.
    const resolution = resolveSources([
      manifest('first', { namespaces: ['first', 'shared'] }),
      manifest('second', { namespaces: ['second', 'shared'] }),
      manifest('bystander'),
    ]);

    expect(ids(resolution.loaded)).toEqual(['bystander']);
    expect(resolution.refused.map((r) => r.id)).toEqual(['first', 'second']);
    expect(resolution.refused[0]?.error.context).toMatchObject({ namespace: 'shared' });
  });

  it('refuses a source colliding with a namespace already owned, such as core', () => {
    const resolution = resolveSources(
      [manifest('impostor', { namespaces: ['impostor', 'core'] }), manifest('polite')],
      new Map([['core', 'core']]),
    );

    expect(ids(resolution.loaded)).toEqual(['polite']);
    expect(resolution.refused[0]?.error.context).toMatchObject({ owner: 'core' });
  });

  it('refuses a duplicated id outright — neither twin can be told apart', () => {
    const resolution = resolveSources([
      manifest('twin', { name: 'A' }),
      manifest('twin', { name: 'B' }),
      manifest('bystander'),
    ]);

    expect(ids(resolution.loaded)).toEqual(['bystander']);
    expect(resolution.refused.map((r) => r.id)).toEqual(['twin']);
  });
});

describe('a refusal strands its dependents rather than half-loading them', () => {
  it('refuses the dependent of a refused source, and says why', () => {
    const resolution = resolveSources([
      manifest('base', { apiVersion: 99 }),
      manifest('addon', { dependencies: { base: '*' } }),
      manifest('unrelated'),
    ]);

    expect(ids(resolution.loaded)).toEqual(['unrelated']);
    expect(resolution.refused.map((r) => r.id)).toEqual(['addon', 'base']);
  });

  it('cascades through a chain', () => {
    const resolution = resolveSources([
      manifest('a', { dependencies: { missing: '*' } }),
      manifest('b', { dependencies: { a: '*' } }),
      manifest('c', { dependencies: { b: '*' } }),
    ]);

    expect(resolution.loaded).toEqual([]);
    expect(resolution.refused.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('load order', () => {
  it('places a dependency before the source that needs it', () => {
    const resolution = resolveSources([
      manifest('zebra'),
      manifest('alpha', { dependencies: { zebra: '*' } }),
    ]);
    expect(ids(resolution.loaded)).toEqual(['zebra', 'alpha']);
  });

  it('orders a diamond so every dependency precedes its dependents', () => {
    const resolution = resolveSources([
      manifest('top', { dependencies: { left: '*', right: '*' } }),
      manifest('left', { dependencies: { base: '*' } }),
      manifest('right', { dependencies: { base: '*' } }),
      manifest('base'),
    ]);

    const order = ids(resolution.loaded);
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('left'));
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('right'));
    expect(order.indexOf('left')).toBeLessThan(order.indexOf('top'));
    expect(order.indexOf('right')).toBeLessThan(order.indexOf('top'));
  });

  it('breaks ties by id ascending, never by the order handed in', () => {
    // The input order here is filesystem order's stand-in. If it leaked into
    // the result, two machines would register tile kinds in different orders
    // and decode the same save into different terrain.
    const forwards = resolveSources([manifest('c'), manifest('a'), manifest('b')]);
    const backwards = resolveSources([manifest('b'), manifest('c'), manifest('a')]);

    expect(ids(forwards.loaded)).toEqual(['a', 'b', 'c']);
    expect(ids(backwards.loaded)).toEqual(['a', 'b', 'c']);
  });

  it('is identical across permutations of a dependency graph', () => {
    const build = () => [
      manifest('top', { dependencies: { left: '*', right: '*' } }),
      manifest('left', { dependencies: { base: '*' } }),
      manifest('right', { dependencies: { base: '*' } }),
      manifest('base'),
    ];

    const first = ids(resolveSources(build()).loaded);
    const reversed = ids(resolveSources([...build()].reverse()).loaded);
    expect(reversed).toEqual(first);
  });
});

describe('satisfiesRange', () => {
  it('accepts any version for `*`', () => {
    expect(satisfiesRange('0.0.1', '*')).toBe(true);
    expect(satisfiesRange('9.9.9', '*')).toBe(true);
  });

  it('accepts only the same version for an exact range', () => {
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false);
  });

  it('accepts at-or-above within the same major for a caret range', () => {
    expect(satisfiesRange('1.2.3', '^1.2.3')).toBe(true);
    expect(satisfiesRange('1.3.0', '^1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.2', '^1.2.3')).toBe(false);
    expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false);
    expect(satisfiesRange('0.9.9', '^1.0.0')).toBe(false);
  });

  it('refuses a range it does not understand rather than guessing', () => {
    // A misread range is worse than a rejected one: the author is told nothing
    // and the mismatch surfaces later as content that simply is not there.
    for (const range of ['>=1.0.0', '~1.2.3', '1.x', 'latest', '']) {
      expect(satisfiesRange('1.2.3', range), range).toBe(false);
    }
  });

  it('is used by the resolver to refuse an unsatisfied dependency', () => {
    const resolution = resolveSources([
      manifest('base', { version: '1.0.0' }),
      manifest('addon', { dependencies: { base: '^2.0.0' } }),
    ]);

    expect(ids(resolution.loaded)).toEqual(['base']);
    expect(resolution.refused[0]?.error.context).toMatchObject({
      dependency: 'base',
      required: '^2.0.0',
      found: '1.0.0',
    });
  });
});
