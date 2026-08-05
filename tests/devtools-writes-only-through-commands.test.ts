/**
 * Acceptance criterion 5: "All mutations use the dispatcher — every spawn tool
 * submits through the player source; no store writes in `src/devtools`."
 *
 * Phase-07.8k made that criterion live, because 07.8k is the first tooling that
 * writes. A rule stated in an ADR and checked by review decays; this checks it
 * mechanically, and it checks something stronger than the words:
 *
 *   EVERY `sim` IMPORT IN `src/devtools` IS TYPE-ONLY, except from an
 *   explicit allowlist of modules that hold no state.
 *
 * Types are erased, so a type-only import cannot call anything. If no sim
 * FUNCTION can be called from the tooling, no sim store can be mutated by it —
 * not through a helper, not through a reference, not "just for a reset button"
 * (ADR-018 §2). The only route from devtools to the world is a command handed
 * to the player source, which is a capability passed in, never imported.
 *
 * The allowlist exists because the rule as first written was stricter than the
 * criterion, and this test caught it on its first run: the console's `time`
 * command calls `ticksToSeconds`, a pure conversion between two numbers that
 * owns nothing and mutates nothing. Refusing that would be dogma. Allowing it
 * BY NAME keeps the surface reviewable — each entry is a deliberate statement
 * that the module holds no state, not a hole that widens quietly.
 *
 * The boundary linter already stops `sim` importing `devtools`. This is the
 * other direction, which the linter permits (devtools legitimately reads sim
 * types) and which nothing else constrains.
 *
 * When this fails, the question to ask is not "how do I appease it" but "why
 * does a debug tool need to CALL into the simulation" — the answer is usually a
 * command that does not exist yet.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const DEVTOOLS = join(import.meta.dirname, '..', 'src', 'devtools');

/**
 * Sim modules devtools may CALL, not merely reference as types.
 *
 * The bar for an entry: pure functions over primitives, no store, no world, no
 * mutation reachable from anything it exports.
 */
const PURE_SIM_MODULES = [
  // Tick ↔ seconds. Arithmetic on two numbers (`sim/time/game-clock.ts`).
  'sim/time/game-clock',
];

/** Matches an import statement and captures its `type` marker and specifier. */
const IMPORT = /import\s+(type\s+)?([^;]*?)\s*from\s*['"]([^'"]+)['"]/g;

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    // Tests may construct a real world; production tooling may not.
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

interface SimImport {
  readonly file: string;
  readonly specifier: string;
  readonly clause: string;
}

function runtimeSimImports(): readonly SimImport[] {
  const found: SimImport[] = [];

  for (const file of sourceFiles(DEVTOOLS)) {
    const source = readFileSync(file, 'utf8');

    for (const match of source.matchAll(IMPORT)) {
      const [, typeKeyword, clause = '', specifier = ''] = match;
      if (!/(^|\/)(@sim|sim)\//.test(specifier) && !specifier.includes('/sim/')) continue;
      if (PURE_SIM_MODULES.some((allowed) => specifier.endsWith(allowed))) continue;

      // `import type { … }` is erased whole. So is a clause in which every
      // named binding carries its own `type` marker.
      if (typeKeyword !== undefined) continue;
      const names = clause
        .replace(/[{}]/g, '')
        .split(',')
        .map((n) => n.trim());
      const everyNameIsType = names.every((name) => name === '' || name.startsWith('type '));
      if (everyNameIsType) continue;

      found.push({ file: file.replace(DEVTOOLS, 'src/devtools'), specifier, clause });
    }
  }

  return found;
}

describe('devtools reaches the world only through commands', () => {
  it('scans a devtools tree that actually exists', () => {
    // Guards the inverse failure: a test that passes because it found nothing.
    expect(sourceFiles(DEVTOOLS).length).toBeGreaterThan(10);
  });

  it('imports sim types only, so no simulation function can be called', () => {
    expect(runtimeSimImports()).toEqual([]);
  });

  it('keeps the allowlist small enough to read', () => {
    // Not a size limit for its own sake: the allowlist is only a control while
    // someone still reads it. A dozen entries means the rule has become a
    // formality and the question it was asking has stopped being asked.
    expect(PURE_SIM_MODULES.length).toBeLessThanOrEqual(3);
  });

  it('spawn tools import no simulation module at runtime at all', () => {
    const spawn = readFileSync(join(DEVTOOLS, 'console', 'spawn-commands.ts'), 'utf8');

    // Its single capability is the submit function it is handed. The proof is
    // that the word appears, and that nothing runtime-imported from sim does.
    expect(spawn).toContain('submitCommand');
    expect(runtimeSimImports().filter((i) => i.file.includes('spawn-commands'))).toEqual([]);
  });
});
