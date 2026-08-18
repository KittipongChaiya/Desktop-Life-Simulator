/**
 * `PLAN.md` §0 is machine-checked. Phase-27.
 *
 * The block exists so a session that ends unexpectedly — context exhaustion is
 * the normal case, not the exception — can be resumed from the repository
 * alone (`AI_RULES.md` §10.4). A resume block that has gone stale is worse
 * than none: it tells the next session a confident lie about where the project
 * is.
 *
 * So this test asserts the block exists, parses, and agrees with the phase
 * table of the version §0 names as CURRENT — the same doc-and-machine-agree
 * pattern `coverage-policy.test.ts` uses, and for the same reason: a number
 * that lives in two places drifts.
 *
 * PHASE-31 CORRECTION. This hardcoded `### 5.1 Phases`, which was v0.4's
 * table. The moment v0.5 opened, the guard was comparing the new resume block
 * against the OLD version's phases and failing for a reason that had nothing
 * to do with staleness. A guard pinned to one version guards one version.
 *
 * It now finds the current version's own table by the version string §0
 * declares, so the next version needs no edit here at all — which is the
 * property this file should have had from the start.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PLAN = readFileSync(join(import.meta.dirname, '..', 'docs', 'PLAN.md'), 'utf8');

const STATUSES = ['COMPLETE', 'IN_PROGRESS', 'PENDING', 'CONDITIONAL', 'BLOCKED', 'DEFERRED'];

/** Phase rows in §0's status table: `| 27 | Name | STATUS |`. */
function stateRows(): { phase: string; status: string }[] {
  const section = PLAN.slice(PLAN.indexOf('## 0. Current State'), PLAN.indexOf('## 1. Version'));
  const rows: { phase: string; status: string }[] = [];
  for (const line of section.split('\n')) {
    const match = /^\|\s*(\d+)\s*\|[^|]+\|\s*([A-Z_]+)\s*\|/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      rows.push({ phase: match[1], status: match[2] });
    }
  }
  return rows;
}

/** The version §0 declares as current, e.g. `v0.5`. */
function currentVersion(): string {
  const match = /\*\*Current version\*\*\s*\|\s*\*\*(v[\d.]+)/.exec(PLAN);
  expect(match?.[1], '§0 must name a current version like **v0.5 — ...**').toBeDefined();
  return match?.[1] ?? '';
}

/**
 * Phase numbers declared by the CURRENT version's own phase table.
 *
 * Located by the version string §0 declares rather than by a hardcoded section
 * number — see the header. The next version needs no edit here.
 */
function roadmapPhases(): string[] {
  const version = currentVersion();
  const lines = PLAN.split('\n');

  const sectionAt = lines.findIndex(
    (line) => line.startsWith('## ') && line.includes(`${version} —`),
  );
  expect(sectionAt, `PLAN.md has no "## ... ${version} — ..." section`).toBeGreaterThan(-1);

  // Walked FORWARD from that section, never from the top: every version has a
  // "Success criteria" heading, and slicing to the first one found ran the
  // range backwards and silently produced an empty list — a guard test that
  // passes over nothing.
  const phases: string[] = [];
  let inTable = false;
  for (const line of lines.slice(sectionAt + 1)) {
    if (line.startsWith('## ')) break;
    if (line.startsWith('###') && line.includes('Phases')) inTable = true;
    if (line.includes('**Success criteria**')) break;
    if (!inTable) continue;
    const match = /^\|\s*(\d+)\s*\|/.exec(line);
    if (match?.[1] !== undefined) phases.push(match[1]);
  }
  return phases;
}

describe('PLAN.md §0 — the resume block', () => {
  it('exists', () => {
    expect(PLAN).toContain('## 0. Current State');
  });

  it('names a current version, phase, and status', () => {
    expect(PLAN).toMatch(/\*\*Current version\*\*/);
    expect(PLAN).toMatch(/\*\*Current phase\*\*/);
    expect(PLAN).toMatch(/\*\*Status\*\*/);
  });

  it('gives every phase a status the tooling recognises', () => {
    const rows = stateRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(STATUSES, `phase ${row.phase} has status "${row.status}"`).toContain(row.status);
    }
  });

  it('covers exactly the phases the current version declares — no drift either way', () => {
    // The failure this catches: a phase added to the roadmap and never given a
    // status, or a status left behind for a phase that was renumbered away.
    expect(stateRows().map((row) => row.phase)).toEqual(roadmapPhases());
  });

  it('marks exactly one phase IN_PROGRESS, or none when the version is done', () => {
    const inProgress = stateRows().filter((row) => row.status === 'IN_PROGRESS');
    expect(inProgress.length).toBeLessThanOrEqual(1);
  });

  it('records blockers and deferred work rather than leaving them to memory', () => {
    expect(PLAN).toContain('Known blockers');
    expect(PLAN).toContain('Deferred');
  });
});
