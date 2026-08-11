/**
 * Replacing the installed application. Phase-15 — ADR-025 §4.
 *
 * The same problem `SAVE_FORMAT.md` §7.1 solves for saves, so it gets the same
 * discipline and the same proof: **at no point may a single failure leave zero
 * launchable applications.** `save-store.ts` exports its steps so the tests can
 * halt after each one against a real directory; this exports `REPLACE_STEPS`
 * for exactly that reason.
 *
 * ## The layout
 *
 * Three directories beside each other under one root, each a complete
 * application:
 *
 * - `current/` — what launches.
 * - `staged/` — a package that has already been downloaded AND verified
 *   (ADR-025 §3, §4's first rule). Nothing unverified is ever written here, so
 *   anything found here is safe to install.
 * - `previous/` — the version that was installed before, retained until the new
 *   one has launched successfully.
 *
 * Every step is a directory rename on one volume, which NTFS journals as a
 * metadata operation — the same property §7.1 step 5 relies on. There is no
 * moment when a directory holds half of each version, which is what makes
 * "never a hybrid" structural rather than hopeful.
 *
 * ## THE ROOT IS A PARAMETER
 *
 * The same reason `settings-store.ts` and `save-store.ts` give: with the path
 * injected this module is pure Node, so interruption is tested against real
 * temp directories instead of mocked ones (`TESTING.md` §2). It also means the
 * module has **no way to name the save directory** — ADR-025 §4's *"saves are
 * never touched by an update"* made structural rather than asserted.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CURRENT = 'current';
const STAGED = 'staged';
const PREVIOUS = 'previous';
const VERSION_FILE = 'version.txt';

/**
 * The replacement sequence, in order. Exported for the crash-safety tests,
 * which halt after each one — the same contract `WRITE_STEPS` has.
 */
export const REPLACE_STEPS = [
  'stage', // the verified package lands beside the installation
  'retain', // the installed version becomes the rollback target
  'swap', // the staged version becomes the installed one
  'commit', // the new version launched; the retained one may be released
] as const;

export type ReplaceStep = (typeof REPLACE_STEPS)[number];

/** Which of the three directories a launch resolves to. */
export type LaunchTarget = 'current' | 'staged' | 'previous' | 'none';

export interface LaunchResolution {
  /**
   * Where the application that now launches CAME FROM — after recovery it is
   * always `current/`, so this names the provenance rather than the path.
   * `'staged'` is an interrupted update finished, `'previous'` is the last
   * resort, and `'none'` only ever means an empty root.
   */
  readonly run: LaunchTarget;
  /** Whether a prior version is still held as a rollback target. */
  readonly retained: boolean;
}

/** The version that would launch, or `null` when nothing is installed. */
export function installedVersion(root: string): string | null {
  const marker = join(root, CURRENT, VERSION_FILE);
  return existsSync(marker) ? readFileSync(marker, 'utf8') : null;
}

/**
 * Replaces the installed application, optionally halting after a named step.
 *
 * `haltAfter` exists for the crash-safety tests and for nothing else, exactly
 * as `atomicWriteSave`'s does: a sequence whose interruption points can only be
 * reasoned about is a sequence nobody has actually tested.
 *
 * Staging comes first and completely. ADR-025 §4's first rule is that the
 * download and its verification finish before the installed application is in
 * play at all, so a failure during the part most likely to fail — the network —
 * cannot reach anything a player depends on.
 */
export function replaceInstallation(root: string, version: string, haltAfter?: ReplaceStep): void {
  const current = join(root, CURRENT);
  const staged = join(root, STAGED);
  const previous = join(root, PREVIOUS);

  // Step 1 — stage. A partial download from an earlier attempt is discarded
  // rather than resumed into: half a package that verifies is not a thing.
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });
  writeFileSync(join(staged, VERSION_FILE), version, 'utf8');
  if (haltAfter === 'stage') return;

  // Step 2 — retain. This opens the only window in which nothing is installed.
  // It is also what makes the update reversible, which is why it precedes the
  // swap rather than following it.
  if (existsSync(current)) {
    rmSync(previous, { recursive: true, force: true });
    renameSync(current, previous);
  }
  if (haltAfter === 'retain') return;

  // Step 3 — swap. One rename; the window closes.
  renameSync(staged, current);
  if (haltAfter === 'swap') return;

  // Step 4 — commit. ADR-025 §4 keeps the previous version recoverable *until
  // the new one has launched successfully*, so releasing it is a separate step
  // driven by that launch — never part of installing.
  rmSync(previous, { recursive: true, force: true });
}

/**
 * Repairs an interrupted replacement and reports what launches.
 *
 * Run on every launch, and idempotent because of it: a machine that crashed
 * twice must not be worse off than one that crashed once.
 *
 * **A staged package is promoted only when nothing is installed.** With
 * `current/` present, `staged/` is a download the player has not applied yet,
 * and installing it here would be the unasked-for update ADR-025 §5 forbids.
 * With `current/` absent, the swap was interrupted mid-flight and finishing it
 * is the correct completion: the package was verified before anything moved.
 *
 * Falling back to `previous/` is the last resort, and it is not the automatic
 * rollback ADR-025 §2 forbids — that rule is about *choosing* to move a player
 * backwards. Here it is the only launchable state there is, and the new build
 * never ran, so nothing has migrated and the retained version still reads its
 * own save.
 */
export function recoverInstallation(root: string): LaunchResolution {
  const current = join(root, CURRENT);
  const staged = join(root, STAGED);
  const previous = join(root, PREVIOUS);

  if (existsSync(current)) return { run: 'current', retained: existsSync(previous) };

  if (existsSync(staged)) {
    renameSync(staged, current);
    return { run: 'staged', retained: existsSync(previous) };
  }

  if (existsSync(previous)) {
    renameSync(previous, current);
    return { run: 'previous', retained: false };
  }

  return { run: 'none', retained: false };
}
