/**
 * The promise that the placeholders can be replaced. Phase-47 — ADR-016.
 *
 * `generate-audio.mjs` opens by making a commitment: drop a real
 * `assets/src/audio/<name>.wav` into the tree and the script copies it through
 * instead of synthesising, with "no renderer code, no catalogue entry, and no
 * call site changes". That commitment is the entire justification for shipping
 * placeholder sound at all — they are allowed to be crude because they are
 * cheap to replace.
 *
 * NOTHING CHECKED IT. The path has never been exercised, in a repository whose
 * own history is a series of documented mechanisms that turned out not to run.
 * The sounds are still all placeholders, so the first person to discover a
 * broken replacement path would be somebody who had just paid a composer.
 *
 * The test drops a file, runs the real script, and removes it again.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'assets', 'src', 'audio');
const OUT = join(ROOT, 'assets', 'dist', 'audio');

/** A tiny but VALID 16-bit PCM mono WAV, so nothing downstream has to guess. */
function wav(sampleCount: number, value: number): Uint8Array {
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 44_100, true);
  view.setUint32(28, 44_100 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  for (let i = 0; i < sampleCount; i += 1) view.setInt16(44 + i * 2, value, true);
  return bytes;
}

/** The sound to stand in for. Any catalogue name works; this one is short. */
const NAME = 'ui-click.wav';
const authored = join(SRC, NAME);

const regenerate = (): string =>
  execFileSync('node', [join(ROOT, 'scripts', 'generate-audio.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });

afterAll(() => {
  // Always put the tree back, then rebuild so the working copy is not left
  // holding a test fixture as its shipped click.
  rmSync(authored, { force: true });
  regenerate();
});

describe('an authored sound replaces its placeholder', () => {
  it('copies the real file through, byte for byte, and says so', () => {
    mkdirSync(SRC, { recursive: true });
    // Deliberately unlike anything the synthesiser produces: a constant tone
    // at a length no recipe uses, so a pass cannot be a coincidence.
    const source = wav(1_000, 12_345);
    writeFileSync(authored, source);

    const output = regenerate();

    expect(output).toContain('1 authored');
    expect(existsSync(join(OUT, NAME))).toBe(true);
    expect([...readFileSync(join(OUT, NAME))]).toEqual([...source]);
  });

  it('goes back to synthesising when the authored file is removed', () => {
    // The other half of the promise: replacement is REVERSIBLE. A pipeline
    // that kept using a deleted file would be worse than one that never
    // accepted it.
    rmSync(authored, { force: true });

    const output = regenerate();

    expect(output).toContain('0 authored');
    const generated = readFileSync(join(OUT, NAME));
    expect(generated.length).toBeGreaterThan(44);
    expect([...generated]).not.toEqual([...wav(1_000, 12_345)]);
  });
});
