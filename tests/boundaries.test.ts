/**
 * Architecture boundary enforcement tests.
 *
 * These assert that known-bad source is REJECTED. That inversion is the whole
 * point: every misconfiguration of eslint-plugin-boundaries found in phase-00
 * failed *open* — the rule silently stopped reporting and `npm run lint` went
 * green while the architecture was completely unguarded (TECH_STACK.md §9.3).
 *
 * A passing lint run proves nothing on its own. Only these tests prove the
 * boundary exists.
 *
 * RUN THESE after any upgrade to typescript, eslint, typescript-eslint, or
 * eslint-plugin-boundaries. See AI_RULES.md §2.1 and ARCHITECTURE.md §10.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ROOT = join(import.meta.dirname, '..');
const SCRATCH_DIR = join(PROJECT_ROOT, 'src', 'sim', '__boundary_fixtures__');
const ENTRY_DIR = join(PROJECT_ROOT, 'src', 'renderer', 'entry');

/** Lints `source` as a file inside `src/sim/` and returns the rule IDs reported. */
async function lintInSim(filename: string, source: string): Promise<string[]> {
  const filePath = join(SCRATCH_DIR, filename);
  writeFileSync(filePath, source, 'utf8');

  const eslint = new ESLint({ cwd: PROJECT_ROOT });
  const results = await eslint.lintFiles([filePath]);

  return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? 'unknown'));
}

/** Lints `source` as a file inside the renderer entry and returns rule IDs. */
async function lintInEntry(source: string): Promise<string[]> {
  const filePath = join(ENTRY_DIR, '__probe.ts');
  writeFileSync(filePath, source, 'utf8');

  try {
    const eslint = new ESLint({ cwd: PROJECT_ROOT });
    const results = await eslint.lintFiles([filePath]);
    return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? 'unknown'));
  } finally {
    rmSync(filePath, { force: true });
  }
}

/** True if any boundary rule reported. */
function hasBoundaryError(rules: readonly string[]): boolean {
  return rules.some((rule) => rule.startsWith('boundaries/'));
}

