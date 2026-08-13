/**
 * Updating: the pin, end to end. Phase-15 — ADR-025 §6.
 *
 * The detector for the `update:*` handlers in `src/main/index.ts` and the
 * `update` namespace in `src/preload/index.ts`. Both are host bindings under
 * `coverage-policy.config.ts` and are therefore excluded from measurement,
 * which the policy allows ONLY when a named test exercises them. This is that
 * test — without it the exclusion would be a gate wearing documentation's
 * clothes, which is the one thing that file must not be used for.
 *
 * It runs the whole width of the boundary rather than a slice: the control in
 * the renderer, the contextBridge, the IPC handler, the settings schema, the
 * write to disk, and the read back after a restart. Every unit on that path is
 * already proven in isolation; what only a launched application can answer is
 * whether they are actually connected to each other.
 *
 * Launches with an isolated userData profile (the DESKTOP_LIFE_USER_DATA seam)
 * so the pin is asserted against a file this test owns — never the developer's
 * real settings, and never colliding with a running instance's single-instance
 * lock.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let app: ElectronApplication;
let userData: string;

async function launch(): Promise<ElectronApplication> {
  const instance = await electron.launch({
    args: ['.'],
    env: { ...process.env, DESKTOP_LIFE_USER_DATA: userData },
  });
  await instance.firstWindow();
  return instance;
}

/** What `update:get-state` must be reporting: the running build's version. */
const appVersion = (): Promise<string> =>
  app.evaluate(({ app: electronApp }) => electronApp.getVersion());

/** The pin as it actually landed on disk, or undefined if nothing is stored. */
function storedPin(): string | null | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
      update?: { pinnedVersion?: string | null };
    };
    return parsed.update?.pinnedVersion;
  } catch {
    // The file does not exist until something writes it, which is the state
    // this test starts in rather than a failure.
    return undefined;
  }
}

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'dls-update-'));
  app = await launch();
});

test.afterEach(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

test('reports the running version, and pinning it reaches settings.json', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();

  // The version comes from `app.getVersion()` in main, crosses the bridge, and
  // is rendered here. A hardcoded string in the panel would pass a unit test
  // and fail this one.
  const section = window.getByTestId('update-section');
  await expect(section).toContainText(await appVersion());

  const pin = window.getByLabel('Stay on this version');
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  expect(storedPin()).toBeUndefined();

  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');

  // Under the categorized application-settings model — an app preference, never
  // game state (ADR-014 §4). Polled because the write follows the IPC reply.
  await expect.poll(storedPin).toBe(await appVersion());
});

test('the pin survives a restart, because the file is what remembers it', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();
  await window.getByLabel('Stay on this version').click();
  await expect.poll(storedPin).toBe(await appVersion());

  await app.close();
  app = await launch();

  const restarted = await app.firstWindow();
  await restarted.getByRole('button', { name: 'Settings' }).click();
  await expect(restarted.getByLabel('Stay on this version')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('clearing the pin writes null rather than leaving the old version behind', async () => {
  // The failure this guards is a pin that cannot be removed: `null` has to
  // reach the schema as an explicit value, not as an absent key that the next
  // parse would read as "unchanged".
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();

  const pin = window.getByLabel('Stay on this version');
  await pin.click();
  await expect.poll(storedPin).toBe(await appVersion());

  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(storedPin).toBeNull();
});
