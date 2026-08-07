/**
 * The coverage policy is enforced, and says what the document says. Phase-08.0.
 *
 * This test exists because of a specific failure. `TESTING.md` §4 declared seven
 * per-area thresholds from phase-00 onward; `vitest.config.ts` enforced one
 * global pair. Six gates were prose. Nobody found out until the v0.1 release
 * gate came due and three areas turned out to have been below their published
 * thresholds for months.
 *
 * So the numbers live in `coverage-policy.config.ts`, the config derives its
 * gates from there, and this test asserts the document agrees. A threshold
 * changed in one place and not the other fails here.
 *
 * It also guards the exclusion register, which is the part of this policy that
 * could be abused: anything can be made to pass by not measuring it. Every
 * excluded path must exist, must be listed in §4.2, and must name at least one
 * test that does exercise it — and every named test must itself exist.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AREA_THRESHOLDS,
  E2E_GATED_AREAS,
  HOST_BINDINGS,
  PROJECT_THRESHOLD,
} from '../coverage-policy.config';
import vitestConfig from '../vitest.config';

const ROOT = resolve(import.meta.dirname, '..');
const TESTING_MD = readFileSync(join(ROOT, 'docs', 'TESTING.md'), 'utf8');

const coverage = vitestConfig.test?.coverage;

/** Cells of a GitHub-flavoured table row, trimmed, without the outer pipes. */
function cells(row: string): string[] {
  return row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** The rows of the first table under a `## n. Heading` / `### n.n Heading`. */
function tableUnder(heading: string): string[][] {
  const start = TESTING_MD.indexOf(heading);
  expect(start, `${heading} is missing from TESTING.md`).toBeGreaterThan(-1);

  const rows: string[][] = [];
  let seenSeparator = false;

  for (const line of TESTING_MD.slice(start + heading.length).split('\n')) {
    const isRow = line.trimStart().startsWith('|');
    if (!isRow) {
      if (rows.length > 0 || seenSeparator) break;
      continue;
    }
    if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) {
      seenSeparator = true;
      continue;
    }
    if (seenSeparator) rows.push(cells(line));
  }

  expect(rows.length, `no table rows found under ${heading}`).toBeGreaterThan(0);
  return rows;
}

/**
 * Strips code ticks and a surrounding bold pair, and nothing else.
 *
 * Not a blanket `*` strip: the cells this reads are glob patterns, and
 * `src/sim/**` losing its asterisks matches nothing and fails silently.
 */
function plain(cell: string): string {
  const withoutTicks = cell.replace(/`/g, '').trim();
  const bold = /^\*\*(.*)\*\*$/.exec(withoutTicks);

  return (bold?.[1] ?? withoutTicks).trim();
}

/** `**90 / 85**` and `90 / 85` both read as [90, 85]; `E2E` reads as null. */
function parseGate(cell: string): { lines: number; branches: number } | null {
  const text = plain(cell);
  if (text === 'E2E') return null;

  const match = /^(\d+)%?\s*\/\s*(\d+)%?$/.exec(text);
  expect(match, `unreadable gate cell: "${cell}"`).not.toBeNull();

  return { lines: Number(match?.[1]), branches: Number(match?.[2]) };
}

/** Every non-test source file under a directory, as repo-relative paths. */
function sourceFilesUnder(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...sourceFilesUnder(rel));
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    ) {
      found.push(rel);
    }
  }

  return found;
}

describe('the coverage config enforces what TESTING.md §4 declares', () => {
  const documented = new Map(
    tableUnder('## 4. Coverage Gates').map((row) => [plain(row[0] ?? ''), row]),
  );

  it('declares a gate for every area the config measures', () => {
    for (const area of AREA_THRESHOLDS) {
      expect(
        documented.has(area.glob),
        `${area.glob} is enforced but has no row in TESTING.md §4`,
      ).toBe(true);
    }
  });

  it('measures every area the document declares', () => {
    const enforced = new Set<string>(AREA_THRESHOLDS.map((area) => area.glob));

    for (const [area, row] of documented) {
      if (area === 'Project total' || parseGate(row[1] ?? '') === null) continue;
      expect(
        enforced.has(area),
        `TESTING.md §4 declares ${area} but the config does not enforce it`,
      ).toBe(true);
    }
  });

  it('agrees with the document on every number', () => {
    for (const area of AREA_THRESHOLDS) {
      const gate = parseGate(documented.get(area.glob)?.[1] ?? '');
      expect(
        gate,
        `${area.glob} is documented as E2E-gated but carries a numeric threshold`,
      ).not.toBeNull();
      expect({ area: area.glob, ...gate }).toEqual({
        area: area.glob,
        lines: area.lines,
        branches: area.branches,
      });
    }
  });

  it('agrees with the document on the project total', () => {
    expect(parseGate(documented.get('Project total')?.[1] ?? '')).toEqual({
      lines: PROJECT_THRESHOLD.lines,
      branches: PROJECT_THRESHOLD.branches,
    });
    expect({
      lines: coverage?.thresholds?.lines,
      branches: coverage?.thresholds?.branches,
    }).toEqual({
      lines: PROJECT_THRESHOLD.lines,
      branches: PROJECT_THRESHOLD.branches,
    });
  });

  it('leaves no file behind in an area the document gates by E2E', () => {
    const excluded = new Set(HOST_BINDINGS.map((binding) => binding.path));

    for (const area of E2E_GATED_AREAS) {
      expect(parseGate(documented.get(`${area}/**`)?.[1] ?? '')).toBeNull();

      for (const file of sourceFilesUnder(area)) {
        expect(
          excluded.has(file),
          `${file} is in an E2E-gated area but is not a registered host binding`,
        ).toBe(true);
      }
    }
  });
});

describe('the exclusion register', () => {
  const documented = new Set(
    tableUnder('### 4.2 What is not measured, and what covers it instead').map((row) =>
      plain(row[0] ?? ''),
    ),
  );

  it('excludes exactly the registered host bindings, no more', () => {
    const registered = HOST_BINDINGS.map((binding) => binding.path);
    const configExclusions = (coverage?.exclude ?? []).filter((pattern) => !pattern.includes('*'));

    expect(new Set(configExclusions)).toEqual(new Set([...registered, 'src/renderer/index.html']));
  });

  it('lists every excluded file in TESTING.md §4.2', () => {
    expect(documented).toEqual(new Set(HOST_BINDINGS.map((binding) => binding.path)));
  });

  it('names at least one real detector for every excluded file', () => {
    for (const binding of HOST_BINDINGS) {
      expect(
        binding.detectors.length,
        `${binding.path} is excluded but names no detector`,
      ).toBeGreaterThan(0);

      for (const detector of binding.detectors) {
        expect(
          existsSync(join(ROOT, detector)),
          `${binding.path} names a detector that does not exist: ${detector}`,
        ).toBe(true);
      }
    }
  });

  it('excludes only files that exist, and points `logic` only at files that exist', () => {
    for (const binding of HOST_BINDINGS) {
      expect(
        existsSync(join(ROOT, binding.path)),
        `${binding.path} is excluded but does not exist`,
      ).toBe(true);

      if (binding.logic !== null) {
        expect(
          existsSync(join(ROOT, binding.logic)),
          `${binding.path} points at missing logic: ${binding.logic}`,
        ).toBe(true);
      }
    }
  });

  it('gives every excluded file a reason', () => {
    for (const binding of HOST_BINDINGS) {
      expect(binding.reason.length, `${binding.path} is excluded without a reason`).toBeGreaterThan(
        20,
      );
    }
  });
});
