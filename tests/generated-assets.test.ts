/**
 * Generated art files must survive a regeneration unchanged. Phase-52.
 *
 * ADR-006 §2 makes the art scripts deterministic so that re-running them is
 * BYTE-IDENTICAL and any change to the art is an intentional git diff. That
 * guarantee is worth exactly as much as the weakest thing allowed to rewrite
 * the output.
 *
 * ## The defect this exists because of
 *
 * The character generator emits `.anim.json` sidecars (it started doing so
 * when hand-authored sidecars turned out to be silently missing, and the
 * renderer drew nothing for the new worker rigs). `lint-staged` then ran
 * Prettier over every `*.json` on commit, which collapses short arrays onto
 * one line — a shape `JSON.stringify(value, null, 2)` never produces.
 *
 * So every commit rewrote them and every regeneration rewrote them back. Six
 * files flip-flopped for the whole art track, and it surfaced at the v0.5 RC
 * as an asset-regeneration gate that could not be met. `.prettierignore` now
 * keeps the formatter out of generated output; this test is what notices if
 * anything else gets in.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ENTITIES = join(import.meta.dirname, '..', 'assets', 'src', 'entities{tps}');

const sidecars = readdirSync(ENTITIES).filter((name) => name.endsWith('.anim.json'));

describe('the animation sidecars are shaped by their generator', () => {
  it('finds sidecars to check at all', () => {
    // A guard whose subject vanished passes silently, which is the failure
    // mode of every file-walking test ever written.
    expect(sidecars.length).toBeGreaterThan(0);
  });

  it.each(sidecars)('%s is exactly what the generator writes', (name) => {
    const path = join(ENTITIES, name);
    const text = readFileSync(path, 'utf8');

    // The generator's own call, reproduced: two-space indent, one trailing
    // newline. Anything that reformats the file — a formatter, an editor
    // save, a helpful hand — changes this and shows up as a regeneration diff
    // that nobody made.
    const regenerated = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;

    expect(text).toBe(regenerated);
  });
});
