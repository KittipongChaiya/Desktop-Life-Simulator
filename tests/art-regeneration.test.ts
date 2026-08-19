/**
 * Running every art generator changes nothing. Phase-52.
 *
 * ## The guarantee
 *
 * ADR-006 §2 makes the art scripts deterministic so that **re-running them is
 * byte-identical**, and any change to the art is therefore an intentional git
 * diff rather than noise. Five versions have relied on that. Nothing tested
 * it, and at the v0.5 RC it was false in two separate ways.
 *
 * ## What it was false for
 *
 * 1. `lint-staged` ran Prettier over the generated `.anim.json` sidecars.
 *    Prettier collapses short arrays onto one line; `JSON.stringify(v, null, 2)`
 *    never does. Every commit rewrote six files and every regeneration rewrote
 *    them back. Fixed with `.prettierignore`, guarded by
 *    `generated-assets.test.ts`.
 *
 * 2. **Two superseded generators still wrote live filenames.**
 *    `generate-placeholder-worker-art.mjs` (phase-04c) and
 *    `generate-placeholder-item-building-art.mjs` (phase-05d) produced the
 *    crude stand-ins whose whole stated purpose was to be replaced "with no
 *    code change" — which happened, in phases 36 and 33–34. But they wrote the
 *    SAME filenames as the production generators, so running one reverted the
 *    worker rig to 16×16 grey blobs, or the storage shed and four item icons
 *    to their placeholders, and dropped an animation on the way. They are
 *    deleted; this test is what notices the next one.
 *
 * ## Why it is written this way
 *
 * It runs the real scripts, because a test that models what a generator does
 * would agree with itself while the file on disk drifted — the same trap the
 * `catch-up` property tests avoid by comparing against the real simulation.
 *
 * It snapshots every byte under `assets/src` first and **restores anything it
 * changed**, so a failure reports the drift without leaving the working tree
 * holding it.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const ASSET_SRC = join(ROOT, 'assets', 'src');
const SCRIPTS = join(ROOT, 'scripts');

/**
 * The generators that write into `assets/src`.
 *
 * Named rather than globbed: `generate-contact-sheet` and
 * `generate-scene-sheet` are review tools that write elsewhere, and
 * `generate-sprite-manifest` and `generate-audio` are pipeline steps run by
 * `npm run assets`. Listing the art scripts explicitly means adding one is a
 * deliberate act, and forgetting to add one only costs coverage rather than
 * producing a false pass.
 */
const ART_GENERATORS = [
  'generate-world-art.mjs',
  'generate-character-art.mjs',
  'generate-crop-art.mjs',
  'generate-icon-art.mjs',
  'generate-glyph-art.mjs',
] as const;

function everyFile(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? everyFile(path) : [path];
  });
}

function snapshot(): Map<string, Buffer> {
  return new Map(everyFile(ASSET_SRC).map((path) => [path, readFileSync(path)]));
}

describe('the art regenerates byte-identically (ADR-006 §2)', () => {
  it('lists generators that exist', () => {
    // A guard whose subject was renamed passes silently otherwise.
    const present = new Set(readdirSync(SCRIPTS));
    for (const script of ART_GENERATORS) {
      expect(present.has(script), `${script} is listed here but not on disk`).toBe(true);
    }
  });

  it('leaves every committed asset unchanged', () => {
    const before = snapshot();

    for (const script of ART_GENERATORS) {
      execFileSync(process.execPath, [join(SCRIPTS, script)], { cwd: ROOT, stdio: 'ignore' });
    }

    const after = snapshot();
    const changed: string[] = [];

    for (const [path, bytes] of after) {
      const original = before.get(path);
      if (original === undefined) {
        changed.push(`${relative(ROOT, path)} (new)`);
        continue;
      }
      if (!original.equals(bytes)) changed.push(relative(ROOT, path));
    }
    for (const path of before.keys()) {
      if (!after.has(path)) changed.push(`${relative(ROOT, path)} (deleted)`);
    }

    // Put back whatever moved, so a failure reports drift instead of leaving
    // the working tree holding it. Files the run CREATED are left alone —
    // deleting something a generator produced would be the worse mistake.
    for (const [path, bytes] of before) {
      if (!after.get(path)?.equals(bytes)) writeFileSync(path, bytes);
    }

    expect(
      changed,
      'regenerating the art changed committed files — either the art was edited ' +
        'without re-running its generator, or two generators write the same file',
    ).toEqual([]);
  }, 300_000);
});
