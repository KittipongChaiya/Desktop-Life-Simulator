/**
 * Finding content sources on disk. Phase-09d.
 *
 * Written against a REAL directory tree, in the `save-store.test.ts` tradition:
 * every failure mode here is a filesystem one, and a mocked `fs` would only
 * prove the mock behaves as configured.
 *
 * The rule under test throughout is that **nothing is silently dropped**. A
 * plugin that fails to appear, with no explanation anywhere, is the worst
 * outcome for its author — they cannot tell a typo from an engine bug from
 * having installed it in the wrong place. Every directory that looks like a
 * source and is not usable comes back named, with a reason.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverSources, MANIFEST_FILENAME } from './plugin-discovery';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dls-plugins-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes a source directory with the given manifest text. */
function source(name: string, manifest: string): void {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, MANIFEST_FILENAME), manifest, 'utf8');
}

const validManifest = (id: string): string =>
  JSON.stringify({ id, name: `Source ${id}`, version: '1.0.0', apiVersion: 1 });

describe('discoverSources', () => {
  it('reads every source directory it finds', () => {
    source('alpha', validManifest('alpha'));
    source('beta', validManifest('beta'));

    const discovery = discoverSources(dir);
    expect(discovery.sources.map((s) => s.directory)).toEqual(['alpha', 'beta']);
    expect(discovery.failed).toEqual([]);
  });

  it('returns the manifest parsed but UNVALIDATED — judgement is src/sim’s', () => {
    // This layer may not import the simulation, and should not want to: reading
    // files is a platform capability, deciding what a manifest means is policy.
    source('alpha', JSON.stringify({ id: 'alpha', anything: 'goes here' }));

    const [found] = discoverSources(dir).sources;
    expect(found?.manifest).toEqual({ id: 'alpha', anything: 'goes here' });
  });

  it('is empty when no plugins directory exists — the normal case', () => {
    expect(discoverSources(join(dir, 'absent'))).toEqual({ sources: [], failed: [] });
  });

  it('is empty for an existing but empty directory', () => {
    expect(discoverSources(dir).sources).toEqual([]);
  });
});

describe('nothing is dropped silently', () => {
  it('reports a directory with no manifest, by name', () => {
    mkdirSync(join(dir, 'forgotten'), { recursive: true });

    const discovery = discoverSources(dir);
    expect(discovery.sources).toEqual([]);
    expect(discovery.failed).toEqual([
      { directory: 'forgotten', reason: `no ${MANIFEST_FILENAME}` },
    ]);
  });

  it('reports an unparseable manifest, by name, and keeps the others', () => {
    source('good', validManifest('good'));
    source('broken', '{ "id": "broken", ');

    const discovery = discoverSources(dir);
    expect(discovery.sources.map((s) => s.directory)).toEqual(['good']);
    expect(discovery.failed[0]).toMatchObject({ directory: 'broken' });
    expect(discovery.failed[0]?.reason).toContain('not valid JSON');
  });

  it('one broken source never hides a working one', () => {
    // ADR-019 §6: a failure refuses that source and leaves the rest loaded.
    source('aaa_broken', 'not json at all');
    source('zzz_fine', validManifest('zzz_fine'));

    const discovery = discoverSources(dir);
    expect(discovery.sources.map((s) => s.directory)).toEqual(['zzz_fine']);
    expect(discovery.failed.map((f) => f.directory)).toEqual(['aaa_broken']);
  });
});

describe('things that are not sources', () => {
  it('ignores stray files beside the source directories', () => {
    writeFileSync(join(dir, 'README.txt'), 'not a plugin', 'utf8');
    source('alpha', validManifest('alpha'));

    const discovery = discoverSources(dir);
    expect(discovery.sources.map((s) => s.directory)).toEqual(['alpha']);
    expect(discovery.failed).toEqual([]); // a loose file is not a failed source
  });
});

describe('enumeration order is stable but carries no meaning', () => {
  it('sorts directories, so the payload does not depend on the filesystem', () => {
    for (const name of ['zulu', 'alpha', 'mike']) source(name, validManifest(name));
    expect(discoverSources(dir).sources.map((s) => s.directory)).toEqual(['alpha', 'mike', 'zulu']);
  });

  it('sorts failures too, so a load report reads the same on every machine', () => {
    for (const name of ['zulu', 'alpha']) {
      mkdirSync(join(dir, name), { recursive: true });
    }
    expect(discoverSources(dir).failed.map((f) => f.directory)).toEqual(['alpha', 'zulu']);
  });
});

describe('a manifest cannot read outside its own directory', () => {
  it('refuses a definition path that escapes the source', () => {
    // The manifest is downloaded, and `readFileSync` will happily follow
    // `../../../` out of the plugins directory. This is the only place that can
    // stop it, so it is tested rather than assumed.
    writeFileSync(join(dir, 'secret.json'), '{"stolen":true}', 'utf8');
    mkdirSync(join(dir, 'nosy'), { recursive: true });
    writeFileSync(
      join(dir, 'nosy', MANIFEST_FILENAME),
      JSON.stringify({
        id: 'nosy',
        name: 'Nosy',
        version: '1.0.0',
        apiVersion: 1,
        content: { definitions: ['../secret.json'] },
      }),
      'utf8',
    );

    const discovery = discoverSources(dir);
    expect(discovery.sources).toEqual([]);
    expect(discovery.failed[0]?.reason).toContain('escapes the source');
  });

  it('refuses an absolute definition path outright', () => {
    mkdirSync(join(dir, 'absolute'), { recursive: true });
    writeFileSync(
      join(dir, 'absolute', MANIFEST_FILENAME),
      JSON.stringify({
        id: 'absolute',
        name: 'Absolute',
        version: '1.0.0',
        apiVersion: 1,
        content: { definitions: [join(dir, 'secret.json')] },
      }),
      'utf8',
    );

    expect(discoverSources(dir).sources).toEqual([]);
  });

  it('reads a definition file that stays inside', () => {
    mkdirSync(join(dir, 'polite', 'data'), { recursive: true });
    writeFileSync(join(dir, 'polite', 'data', 'crops.json'), '{"crops":[]}', 'utf8');
    writeFileSync(
      join(dir, 'polite', MANIFEST_FILENAME),
      JSON.stringify({
        id: 'polite',
        name: 'Polite',
        version: '1.0.0',
        apiVersion: 1,
        content: { definitions: ['data/crops.json'] },
      }),
      'utf8',
    );

    const [found] = discoverSources(dir).sources;
    expect(found?.definitions['data/crops.json']).toEqual({ crops: [] });
  });

  it('refuses the whole source when one declared file is missing', () => {
    // Half a source is a world whose saves reference definitions that do not
    // exist — all or nothing.
    mkdirSync(join(dir, 'partial'), { recursive: true });
    writeFileSync(
      join(dir, 'partial', MANIFEST_FILENAME),
      JSON.stringify({
        id: 'partial',
        name: 'Partial',
        version: '1.0.0',
        apiVersion: 1,
        content: { definitions: ['gone.json'] },
      }),
      'utf8',
    );

    const discovery = discoverSources(dir);
    expect(discovery.sources).toEqual([]);
    expect(discovery.failed[0]?.reason).toContain('missing');
  });
});
