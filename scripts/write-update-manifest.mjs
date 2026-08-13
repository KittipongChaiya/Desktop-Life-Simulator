/**
 * Writes the update manifest published beside the installer.
 * Phase-15 — ADR-025 §2, §6.
 *
 * `electron-updater`'s generated `latest.yml` answers one question — what
 * version exists. The policy needs three more, and there is no supported way
 * to add them to that file (`TECH_STACK.md` §7.4). So they travel here, in a
 * small JSON document uploaded as a release asset.
 *
 * That separation is what makes ADR-025 §6's halt cheap: stopping an in-flight
 * rollout is editing `halted` in this file and re-uploading it. No rebuild, no
 * binary re-publish, nothing to sign.
 *
 * Run via `npm run release:manifest -- --rollout=<0-100> [--out=<path>]`.
 * Output is gitignored — it belongs to a release, not to the repository.
 *
 * The shape this writes is asserted against `parseReleaseManifest` — the
 * consumer that will actually read it — in `tests/update-manifest-script.test.ts`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SCHEMA_SOURCE = join(ROOT, 'src', 'persistence', 'schema.ts');

/**
 * The schema version this build reads.
 *
 * Extracted from the source rather than duplicated, because the whole point of
 * the field is that it describes THIS build. A manifest claiming a schema the
 * binary does not read would make the rollback guard confidently wrong — it
 * would refuse safe updates or, worse, allow one that orphans a farm.
 *
 * A regex over TypeScript is crude. It is guarded: the test imports the real
 * constant and asserts this extraction agrees with it, so a change to the
 * declaration breaks the suite rather than the release.
 *
 * @returns {number}
 */
export function currentSchemaVersion() {
  const source = readFileSync(SCHEMA_SOURCE, 'utf8');
  const found = /export const CURRENT_SCHEMA_VERSION = (\d+)/u.exec(source);
  if (found?.[1] === undefined) {
    throw new Error(`CURRENT_SCHEMA_VERSION not found in ${SCHEMA_SOURCE}`);
  }
  return Number(found[1]);
}

/**
 * The version electron-builder will ship, from the one file that decides it.
 *
 * @returns {string}
 */
export function currentVersion() {
  // Narrowed through `unknown` first, the same way `generate-sprite-manifest`
  // does it: `JSON.parse` returns `any`, and letting that escape would put an
  // unchecked type into the one field the whole manifest is keyed on.
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('package.json did not parse to an object');
  }

  const version = /** @type {{ version?: unknown }} */ (parsed).version;
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('package.json declares no version');
  }
  return version;
}

/**
 * Builds the manifest body.
 *
 * `rolloutPercent` has NO DEFAULT, deliberately. ADR-025 §6 describes a wave
 * the publisher widens as a build proves itself, so picking one on their
 * behalf would be choosing how many farms take an unproven release. The script
 * refuses to run without it.
 *
 * `halted` is always false here, because a halted release is not something you
 * publish — it is something you do to a release already out, by editing this
 * file. Writing `true` at publish time would mean uploading a build nobody can
 * ever be offered.
 *
 * @param {number} rolloutPercent
 * @returns {{version: string, schemaVersion: number, rolloutPercent: number, halted: boolean}}
 */
export function buildManifest(rolloutPercent) {
  if (!Number.isFinite(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) {
    throw new Error(`--rollout must be a number from 0 to 100, got: ${String(rolloutPercent)}`);
  }

  return {
    version: currentVersion(),
    schemaVersion: currentSchemaVersion(),
    rolloutPercent,
    halted: false,
  };
}

/** @param {string[]} argv @param {string} name @returns {string | undefined} */
function flag(argv, name) {
  const prefix = `--${name}=`;
  return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function main() {
  const argv = globalThis.process.argv.slice(2);
  const rollout = flag(argv, 'rollout');

  if (rollout === undefined) {
    // Stated rather than defaulted: see `buildManifest`.
    throw new Error(
      'Missing --rollout. ADR-025 §6 stages a rollout; the publisher chooses the wave.\n' +
        '  npm run release:manifest -- --rollout=25',
    );
  }

  const out = flag(argv, 'out') ?? join(ROOT, 'release', 'update-manifest.json');
  const manifest = buildManifest(Number(rollout));

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // Operational output, not a debug statement: this runs in a release
  // pipeline, and a publish step that says nothing about what it published is
  // undiagnosable after the fact. `globalThis.console` is this repo's idiom in
  // `scripts/` — the flat config declares no Node globals here.
  globalThis.console.log(`wrote ${out}: ${JSON.stringify(manifest)}`);
}

// Importable for the test, runnable for the pipeline. Under vitest `argv[1]`
// is the runner, so importing this module never writes a file.
if (globalThis.process.argv[1]?.endsWith('write-update-manifest.mjs') === true) main();
