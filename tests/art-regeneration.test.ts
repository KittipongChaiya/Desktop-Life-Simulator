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
 * It snapshots the generated directories first and **restores anything it
 * changed**, so a failure reports the drift without leaving the working tree
 * holding it. What it watches is scoped deliberately — see `GENERATED_DIRS`,
 * where the first version of this test broke another one.
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

/**
 * The directories the art generators write into — the texture-packer source
 * folders, and nothing else.
 *
 * SCOPED RATHER THAN WHOLE-TREE, and the reason is a defect this test caused
 * on its first full-suite run. Snapshotting all of `assets/src` swept up
 * `assets/src/audio/`, which is the AUDIO pipeline's input and is written and
 * deleted by `audio-replacement-path.test.ts`. Vitest runs files in parallel,
 * so this test snapshotted that fixture, the audio test removed it, and the
 * restore loop below faithfully put it back — leaving a test fixture sitting
 * in the repository as the shipped click.
 *
 * A guard that damages the tree it is guarding is worse than no guard. It now
 * watches only what the generators own.
 */
const GENERATED_DIRS = [
  'terrain{tps}',
  'buildings{tps}',
  'crops{tps}',
  'entities{tps}',
  'ui-world{tps}',
];

function snapshot(): Map<string, Buffer> {
  const files = GENERATED_DIRS.flatMap((name) => everyFile(join(ASSET_SRC, name)));
  return new Map(files.map((path) => [path, readFileSync(path)]));
}

describe('the art regenerates byte-identically (ADR-006 §2)', () => {
  it('lists generators and directories that exist', () => {
    // A guard whose subject was renamed passes silently otherwise — and this
    // one has two subjects, either of which could be renamed out from under
    // it without a single assertion noticing.
    const present = new Set(readdirSync(SCRIPTS));
    for (const script of ART_GENERATORS) {
      expect(present.has(script), `${script} is listed here but not on disk`).toBe(true);
    }

    const dirs = new Set(readdirSync(ASSET_SRC));
    for (const name of GENERATED_DIRS) {
      expect(dirs.has(name), `${name} is watched here but not on disk`).toBe(true);
    }
    expect(snapshot().size, 'the snapshot is empty, so it can prove nothing').toBeGreaterThan(0);
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
