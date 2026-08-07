/**
 * Content sources and namespace ownership. Phase-08a — ADR-026 §1, §2.
 *
 * Two rules, and both are load-time rules: a namespace has exactly one owner,
 * and a collision refuses a source outright rather than merging it. ADR-026
 * §Validation asks specifically that a collision leave **neither** source
 * partially registered, which is why the all-or-nothing cases below outnumber
 * the happy path — a source owning three of its four namespaces is a state
 * nothing downstream can reason about.
 *
 * The provenance tests are the other half. Provenance decides trust HERE and is
 * never read again (ADR-026 §2), so what has to be proven is not that it works
 * but that it is available to the load decision and carried nowhere else.
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../shared/errors';
import { RESERVED_NAMESPACES } from '../../shared/ids';

import { createSourceRegistry, Provenance, type ContentSource } from './sources';

const source = (overrides: Partial<ContentSource> = {}): ContentSource => ({
  id: 'harvestmoon',
  namespaces: ['harvestmoon'],
  provenance: Provenance.ThirdParty,
  displayName: 'Harvest Moon Expansion',
  version: '1.0.0',
  ...overrides,
});

const CORE = source({
  id: 'core',
  namespaces: ['core'],
  provenance: Provenance.Builtin,
  displayName: 'Desktop Life Simulator',
});

describe('register', () => {
  it('claims every namespace a source owns', () => {
    const registry = createSourceRegistry();
    const multi = source({ namespaces: ['harvestmoon', 'harvestmoon_crops'] });

    expect(registry.register(multi).ok).toBe(true);
    expect(registry.ownerOf('harvestmoon')).toBe(multi);
    expect(registry.ownerOf('harvestmoon_crops')).toBe(multi);
    expect(registry.size).toBe(1);
  });

  it('refuses a source with no namespace — it could own no content', () => {
    const result = createSourceRegistry().register(source({ namespaces: [] }));
    expect(result.ok).toBe(false);
  });

  it('refuses a malformed namespace', () => {
    for (const namespace of ['Harvest', 'harvest moon', 'harvest:moon', '', 'harvest-moon']) {
      const result = createSourceRegistry().register(source({ namespaces: [namespace] }));
      expect(result.ok, namespace).toBe(false);
    }
  });

  it('refuses the same source id twice', () => {
    const registry = createSourceRegistry();
    registry.register(source());
    const result = registry.register(source({ namespaces: ['other'] }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.DuplicateContent);
  });
});

describe('a namespace has exactly one owner', () => {
  it('refuses a second claim and names both parties', () => {
    const registry = createSourceRegistry();
    registry.register(source({ id: 'first' }));
    const result = registry.register(source({ id: 'second' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.DuplicateContent);
      expect(result.error.context).toMatchObject({ owner: 'first', claimant: 'second' });
    }
  });

  it('leaves the first owner in place — a collision is not a merge', () => {
    const registry = createSourceRegistry();
    const first = source({ id: 'first' });
    registry.register(first);
    registry.register(source({ id: 'second' }));

    expect(registry.ownerOf('harvestmoon')).toBe(first);
    expect(registry.size).toBe(1);
    expect(registry.get('second')).toBeUndefined();
  });

  it('registers NOTHING when one of several namespaces collides', () => {
    // The all-or-nothing case ADR-026 §Validation names. A source owning two of
    // its three namespaces owns some of its IDs and not others.
    const registry = createSourceRegistry();
    registry.register(source({ id: 'first', namespaces: ['contested'] }));

    const result = registry.register(
      source({ id: 'second', namespaces: ['fresh_one', 'contested', 'fresh_two'] }),
    );

    expect(result.ok).toBe(false);
    expect(registry.ownerOf('fresh_one')).toBeUndefined();
    expect(registry.ownerOf('fresh_two')).toBeUndefined();
    expect(registry.size).toBe(1);
  });

  it('registers nothing when a later namespace is malformed', () => {
    const registry = createSourceRegistry();
    const result = registry.register(source({ namespaces: ['fine', 'NOT FINE'] }));

    expect(result.ok).toBe(false);
    expect(registry.ownerOf('fine')).toBeUndefined();
    expect(registry.size).toBe(0);
  });
});

describe('reserved namespaces are first-party ground', () => {
  it('refuses a third-party claim on every reserved name', () => {
    for (const namespace of RESERVED_NAMESPACES) {
      const registry = createSourceRegistry();
      const result = registry.register(source({ namespaces: [namespace] }));

      expect(result.ok, namespace).toBe(false);
      expect(registry.size, namespace).toBe(0);
    }
  });

  it('lets built-in and official content claim them', () => {
    for (const provenance of [Provenance.Builtin, Provenance.Official, Provenance.Dlc]) {
      const registry = createSourceRegistry();
      const result = registry.register(source({ provenance, namespaces: ['official'] }));
      expect(result.ok, provenance).toBe(true);
    }
  });

  it('lets a third party claim anything not reserved', () => {
    const registry = createSourceRegistry();
    expect(registry.register(source({ namespaces: ['moon_melons'] })).ok).toBe(true);
  });
});

describe('the registry as a whole', () => {
  it('is empty until something registers', () => {
    const registry = createSourceRegistry();
    expect(registry.size).toBe(0);
    expect(registry.all()).toEqual([]);
    expect(registry.ownerOf('core')).toBeUndefined();
  });

  it('preserves registration order — load order is world state (ADR-019 §6)', () => {
    const registry = createSourceRegistry();
    for (const id of ['c_source', 'a_source', 'b_source']) {
      registry.register(source({ id, namespaces: [id] }));
    }
    expect(registry.all().map((s) => s.id)).toEqual(['c_source', 'a_source', 'b_source']);
  });

  it('omits a refused source from order and lookup alike', () => {
    const registry = createSourceRegistry();
    registry.register(CORE);
    registry.register(source({ id: 'impostor', namespaces: ['core'] }));

    expect(registry.all()).toEqual([CORE]);
    expect(registry.get('impostor')).toBeUndefined();
  });

  it('carries provenance for the load decision to read', () => {
    // Recorded here and nowhere else. Nothing under `src/sim` outside this
    // module may read it (ADR-026 §2) — asserted separately by the
    // provenance-blindness test in `tests/boundaries.test.ts`.
    const registry = createSourceRegistry();
    registry.register(CORE);
    expect(registry.get('core')?.provenance).toBe(Provenance.Builtin);
    expect(registry.get('core')?.displayName).toBe('Desktop Life Simulator');
  });
});