beforeAll(() => {
  mkdirSync(SCRATCH_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
});

describe('simulation purity (AI_RULES.md §2.1)', () => {
  it('rejects Math.random() in src/sim', async () => {
    const rules = await lintInSim('random.ts', 'export const value = Math.random();\n');
    expect(rules).toContain('no-restricted-properties');
  });

  it('rejects Date.now() in src/sim', async () => {
    const rules = await lintInSim('clock.ts', 'export const value = Date.now();\n');
    expect(rules).toContain('no-restricted-properties');
  });

  it('rejects console output in src/sim', async () => {
    const rules = await lintInSim('log.ts', 'export function f(): void { console.log("x"); }\n');
    expect(rules).toContain('no-console');
  });
});

describe('external package bans (CODE_STYLE.md §8.1)', () => {
  it('rejects a pixi.js import in src/sim', async () => {
    const rules = await lintInSim(
      'pixi.ts',
      'import { Sprite } from "pixi.js";\n\nexport const s = Sprite;\n',
    );
    expect(rules).toContain('boundaries/external');
  });

  it('rejects an electron import in src/sim', async () => {
    const rules = await lintInSim(
      'electron.ts',
      'import { app } from "electron";\n\nexport const a = app;\n',
    );
    expect(rules).toContain('boundaries/external');
  });

  it('rejects a react import in src/sim', async () => {
    const rules = await lintInSim(
      'react.ts',
      'import { useState } from "react";\n\nexport const u = useState;\n',
    );
    expect(rules).toContain('boundaries/external');
  });
});

describe('internal layer boundaries (CODE_STYLE.md §8.1)', () => {
  it('rejects an import from the renderer into src/sim', async () => {
    mkdirSync(join(PROJECT_ROOT, 'src', 'renderer', 'render'), { recursive: true });
    const target = join(PROJECT_ROOT, 'src', 'renderer', 'render', '__boundary_target.ts');
    writeFileSync(target, 'export const marker = 1;\n', 'utf8');

    try {
      const rules = await lintInSim(
        'cross-layer.ts',
        'import { marker } from "../../renderer/render/__boundary_target";\n\nexport const m = marker;\n',
      );
      expect(rules).toContain('boundaries/dependencies');
    } finally {
      rmSync(target, { force: true });
    }
  });

  it('allows an import from shared into src/sim', async () => {
    const rules = await lintInSim(
      'allowed.ts',
      'import { TICKS_PER_SECOND } from "../../shared/constants";\n\nexport const t = TICKS_PER_SECOND;\n',
    );
    expect(rules).not.toContain('boundaries/dependencies');
    expect(rules).not.toContain('boundaries/external');
  });
});

describe('renderer entry is constrained (phase-01.7)', () => {
  // Entry files sit above every layer and so tend to match no rule, leaving
  // them free to import anything. That was true here until phase-01.7:
  // src/renderer/main.tsx could import `electron` and nothing complained.

  it.each([
    ['electron', `import { app } from 'electron'; export const a = app;`],
    ['pixi.js', `import { Sprite } from 'pixi.js'; export const a = Sprite;`],
    ['react', `import { StrictMode } from 'react'; export const a = StrictMode;`],
  ])('rejects the %s package', async (_name, source) => {
    expect(hasBoundaryError(await lintInEntry(source))).toBe(true);
  });

  it.each([
    ['sim', `import { createWorld } from '../../sim/world/world'; export const a = createWorld;`],
    ['ui', `import { App } from '../app/App'; export const a = App;`],
    [
      'devtools',
      `import { FEATURE_DEBUG } from '../../devtools/flags'; export const a = FEATURE_DEBUG;`,
    ],
    ['shared', `import { TICK_MS } from '../../shared/constants'; export const a = TICK_MS;`],
  ])('rejects the %s layer', async (_name, source) => {
    expect(await lintInEntry(source)).toContain('boundaries/dependencies');
  });

  it.each([
    [
      '@devtools/flags',
      `import { FEATURE_DEBUG } from '@devtools/flags'; export const a = FEATURE_DEBUG;`,
    ],
    [
      '@sim/world/world',
      `import { createWorld } from '@sim/world/world'; export const a = createWorld;`,
    ],
    ['@shared/constants', `import { TICK_MS } from '@shared/constants'; export const a = TICK_MS;`],
  ])('rejects %s via a path ALIAS, not just a relative path', async (_name, source) => {
    // The alias form previously bypassed every layer check: the resolver was
    // pointed at the solution tsconfig, which declares no `paths`, so aliased
    // imports resolved to null and were treated as external packages. The
    // relative form of the same import WAS blocked, which is what made this
    // invisible.
    expect(hasBoundaryError(await lintInEntry(source))).toBe(true);
  });

  it.each([
    [
      'game-loop',
      `import { createGameLoop } from '../bootstrap/game-loop'; export const a = createGameLoop;`,
    ],
    [
      'snapshot-store',
      `import { createSnapshotStore } from '../bootstrap/snapshot-store'; export const a = createSnapshotStore;`,
    ],
    [
      'devtools-mount',
      `import { mountDevTools } from '../bootstrap/devtools-mount'; export const a = mountDevTools;`,
    ],
  ])('rejects bootstrap internal %s', async (_name, source) => {
    expect(await lintInEntry(source)).toContain('boundaries/entry-point');
  });

  it('allows the bootstrap composition root, and only that', async () => {
    // The positive control. Without it, a rule that blocked everything would
    // satisfy every test above while making the application unbuildable.
    const rules = await lintInEntry(
      `import { startApplication } from '../bootstrap/start'; startApplication();`,
    );
    expect(hasBoundaryError(rules)).toBe(false);
  });
});
