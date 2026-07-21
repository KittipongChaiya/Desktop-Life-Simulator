/**
 * Phase-01.5 deliverable 7: "The project must be able to compile with debug
 * features disabled."
 *
 * This asserts the production RENDERER BUNDLE contains no devtools code at all.
 * A runtime `if (FEATURE_DEBUG)` check would still ship every byte of the
 * console, overlay, profiler, and inspector to players — the flag only pays off
 * because Vite replaces it statically and Rollup drops the dead branch.
 *
 * Reading the source proves nothing here; only the built artifact does.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const RENDERER_OUT = join(ROOT, 'out', 'renderer');

/** Strings that appear only in devtools source. */
const DEVTOOLS_MARKERS = [
  'Developer console input',
  'debug-overlay',
  'dev-console',
  'F1 console',
  'no metrics registered',
  'Nothing inspectable under the pointer',
];

function rendererBundleText(): string {
  const assets = join(RENDERER_OUT, 'assets');
  if (!existsSync(assets)) return '';

  return readdirSync(assets)
    .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
    .map((file) => readFileSync(join(assets, file), 'utf8'))
    .join('\n');
}

describe('production build excludes developer tooling', () => {
  beforeAll(() => {
    // A real production build. Slow, but the whole point is to inspect the
    // artifact rather than trust the source.
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe', shell: true });
  }, 300_000);

  it('produces a renderer bundle', () => {
    expect(rendererBundleText().length).toBeGreaterThan(0);
  });

  it.each(DEVTOOLS_MARKERS)('does not contain devtools marker %s', (marker) => {
    expect(rendererBundleText()).not.toContain(marker);
  });

  it('still contains the game UI', () => {
    // Guards against the inverse failure: a bundle that excludes devtools
    // because it excluded everything.
    expect(rendererBundleText()).toContain('Simulation uptime');
  });
});
