/**
 * Manifest validation. Phase-09a — ADR-019 §1, ADR-026 §1.
 *
 * A manifest arrives from disk, which `AI_RULES.md` §2.4 defines as untrusted,
 * and it is the only thing the engine knows about a source before deciding
 * whether to load it. So the shape of this file is the shape of `validate.ts`:
 * mostly rejections, because the accepting case is one test and the ways a
 * hand-written JSON file can be wrong are many.
 *
 * The last block is the one that earns its keep over time. It reads
 * `plugins/manifest.schema.json` — the PUBLISHED contract an author writes
 * against — and asserts this module enforces what it advertises. A rule in the
 * schema that nothing checks is not a rule, and the two files drifting apart is
 * the same defect phase-08.0 found between `TESTING.md` §4 and the coverage
 * config: a document describing a gate nobody runs.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseManifest, supportsApiVersion } from './manifest';
import { PLUGIN_API_VERSION } from './plugin-api';
import { Provenance } from './sources';

const valid = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'harvestmoon',
  name: 'Harvest Moon Expansion',
  version: '1.2.3',
  apiVersion: 1,
  ...overrides,
});

describe('a well-formed manifest', () => {
  it('is accepted, with its declared fields carried through', () => {
    const result = parseManifest(valid());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      id: 'harvestmoon',
      name: 'Harvest Moon Expansion',
      version: '1.2.3',
      apiVersion: 1,
    });
  });

  it('defaults provenance to third-party — the least privileged kind', () => {
    const result = parseManifest(valid());
    expect(result.ok && result.value.provenance).toBe(Provenance.ThirdParty);
  });

  it('owns its id as a namespace, plus any it declares', () => {
    const result = parseManifest(valid({ additionalNamespaces: ['harvestmoon_crops'] }));
    expect(result.ok && result.value.namespaces).toEqual(['harvestmoon', 'harvestmoon_crops']);
  });

  it('carries an empty dependency set when none is declared', () => {
    const result = parseManifest(valid());
    expect(result.ok && result.value.dependencies).toEqual({});
  });

  it('accepts the optional descriptive fields the schema allows', () => {
    const result = parseManifest(
      valid({
        description: 'Adds sunflowers',
        author: 'Someone',
        license: 'MIT',
        homepage: 'https://example.invalid',
        saveSchemaVersion: 2,
        entry: 'index.js',
        content: { definitions: ['crops.json'] },
        assets: { atlases: ['atlas.png'] },
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('rejections name the source, so a refusal says which plugin to fix', () => {
  it('rejects a non-object', () => {
    for (const junk of [null, 7, 'manifest', [], undefined]) {
      expect(parseManifest(junk).ok, String(junk)).toBe(false);
    }
  });

  it('rejects a missing or malformed id', () => {
    for (const id of [undefined, '', 'Harvest Moon', 'harvest-moon', 'harvest:moon', 7]) {
      expect(parseManifest(valid({ id })).ok, String(id)).toBe(false);
    }
  });

  it('rejects an empty or missing name — the player is shown it when the source is gone', () => {
    for (const name of [undefined, '', 7]) {
      expect(parseManifest(valid({ name })).ok, String(name)).toBe(false);
    }
  });

  it('rejects a version that is not major.minor.patch', () => {
    for (const version of [undefined, '1.2', 'v1.2.3', '1.2.3-beta', 1.2]) {
      expect(parseManifest(valid({ version })).ok, String(version)).toBe(false);
    }
  });

  it('rejects an apiVersion that is not a positive integer', () => {
    for (const apiVersion of [undefined, 0, -1, 1.5, '1']) {
      expect(parseManifest(valid({ apiVersion })).ok, String(apiVersion)).toBe(false);
    }
  });

  it('rejects an unknown provenance rather than defaulting it', () => {
    expect(parseManifest(valid({ provenance: 'trusted' })).ok).toBe(false);
  });

  it('rejects an unknown field — a typo must not be silently ignored', () => {
    // `additionalProperties: false` in the schema. A misspelled `dependencies`
    // that loads anyway is a source whose dependency is simply never checked.
    expect(parseManifest(valid({ dependancies: {} })).ok).toBe(false);
  });

  it('rejects malformed additional namespaces, including repeats', () => {
    expect(parseManifest(valid({ additionalNamespaces: 'one' })).ok).toBe(false);
    expect(parseManifest(valid({ additionalNamespaces: ['Bad Name'] })).ok).toBe(false);
    expect(parseManifest(valid({ additionalNamespaces: ['harvestmoon'] })).ok).toBe(false);
  });

  it('rejects a malformed dependency declaration', () => {
    expect(parseManifest(valid({ dependencies: [] })).ok).toBe(false);
    expect(parseManifest(valid({ dependencies: { 'Bad Id': '*' } })).ok).toBe(false);
    expect(parseManifest(valid({ dependencies: { other: 7 } })).ok).toBe(false);
    expect(parseManifest(valid({ dependencies: { other: '' } })).ok).toBe(false);
  });

  it('rejects a source that depends on itself', () => {
    expect(parseManifest(valid({ dependencies: { harvestmoon: '*' } })).ok).toBe(false);
  });

  it('rejects a bad saveSchemaVersion', () => {
    for (const saveSchemaVersion of [0, -1, 1.5, '1']) {
      expect(parseManifest(valid({ saveSchemaVersion })).ok, String(saveSchemaVersion)).toBe(false);
    }
  });
});

describe('reserved namespaces', () => {
  it('refuses a third-party source claiming one, at the loader rather than later', () => {
    // Also refused at registration (ADR-026 §1). Catching it here means the
    // author is told by the thing that can name the file.
    const result = parseManifest(valid({ id: 'core' }));
    expect(result.ok).toBe(false);
  });

  it('refuses a reserved name hidden in additionalNamespaces', () => {
    expect(parseManifest(valid({ additionalNamespaces: ['official'] })).ok).toBe(false);
  });

  it('allows first-party provenance to claim them', () => {
    const result = parseManifest(valid({ id: 'official', provenance: Provenance.Official }));
    expect(result.ok).toBe(true);
  });
});

describe('supportsApiVersion', () => {
  it('supports every version this engine has shipped', () => {
    for (let version = 1; version <= PLUGIN_API_VERSION; version += 1) {
      expect(supportsApiVersion(version), String(version)).toBe(true);
    }
  });

  it('refuses a version from the future rather than half-loading it', () => {
    expect(supportsApiVersion(PLUGIN_API_VERSION + 1)).toBe(false);
  });

  it('refuses a nonsensical version', () => {
    expect(supportsApiVersion(0)).toBe(false);
    expect(supportsApiVersion(-1)).toBe(false);
  });
});

describe('the implementation matches the published schema', () => {
  const schema = JSON.parse(
    readFileSync(
      join(resolve(import.meta.dirname, '..', '..', '..'), 'plugins', 'manifest.schema.json'),
      'utf8',
    ),
  ) as {
    required: string[];
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };

  it('requires exactly what the schema requires', () => {
    for (const field of schema.required) {
      const without = valid();
      delete without[field];
      expect(parseManifest(without).ok, `missing ${field} should be refused`).toBe(false);
    }
  });

  it('accepts every field the schema declares', () => {
    // Guards the opposite failure from the unknown-field test: a field an author
    // reads in the schema and writes into their manifest must not be refused.
    for (const field of Object.keys(schema.properties)) {
      const probe = valid({ [field]: valid()[field] ?? sampleFor(field) });
      expect(parseManifest(probe).ok, `schema field ${field} should be accepted`).toBe(true);
    }
  });

  it('forbids unknown fields, as the schema does', () => {
    expect(schema.additionalProperties).toBe(false);
    expect(parseManifest(valid({ notInTheSchema: true })).ok).toBe(false);
  });
});

/** A plausible value per schema field, for the accept-everything check. */
function sampleFor(field: string): unknown {
  switch (field) {
    case 'additionalNamespaces':
      return ['harvestmoon_extra'];
    case 'provenance':
      return Provenance.ThirdParty;
    case 'saveSchemaVersion':
      return 1;
    case 'content':
      return { definitions: ['crops.json'] };
    case 'assets':
      return { atlases: ['atlas.png'] };
    case 'dependencies':
      return { other: '*' };
    default:
      return 'a string';
  }
}
