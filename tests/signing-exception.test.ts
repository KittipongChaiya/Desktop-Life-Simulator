/**
 * The v0.2 signing exception expires. Phase-15 — ADR-028 §5.
 *
 * ADR-025 §3 requires signed packages and calls signature failure fatal.
 * ADR-028 narrows that for v0.2 only: the publisher signature is deferred to
 * v0.3 because it is procurement rather than code, while artifact integrity
 * verification stays fatal because it needs no certificate.
 *
 * A temporary security relaxation that relies on someone remembering it is a
 * permanent one. So this is the memory. It reads the version from
 * `package.json` and the configuration from `electron-builder.yml`, and it
 * fails the suite at 0.3.0 if signing has not landed by then.
 *
 * It reads the YAML as TEXT rather than parsing it, for the same reason
 * `hud-interactive-panels.test.ts` reads JSX as text: the alternative is a
 * transitive dependency on electron-builder's own parser to check a handful of
 * key names. Crude, and it catches the failure that would actually happen.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compareVersions } from '../src/main/update-policy';

const ROOT = join(__dirname, '..');

/** The version this repository would publish today. */
function appVersion(): string {
  const parsed = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    version: string;
  };
  return parsed.version;
}

function builderConfig(): string {
  return readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8');
}

/**
 * Every way electron-builder can be told to sign a Windows artifact.
 *
 * Deliberately broad: this test's job is to get OUT OF THE WAY the moment
 * signing lands, and a narrow list would keep failing a repository that had
 * already done the right thing through a route the list did not name.
 */
const SIGNING_KEYS = [
  'certificateFile',
  'certificateSubjectName',
  'certificateSha1',
  'signtoolOptions',
  'azureSignOptions',
  'signingHashAlgorithms',
  'sign:',
] as const;

const isSigningConfigured = (config: string): boolean =>
  SIGNING_KEYS.some((key) => config.includes(key));

/**
 * The version at which ADR-028's exception ends.
 *
 * Raised from `0.3.0` at phase 62, by the owner's explicit direction, and
 * **raising it is no longer a one-line change**: ADR-028 §5.1 now carries a
 * table of every extension, and the test below requires this number to appear
 * in it. An exception that can be renewed by editing a constant is renewed
 * silently; one that needs a row with a date and a reason is not.
 */
const EXPIRES_AT = '0.7.0';

describe('the ADR-028 signing exception', () => {
  it('names a version this project can actually order', () => {
    // `compareVersions` returns null for anything it does not understand, and
    // a null would make every assertion below vacuously true — the exception
    // would expire silently by never being evaluated.
    expect(compareVersions(appVersion(), EXPIRES_AT)).not.toBeNull();
  });

  it('has expired if this build is 0.3.0 or later', () => {
    const version = appVersion();
    const reached = (compareVersions(version, EXPIRES_AT) ?? -1) >= 0;
    if (!reached) return;

    // ADR-028 §5: the exception was for one milestone. This is the milestone
    // ending. Wire signing into `electron-builder.yml` — a certificate, a
    // cloud signing service, anything real — and delete nothing here; the
    // check goes quiet on its own once a signing key is present.
    expect(
      isSigningConfigured(builderConfig()),
      `Version ${version} has reached ADR-028's expiry of ${EXPIRES_AT}, and ` +
        `electron-builder.yml still configures no signing. The v0.2 exception ` +
        `does not extend to v0.3 — see docs/decisions/ADR-028-v02-signing-exception.md §5.`,
    ).toBe(true);
  });

  it('declares the absence while the exception holds, rather than merely having one', () => {
    if (isSigningConfigured(builderConfig())) return; // the exception is over

    // ADR-028 §4. An unsigned build must be distinguishable from a build whose
    // signing configuration silently broke, which a missing field alone cannot
    // do. The marker is what makes the absence a decision.
    expect(builderConfig()).toContain('UNSIGNED under ADR-028');
  });

  it('keeps the ADR that authorises it', () => {
    // The marker points at a document. A marker whose document was deleted is
    // a claim of authority that nothing backs.
    const adr = readFileSync(join(ROOT, 'docs/decisions/ADR-028-v02-signing-exception.md'), 'utf8');

    expect(adr).toContain('Narrows:');
    expect(adr).toContain('ADR-025 §3');
    expect(adr).toContain(EXPIRES_AT);
  });

  it('makes an extension cost a written row, not a keystroke', () => {
    // §5's weakness, named at phase 62: the expiry is a constant, and a
    // constant can be raised by a session that finds it inconvenient. §5.1 is
    // the table of extensions, and this is what makes writing in it mandatory —
    // the version above must appear in a row that also carries a date.
    if (isSigningConfigured(builderConfig())) return; // the exception is over

    const adr = readFileSync(join(ROOT, 'docs/decisions/ADR-028-v02-signing-exception.md'), 'utf8');
    const rows = adr
      .split('\n')
      .filter((line) => line.startsWith('|') && line.includes(`\`${EXPIRES_AT}\``));

    expect(
      rows.length,
      `ADR-028 §5.1 has no extension row for ${EXPIRES_AT}. Raising the expiry ` +
        `requires recording when, who authorised it, and why.`,
    ).toBeGreaterThan(0);
    expect(
      rows.some((row) => /\d{4}-\d{2}-\d{2}/.test(row)),
      `the §5.1 row for ${EXPIRES_AT} carries no date`,
    ).toBe(true);
  });

  it('keeps the blocker in front of the next session', () => {
    // The second obligation ADR-028 §5.1 takes on. An unsigned build is a
    // BLOCKER, and `PLAN.md` §0 is the block a resuming session reads first —
    // `project-state.md` makes the repository the source of truth precisely so
    // nothing important travels only in somebody's memory.
    if (isSigningConfigured(builderConfig())) return; // the exception is over

    const plan = readFileSync(join(ROOT, 'docs/PLAN.md'), 'utf8');
    const resume = plan.slice(plan.indexOf('## 0. Current State'), plan.indexOf('## 1. Version'));

    expect(
      /code signing/i.test(resume),
      'PLAN.md §0 does not list code signing as a blocker, and the build is unsigned. ' +
        'The next session would inherit that without being told.',
    ).toBe(true);
  });
});
