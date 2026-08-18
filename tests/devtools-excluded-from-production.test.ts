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
  // The world inspector's tile provider (07.8c). It lives in `bootstrap`
  // rather than `devtools` — it needs the render layer's screen→tile picking —
  // so it is reachable from a module production DOES ship, and only the
  // `FEATURE_DEBUG` fold keeps it out. That makes it exactly the kind of tool
  // rule 6 is worth asserting against an artifact rather than a source file.
  'Enter cost',
  'Occupants',
  'PINNED',
  // The entity inspector (07.8d). Same exposure as the tile provider: it is
  // reachable from a shipped module and only the `FEATURE_DEBUG` fold removes
  // it. "Carrying" is the marker that matters — it is the one fact the panel
  // reads straight off the worker record.
  'Carrying',
  ' tiles · ',
  // The event monitor (07.8e). Its observer subscribes to the world's real
  // bus, so this marker is also the check that no debug SUBSCRIBER ships —
  // which would make the event graph differ between builds (ADR-018 §10).
  'No events observed',
  'event-monitor',
  // The command monitor (07.8f). Its wrapper sits ON the player's dispatch
  // path, so this marker is the check that a release build dispatches through
  // no debug indirection at all.
  'No commands observed',
  'command-monitor',
  // Time controls (07.8g). The scale now sits on `SimulationControl`, which
  // production DOES ship — so this marker checks that the CONTROLS are gone
  // even though the capability they drive is not debug-only code.
  'time-controls',
  // The performance panel (07.8h).
  'performance-panel',
  // The chunk overlay (07.8i). It draws into the SCENE from a module the
  // renderer owns, so this is the check that the factory's absence really did
  // remove it rather than merely leave it switched off.
  'chunk-debug',
  // The pathfinding overlay (07.8j), which draws into the scene like the
  // chunk one and is removed by the same fold.
  'path-debug',
  // Spawn tools (07.8k). The first tool that writes, so the check that it is
  // absent from a release build matters more than most.
  'spawn worker',
  'Unknown spawn kind',
  // Recording (07.8m).
  'recording started',
  'record start | record stop',
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
    //
    // `electron-vite build` DIRECTLY, not `npm run build`. That script chains
    // `npm run assets` first, which re-packs every atlas and rewrites
    // `assets/dist/manifest.ts` — while the ~250 other files in this suite are
    // concurrently importing that manifest. On Windows that race made this
    // file fail intermittently in full-suite runs while passing on its own,
    // which is the worst kind of gate: red often enough to be ignored.
    //
    // Skipping the asset step costs nothing, because the suite cannot have
    // started without those assets: every test that imports `@assets/manifest`
    // would already have failed to resolve. Regenerating them here only ever
    // rewrote files that were necessarily already correct.
    if (!existsSync(join(ROOT, 'assets', 'dist', 'manifest.ts'))) {
      throw new Error('assets/dist/manifest.ts is missing — run `npm run assets` first');
    }
    execFileSync('npx', ['electron-vite', 'build'], { cwd: ROOT, stdio: 'pipe', shell: true });
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
