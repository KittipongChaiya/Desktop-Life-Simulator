/**
 * The `electron-updater` binding. Phase-15 — ADR-025 §3, §4, §5.
 *
 * The only file in the project that imports the library, and it is kept small
 * on purpose: every decision it could be tempted to make has already been made
 * somewhere unit-tested. It configures, downloads, reports, and hands off.
 *
 * ## What it is NOT allowed to decide
 *
 * - **whether a build may be applied** — `update-policy.ts` and
 *   `rollback-guard.ts`, before the player was ever told;
 * - **whether this is the artifact that was approved** — `mayDownload`,
 *   because the manifest and the feed can disagree for a window;
 * - **whether the process may be replaced now** — `update-restart.ts`, which
 *   makes the quit save finish first.
 *
 * ## Its defaults are hostile and are overridden on construction
 *
 * `autoDownload` and `autoInstallOnAppQuit` both ship as `true`
 * (`updater-config.ts` records why that matters). They are set from
 * `REQUIRED_UPDATER_CONFIG` rather than written as literals here, so the
 * settings that carry ADR-025 §2 and §5 stay in a module with tests.
 *
 * ## Coverage
 *
 * A host binding — it cannot be imported in the unit environment, because
 * `electron-updater` imports `electron`. It is **not** in
 * `coverage-policy.config.ts`, because that register admits a module only when
 * a named test exercises it, and no test can until there is a published
 * release to download. It stays measured, uncovered, and recorded as a gap in
 * `TESTING.md` §4.2 beside `bootstrap/web-audio.ts` — which is the honest
 * shape rather than an exclusion bought with a promise.
 */

import { autoUpdater } from 'electron-updater';

import { mayDownload } from './update-policy';
import { REQUIRED_UPDATER_CONFIG } from './updater-config';

/** Whether a verified package is staged and ready for the installer. */
let ready = false;

/**
 * Applies the required settings and starts listening. Call once, at bootstrap.
 *
 * The `update-downloaded` event is the ONLY thing that sets `ready`. The
 * library emits it after the SHA-512 in the feed has been checked against the
 * downloaded artifact, which under ADR-028 §2 is the whole of the integrity
 * guarantee now that the publisher signature is deferred — so nothing may be
 * installed that did not arrive through this event.
 */
export function configureUpdater(): void {
  autoUpdater.autoDownload = REQUIRED_UPDATER_CONFIG.autoDownload;
  autoUpdater.autoInstallOnAppQuit = REQUIRED_UPDATER_CONFIG.autoInstallOnAppQuit;
  autoUpdater.allowDowngrade = REQUIRED_UPDATER_CONFIG.allowDowngrade;
  autoUpdater.allowPrerelease = REQUIRED_UPDATER_CONFIG.allowPrerelease;

  autoUpdater.on('update-downloaded', () => {
    ready = true;
  });
}

export function isUpdateReady(): boolean {
  return ready;
}

/**
 * Fetches and verifies the approved version, if the feed agrees it exists.
 *
 * Resolves `false` for every reason a download did not happen — the feed being
 * unreachable, offering nothing, or offering a different version than the one
 * the player was shown. None of those is an error worth surfacing: the check
 * runs again in six hours, and ADR-025 §5's silence rule applies to the whole
 * chain, not only to checking.
 */
export async function downloadApprovedUpdate(approvedVersion: string): Promise<boolean> {
  try {
    const found = await autoUpdater.checkForUpdates();
    if (!mayDownload(approvedVersion, found?.updateInfo.version)) return false;

    await autoUpdater.downloadUpdate();
    return true;
  } catch {
    return false;
  }
}

/**
 * Hands the process to the installer.
 *
 * Both arguments are deliberate. `isSilent: false` shows the NSIS installer's
 * progress, because ADR-028 defers the publisher signature and an unsigned
 * installer running invisibly is exactly the shape a player should be
 * suspicious of. `isForceRunAfter: true` brings the game back — a restart the
 * player consented to is a restart, not a shutdown.
 *
 * Only ever reached through `update-restart.ts`, which has already waited for
 * the quit save (§5).
 */
export function installAndRestart(): void {
  autoUpdater.quitAndInstall(false, true);
}
