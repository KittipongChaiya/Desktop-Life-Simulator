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

/** Lints `source` as a file inside `src/sim/` and returns the rule IDs reported. */
async function lintInSim(filename: string, source: string): Promise<string[]> {
  const filePath = join(SCRATCH_DIR, filename);
  writeFileSync(filePath, source, 'utf8');

  const eslint = new ESLint({ cwd: PROJECT_ROOT });
  const results = await eslint.lintFiles([filePath]);

  return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? 'unknown'));
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
