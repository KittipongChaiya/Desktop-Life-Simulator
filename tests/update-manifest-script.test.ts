/**
 * The publisher writes what the client reads. Phase-15 — ADR-025 §2, §6.
 *
 * Two halves of one format, in two languages, that must agree: a `.mjs` build
 * script writes `update-manifest.json`, and `parseReleaseManifest` in the
 * shipped binary reads it. Nothing else connects them.
 *
 * So this test connects them. It builds a manifest with the real producer and
 * feeds it to the real consumer, rather than checking each against a fixture —
 * two fixtures drift, and the drift is invisible until a release nobody can
 * take.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildManifest,
  currentSchemaVersion,
  currentVersion,
} from '../scripts/write-update-manifest.mjs';
import { parseReleaseManifest } from '../src/main/release-manifest';
import { CURRENT_SCHEMA_VERSION } from '../src/persistence/schema';

const ROOT = join(__dirname, '..');

describe('the producer and the consumer agree', () => {
  it('writes a manifest the client accepts, field for field', () => {
    // The whole point. A producer that emitted a shape `parseReleaseManifest`
    // refuses would publish a release every client silently declines — and
    // declining is exactly what it is supposed to do with a bad manifest, so
    // nothing would look broken anywhere.
    const built = buildManifest(25);

    expect(parseReleaseManifest(built)).toEqual(built);
  });

  it('survives the JSON round trip the release asset actually makes', () => {
    // The script writes text and the client parses text. Asserting on the
    // in-memory object alone would miss anything JSON cannot carry.
    const built = buildManifest(0);

    expect(parseReleaseManifest(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });
});

describe('the schema version it publishes is this build\u2019s', () => {
  it('matches the constant the binary actually reads', () => {
    // The script extracts this with a regex over TypeScript, which is crude
    // and is why this assertion exists. A manifest claiming a schema the
    // binary does not read makes the rollback guard confidently wrong: it
    // would refuse safe updates, or allow one that orphans a farm.
    expect(currentSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('publishes the version in package.json, which is what electron-builder ships', () => {
    const parsed = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      version: string;
    };

    expect(currentVersion()).toBe(parsed.version);
    expect(buildManifest(50).version).toBe(parsed.version);
  });
});

describe('the wave is the publisher\u2019s to choose', () => {
  it('carries the rollout it was given', () => {
    expect(buildManifest(25).rolloutPercent).toBe(25);
  });

  it.each([[-1], [101], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'refuses %s rather than clamping it',
    (rollout) => {
      // Clamping would pick a wave nobody chose, which is the same failure
      // `parseReleaseManifest` refuses on the reading side. Both ends of one
      // format fail the same way on purpose.
      expect(() => buildManifest(rollout)).toThrow(/rollout/iu);
    },
  );

  it('publishes un-halted, because a halt is done to a release already out', () => {
    // Writing `halted: true` at publish time would upload a build nobody can
    // ever be offered. The halt is an edit to this file afterwards — which is
    // the whole reason the manifest is separate from the generated feed.
    expect(buildManifest(100).halted).toBe(false);
  });
});
