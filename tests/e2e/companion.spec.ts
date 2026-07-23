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

  // The preference lives in settings.json under the categorized application
  // settings model (fix/0.1/1.8a.md) — app preferences, never game state
  // (ADR-014 §4). Poll: the write follows the IPC reply asynchronously.
  await expect
    .poll(() => {
      try {
        const parsed = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
          desktop?: { opacityPercent?: number };
        };
        return parsed.desktop?.opacityPercent;
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

/** Drives a companion toggle through the real bridge — the same action the
 * global hotkey and the tray call in main. (The physical keypress itself is
 * OS-level and stays on the manual checklist.) */
async function toggleViaBridge(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  which: 'toggleHidden' | 'toggleClickThrough',
): Promise<void> {
  await window.evaluate(async (method) => {
    const api = (
      globalThis as unknown as {
        desktopLife: { companion: Record<string, () => Promise<unknown>> };
      }
    ).desktopLife;
    await api.companion[method]?.();
  }, which);
}

const isWindowVisible = (): Promise<boolean> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);

test('quick hide: the sim ticks straight through hidden, and restore is exact (crits 3, 7)', async () => {
  const window = await app.firstWindow();
  const ticksLocator = window.locator('[title="Simulation ticks elapsed"]');
  await ticksLocator.waitFor();
  const readTicks = async (): Promise<number> =>
    Number(((await ticksLocator.textContent()) ?? '').replace(/[^0-9]/g, ''));

  // A non-default opacity, so restore-exactness is observable (checkpoint 5).
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: { companion: { setOpacity(percent: number): Promise<unknown> } };
      }
    ).desktopLife;
    await api.companion.setOpacity(70);
  });
  await expect.poll(windowOpacity).toBeCloseTo(0.7, 5);

  const before = await readTicks();
  await toggleViaBridge(window, 'toggleHidden');
  await expect.poll(isWindowVisible).toBe(false);

  // 1.5 s hidden = 30 ticks at 20 Hz. The whole point of crit 7: the game is
  // never paused (ADR-014 assumption 1 — rAF under hide() — made testable).
  await window.waitForTimeout(1_500);

  await toggleViaBridge(window, 'toggleHidden');
  await expect.poll(isWindowVisible).toBe(true);

  const after = await readTicks();
  expect(after - before).toBeGreaterThanOrEqual(20);

  // Restore is exact by construction: hiding changed nothing else.
  expect(await windowOpacity()).toBeCloseTo(0.7, 5);
  await expect(window.getByRole('status')).toHaveText(/Overlay restored/);
});

test('click-through mode: toggles, toasts, and both runtime states reset on launch (crit 4)', async () => {
  const window = await app.firstWindow();
  // Wait for the UI before toggling: a toggle that lands during boot flips
  // state before the toast component exists to see the transition (found by
  // this test racing the mount — the state was right, the confirmation gone).
  await window.locator('[title="Simulation uptime"]').waitFor();

  await toggleViaBridge(window, 'toggleClickThrough');
  await expect(window.getByRole('status')).toHaveText(/Click-through on — Ctrl\+Shift\+C/);

  await toggleViaBridge(window, 'toggleClickThrough');
  await expect(window.getByRole('status')).toHaveText(/Click-through off/);

  // Leave BOTH runtime states engaged, then relaunch: neither may survive —
  // they have no persisted representation at all (ADR-014 §4).
  await toggleViaBridge(window, 'toggleClickThrough');
  await toggleViaBridge(window, 'toggleHidden');
  await app.close();
  app = await launch();

  // Poll: the fresh window shows on ready-to-show, which needs a first paint.
  await expect.poll(isWindowVisible).toBe(true);
  const state = await (
    await app.firstWindow()
  ).evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: {
          companion: { getState(): Promise<{ clickThrough: boolean; hidden: boolean }> };
        };
      }
    ).desktopLife;
    return api.companion.getState();
  });
  expect(state.clickThrough).toBe(false);
  expect(state.hidden).toBe(false);
});

test('global hotkeys register through the manager — and work mode not yet', async () => {
  const registered = await app.evaluate(({ globalShortcut }) => ({
    quickHide: globalShortcut.isRegistered('F12'),
    clickThrough: globalShortcut.isRegistered('Ctrl+Shift+C'),
    workMode: globalShortcut.isRegistered('F11'),
  }));

  expect(registered.clickThrough).toBe(true);
  // Unbound in 01.8b: an action without a feature must not swallow its key.
  expect(registered.workMode).toBe(false);
  // F12 is deliberately NOT asserted: Windows reserves F12 for the debugger
  // (RegisterHotKey refuses it), so its registration outcome is
  // platform-dependent. The action itself stays reachable — the quick-hide
  // test above proves it through the IPC input, and the tray is the standing
  // fallback (ADR-014 §5.2). The finding is recorded in the phase doc.
  expect(typeof registered.quickHide).toBe('boolean');
});
