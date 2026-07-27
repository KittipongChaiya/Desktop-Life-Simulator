/**
 * A throwaway userData profile per E2E session. Phase-07e.
 *
 * WHY EVERY SPEC NEEDS THIS FROM 07e: the app now saves itself — on quit, on
 * the autosave cadence, after a major transaction. A spec launched against
 * the developer's real profile would write its test farm into the real save
 * and, worse, LOAD it on the next run, so "a fresh world starts with no
 * workers" would quietly stop being true after the first run of the suite.
 *
 * Isolation was optional while nothing wrote saves. It is now the default,
 * expressed once here rather than remembered in nine `beforeEach` blocks.
 *
 * Not a `.spec.ts`, so Playwright's `testMatch` never collects it as a test.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, type ElectronApplication } from '@playwright/test';

export interface IsolatedSession {
  readonly app: ElectronApplication;
  /** The profile directory, for specs that inspect what was written. */
  readonly userData: string;
  /** Closes the app — which saves — then removes the profile. */
  dispose(): Promise<void>;
}

/**
 * Launches the real app on a profile nothing else shares.
 *
 * The single-instance lock lives under userData too, so this also keeps
 * concurrent instances from quitting each other (the 07c finding).
 */
export async function launchIsolated(extraEnv: NodeJS.ProcessEnv = {}): Promise<IsolatedSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dls-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, ...extraEnv, DESKTOP_LIFE_USER_DATA: userData },
  });

  return {
    app,
    userData,
    async dispose() {
      // Tolerated: a spec may have already closed or killed the app, and a
      // teardown failure must never mask the assertion that ran before it.
      await app.close().catch(() => undefined);
      rmSync(userData, { recursive: true, force: true });
    },
  };
}
