/**
 * Phase-15 — an interrupted update leaves a launchable application.
 *
 * ADR-025 §4 asks for the discipline `SAVE_FORMAT.md` §7.1 uses for saves,
 * proven the way phase-07c proved it: halt after each real step against a real
 * directory and assert the invariant, rather than reason about it.
 *
 * The invariant, stated once: **at no point may a single failure leave zero
 * launchable applications**, and the one that survives is always one of the two
 * real versions — never a hybrid assembled from both.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installedVersion,
  recoverInstallation,
  replaceInstallation,
  REPLACE_STEPS,
  type ReplaceStep,
} from './install-store';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dls-install-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The save directory as it really sits — beside the installation, never in it. */
function plantSave(): string {
  const saves = join(root, 'saves');
  mkdirSync(saves, { recursive: true });
  writeFileSync(join(saves, 'slot-0.json'), '{"schemaVersion":6,"tick":4200}', 'utf8');
  return join(saves, 'slot-0.json');
}

describe('replaceInstallation — the ordinary path', () => {
  it('installs a first version when there is nothing to replace', () => {
    replaceInstallation(root, '1.0.0');

    expect(installedVersion(root)).toBe('1.0.0');
  });

  it('replaces the installed version and keeps the previous one recoverable', () => {
    replaceInstallation(root, '1.0.0');

    replaceInstallation(root, '2.0.0', 'swap');

    expect(installedVersion(root)).toBe('2.0.0');
    // ADR-025 §4: the previous version remains recoverable until the new one
    // has launched successfully. The swap is not the end of the sequence.
    expect(recoverInstallation(root).retained).toBe(true);
  });

  it('releases the retained version only once the new one has committed', () => {
    replaceInstallation(root, '1.0.0');
    replaceInstallation(root, '2.0.0');

    expect(installedVersion(root)).toBe('2.0.0');
    expect(recoverInstallation(root).retained).toBe(false);
  });
});

describe('crash safety — interrupting after each real step (ADR-025 §4)', () => {
  it.each(REPLACE_STEPS.map((step) => [step]))(
    'a launchable application survives a halt after step %s',
    (step: ReplaceStep) => {
      replaceInstallation(root, '1.0.0'); // the installation that must survive

      replaceInstallation(root, '2.0.0', step); // power cut here

      const resolution = recoverInstallation(root);

      expect(resolution.run).not.toBe('none');
      // Never a hybrid: whichever version answers, it is one of the two that
      // really existed, complete.
      expect(['1.0.0', '2.0.0']).toContain(installedVersion(root));
    },
  );

  it.each(REPLACE_STEPS.map((step) => [step]))(
    'the save is untouched by a halt after step %s',
    (step: ReplaceStep) => {
      const savePath = plantSave();
      const before = readFileSync(savePath, 'utf8');
      replaceInstallation(root, '1.0.0');

      replaceInstallation(root, '2.0.0', step);
      recoverInstallation(root);

      // ADR-025 §4: not moved, not migrated, not backed up by the updater, not
      // cleaned. The updater's blast radius excludes it by construction.
      expect(readFileSync(savePath, 'utf8')).toBe(before);
    },
  );

  it('a halt after staging leaves the installed version exactly as it was', () => {
    replaceInstallation(root, '1.0.0');

    replaceInstallation(root, '2.0.0', 'stage');

    // Nothing installed has been touched yet — §4's first rule is that the
    // download completes before the installation is in play at all.
    expect(installedVersion(root)).toBe('1.0.0');
    expect(recoverInstallation(root).run).toBe('current');
  });

  it('a halt in the window where nothing is installed completes the update', () => {
    replaceInstallation(root, '1.0.0');

    // After `retain` the installed directory is genuinely absent: this is the
    // one window the whole sequence exists to make survivable.
    replaceInstallation(root, '2.0.0', 'retain');

    // Forward, not backward: the package was verified before anything moved
    // (§4), and the player asked for it. Rolling back on its own would be the
    // automatic rollback ADR-025 §2 forbids.
    expect(recoverInstallation(root).run).toBe('staged');
    expect(installedVersion(root)).toBe('2.0.0');
  });

  it('falls back to the retained version when there is nothing else left', () => {
    replaceInstallation(root, '1.0.0');
    replaceInstallation(root, '2.0.0', 'retain');
    rmSync(join(root, 'staged'), { recursive: true, force: true }); // the download is gone too

    // Not a rollback DECISION — the only launchable state there is. The new
    // build never ran, so nothing migrated and 1.0.0 still reads its own save.
    expect(recoverInstallation(root).run).toBe('previous');
    expect(installedVersion(root)).toBe('1.0.0');
  });

  it('reports an empty root rather than inventing an installation', () => {
    expect(recoverInstallation(root).run).toBe('none');
    expect(installedVersion(root)).toBeNull();
  });
});

describe('recovery is idempotent', () => {
  it('a second recovery changes nothing', () => {
    replaceInstallation(root, '1.0.0');
    replaceInstallation(root, '2.0.0', 'retain');

    const first = recoverInstallation(root);
    const second = recoverInstallation(root);

    // Recovery runs on every launch. One that only worked once would leave a
    // machine that crashed twice with no way back.
    expect(first.run).toBe('staged');
    expect(second.run).toBe('current');
    expect(installedVersion(root)).toBe('2.0.0');
  });
});
