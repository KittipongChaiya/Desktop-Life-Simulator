/**
 * Desktop companion: the opacity dial. Phase-01.8a acceptance criteria 1, 2.
 *
 * Launches with an isolated userData profile (the DESKTOP_LIFE_USER_DATA seam)
 * so preference persistence is asserted against a file this test owns — never
 * the developer's real settings, and never colliding with a running instance's
 * single-instance lock.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { OPACITY_DEFAULT_PERCENT, OPACITY_STEP_PERCENT } from '../../src/shared/constants';

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

const windowOpacity = (): Promise<number> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getOpacity() ?? -1);

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'dls-companion-'));
  app = await launch();
});

test.afterEach(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

test('defaults to 100% and the slider changes the window instantly (crit 1)', async () => {
  expect(await windowOpacity()).toBeCloseTo(OPACITY_DEFAULT_PERCENT / 100, 5);

  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();

  const slider = window.getByRole('slider', { name: 'Opacity' });
  await slider.press('ArrowLeft'); // one step down the dial

  const expected = OPACITY_DEFAULT_PERCENT - OPACITY_STEP_PERCENT;
  await expect(window.getByText(`${String(expected)}%`)).toBeVisible();
  await expect.poll(windowOpacity).toBeCloseTo(expected / 100, 5);
});

test('persists between launches and lands in settings.json, not a save (crit 2)', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();

  // 100 → 70: six 5%-steps down the dial.
  const slider = window.getByRole('slider', { name: 'Opacity' });
  for (let i = 0; i < 6; i += 1) await slider.press('ArrowLeft');
  await expect(window.getByText('70%')).toBeVisible();
  await expect.poll(windowOpacity).toBeCloseTo(0.7, 5);

  // The preference lives in settings.json — app preferences, never game state
  // (ADR-014 §4). Poll: the write follows the IPC reply asynchronously.
  await expect
    .poll(() => {
      try {
        const parsed = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
          opacityPercent?: number;
        };
        return parsed.opacityPercent;
      } catch {
        return undefined;
      }
    })
    .toBe(70);

  // Relaunch on the same profile: the window opens at 70% before any UI runs.
  await app.close();
  app = await launch();
  expect(await windowOpacity()).toBeCloseTo(0.7, 5);

  const reopened = await app.firstWindow();
  await reopened.getByRole('button', { name: 'Settings' }).click();
  await expect(reopened.getByText('70%')).toBeVisible();
});

test('the settings panel documents the three companion shortcuts (ADR-014 §5)', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();

  await expect(window.getByText('F11')).toBeVisible();
  await expect(window.getByText('F12')).toBeVisible();
  await expect(window.getByText('Ctrl+Shift+C')).toBeVisible();
});
