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
 * The modules allowed to name it — the load-time trust decision, and nothing
 * else. ADR-026 §2 permits exactly three uses: player-facing display, the trust
 * decision at load, and support diagnostics.
 *
 * **This list widening is how the rule erodes**, so each entry states which of
 * the three it is, and the count is asserted below. An entry added because a
 * system "just needs to know" is the violation, not an exception to it.
 */
const TRUST_DECISION_MODULES = [
  // Defines `Provenance` and refuses a third party claiming a reserved
  // namespace at registration.
  'src/sim/content/sources.ts',
  // Phase-09a: refuses the same claim at the loader, where the file can be
  // named. Same decision, earlier and with better diagnostics.
  'src/sim/content/manifest.ts',
];

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
  const files = sourceFilesUnder('src/sim').filter(
    (file) => !TRUST_DECISION_MODULES.includes(file),
  );

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

  it('no save-format rule BRANCHES on provenance, though the save records it', () => {
    // Persistence is the one layer that must name the field: ADR-026 §4
    // REQUIRES the save to record provenance, so the player can be told what
    // kind of thing is missing. §2 forbids reading it to decide anything.
    //
    // So the rule here is narrower than in `src/sim` and matches what the ADR
    // actually says — carrying a value is fine, comparing it is not. A
    // `switch (source.provenance)` in a migration or a validator is the defect;
    // a field in `SaveContentSource` is the requirement.
    const branches = [
      /provenance\s*(===|!==|==(?!=)|!=(?!=)|<|>)/,
      /(===|!==)\s*[A-Za-z_.$]*[Pp]rovenance/,
      /switch\s*\([^)]*provenance/i,
      /if\s*\([^)]*\.provenance[^)]*\)/i,
    ];

    const offenders = sourceFilesUnder('src/persistence').filter((file) => {
      const code = codeOf(file);
      return branches.some((pattern) => pattern.test(code));
    });

    expect(
      offenders,
      `these save-format modules branch on provenance (ADR-026 §2): ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the persistence check has teeth — a comparison would be caught', () => {
    // Guards the guard: the patterns above are narrow, so this pins that they
    // still catch the thing they exist for.
    const branches = [
      /provenance\s*(===|!==|==(?!=)|!=(?!=)|<|>)/,
      /switch\s*\([^)]*provenance/i,
      /if\s*\([^)]*\.provenance[^)]*\)/i,
    ];
    const violations = [
      "if (source.provenance === 'builtin') skip();",
      'switch (source.provenance) { default: break; }',
      'if (entry.provenance) trust();',
    ];

    for (const sample of violations) {
      expect(
        branches.some((pattern) => pattern.test(sample)),
        sample,
      ).toBe(true);
    }

    // ...and that merely carrying the field is not flagged.
    expect(branches.some((p) => p.test('readonly provenance: string;'))).toBe(false);
    expect(branches.some((p) => p.test('provenance: source.provenance,'))).toBe(false);
  });

  it('every permitted module really does name it, so this test cannot pass by accident', () => {
    for (const module of TRUST_DECISION_MODULES) {
      expect(/provenance/i.test(codeOf(module)), module).toBe(true);
    }
  });

  it('keeps the permitted set small — widening it is how this rule erodes', () => {
    // Not a magic number: ADR-026 §2 permits provenance in the load-time trust
    // decision only, and that decision lives in two places. A third entry needs
    // an argument, which is what failing here forces someone to make.
    expect(TRUST_DECISION_MODULES).toHaveLength(2);
  });
});
