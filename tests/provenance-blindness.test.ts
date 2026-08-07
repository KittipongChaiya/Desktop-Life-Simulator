/**
 * No simulation code reads provenance. Phase-08a — ADR-026 §2.
 *
 * Provenance says who shipped a piece of content. It exists for three things:
 * telling a player what is missing in words they recognise, deciding trust at
 * load time, and support diagnostics. **No simulation system, command, registry
 * lookup, or save-format rule may read it.**
 *
 * This is the load-bearing half of ADR-026, and the reason it needs a mechanical
 * detector is that violating it always looks reasonable. "Core crops skip this
 * check because we ship them" is a one-line change that reads as an
 * optimisation, and it is the same defect as `switch (cropId)` in
 * `ARCHITECTURE.md` §3.4 — a system branching on WHICH content it has rather
 * than on what the content declares. Once one branch exists, "official and
 * third-party share one extension model" (goal 9) is a slogan: first-party
 * content is faster, or exempt, or trusted, and every plugin author is debugging
 * against an engine that behaves differently for its own content.
 *
 * The check is deliberately crude, in the spirit of `boundaries.test.ts`: a
 * grep, not a type rule, because the property is "this word does not appear in
 * this layer" and a type rule cannot say that.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * The one module allowed to name it: the source registry defines the concept
 * and makes the load-time trust decision ADR-026 §2 permits.
 */
const DECLARING_MODULE = 'src/sim/content/sources.ts';

/**
 * Source with comments removed.
 *
 * The word alone is not the violation: `src/sim/commands/` discusses the
 * provenance of a *command* — who dispatched it (ADR-010 §4) — which is an
 * unrelated concept that predates ADR-026 and appears only in prose. What is
 * forbidden is simulation CODE reading a content source's provenance, so the
 * check looks at code and lets documentation say what it needs to.
 */
function codeOf(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function sourceFilesUnder(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...sourceFilesUnder(rel));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(rel);
  }

  return found;
}

describe('provenance blindness (ADR-026 §2)', () => {
  const files = sourceFilesUnder('src/sim').filter((file) => file !== DECLARING_MODULE);

  it('scans a simulation layer that actually has files in it', () => {
    // Guards the guard: a path typo would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain('src/sim/world/world.ts');
  });

  it('no module under src/sim outside the source registry mentions provenance', () => {
    const offenders = files.filter((file) => /provenance/i.test(codeOf(file)));

    expect(
      offenders,
      `these modules read provenance, which ADR-026 §2 forbids outside the load-time trust decision:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no module under src/persistence mentions provenance — a save rule may not read it either', () => {
    const offenders = sourceFilesUnder('src/persistence').filter((file) =>
      /provenance/i.test(codeOf(file)),
    );

    expect(offenders).toEqual([]);
  });

  it('the declaring module does define it, so this test is not passing by accident', () => {
    expect(/provenance/i.test(codeOf(DECLARING_MODULE))).toBe(true);
  });
});
