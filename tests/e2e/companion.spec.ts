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

import {
  OPACITY_DEFAULT_PERCENT,
  OPACITY_STEP_PERCENT,
  OVERLAY_HEIGHT_COLLAPSED,
  OVERLAY_HEIGHT_EXPANDED,
} from '../../src/shared/constants';

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

test('defaults to the dial floor and the slider changes the window instantly (crit 1)', async () => {
  expect(await windowOpacity()).toBeCloseTo(OPACITY_DEFAULT_PERCENT / 100, 5);

  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();

  const slider = window.getByRole('slider', { name: 'Opacity' });
  // UP the dial: the default now sits ON the floor, so there is no step below
  // it — pressing ArrowLeft would assert that nothing happened.
  await slider.press('ArrowRight');

  const expected = OPACITY_DEFAULT_PERCENT + OPACITY_STEP_PERCENT;
  await expect(window.getByText(`${String(expected)}%`)).toBeVisible();
  await expect.poll(windowOpacity).toBeCloseTo(expected / 100, 5);
});

test('persists between launches and lands in settings.json, not a save (crit 2)', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();

  // 30 → 60: six 5%-steps UP the dial, away from the floor it now rests on.
  const slider = window.getByRole('slider', { name: 'Opacity' });
  for (let i = 0; i < 6; i += 1) await slider.press('ArrowRight');
  await expect(window.getByText('60%')).toBeVisible();
  await expect.poll(windowOpacity).toBeCloseTo(0.6, 5);

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
    .toBe(60);

  // Relaunch on the same profile: the window opens at 60% before any UI runs.
  await app.close();
  app = await launch();
  expect(await windowOpacity()).toBeCloseTo(0.6, 5);

  const reopened = await app.firstWindow();
  await reopened.getByRole('button', { name: 'Settings' }).click();
  await expect(reopened.getByText('60%')).toBeVisible();
});

test('the settings panel documents the three companion shortcuts (ADR-014 §5)', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Settings' }).click();

  // Rendered from DEFAULT_BINDINGS — the F12 → F10 rebind reached this panel
  // with zero component changes.
  await expect(window.getByText('F11')).toBeVisible();
  await expect(window.getByText('F10')).toBeVisible();
  await expect(window.getByText('Ctrl+Shift+C')).toBeVisible();
});

/** Drives a companion toggle through the real bridge — the same action the
 * global hotkey and the tray call in main. (The physical keypress itself is
 * OS-level and stays on the manual checklist.) */
async function toggleViaBridge(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  which: 'toggleHidden' | 'toggleClickThrough' | 'toggleWorkMode',
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

test('all three global hotkeys register through the manager', async () => {
  const registered = await app.evaluate(({ globalShortcut }) => ({
    quickHide: globalShortcut.isRegistered('F10'),
    clickThrough: globalShortcut.isRegistered('Ctrl+Shift+C'),
    workMode: globalShortcut.isRegistered('F11'),
  }));

  expect(registered.clickThrough).toBe(true);
  expect(registered.workMode).toBe(true);
  // Quick hide is F10 by owner rebind (2026-07-23): the directive's original
  // F12 is unregistrable on Windows — RegisterHotKey reserves it for the
  // debugger (01.8b finding) — which is why this assertion used to be
  // platform-hedged. F10 registers, so it is asserted outright.
  expect(registered.quickHide).toBe(true);
});

test('work mode: strips the HUD to the living world, and its state persists (crit 5)', async () => {
  const window = await app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

  await toggleViaBridge(window, 'toggleWorkMode');

  // The mode constant, below the slider floor — a state, not a dial position.
  await expect.poll(windowOpacity).toBeCloseTo(0.25, 5);
  // Every HUD surface gone; the toast is the one thing that still lands.
  await expect(window.getByRole('status')).toHaveText(/Work mode on — F11/);
  await expect(window.getByRole('button', { name: 'Shop' })).toHaveCount(0);
  await expect(window.getByRole('button', { name: 'Settings' })).toHaveCount(0);
  await expect(window.locator('[title="Simulation uptime"]')).toHaveCount(0);

  // Last state persists: relaunch resumes work mode (ADR-014 §4) — at the
  // mode opacity, HUD still stripped, before any UI interaction.
  await app.close();
  app = await launch();
  await expect.poll(windowOpacity).toBeCloseTo(0.25, 5);
  const reopened = await app.firstWindow();
  await expect(reopened.getByRole('button', { name: 'Shop' })).toHaveCount(0);

  // Leaving work mode restores the player's own dial — the 30% default here,
  // one 5% notch above work mode's 25%.
  await toggleViaBridge(reopened, 'toggleWorkMode');
  await expect.poll(windowOpacity).toBeCloseTo(OPACITY_DEFAULT_PERCENT / 100, 5);
  await expect(reopened.getByRole('button', { name: 'Shop' })).toBeVisible();
  await expect(reopened.locator('[title="Simulation uptime"]')).toBeVisible();
});

test('work mode from collapsed expands, and leaving restores the prior presence', async () => {
  const window = await app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

  // Collapse through the real UI path, then enter work mode.
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(next: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(true);
  });
  const height = (): Promise<number> =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBounds().height ?? -1);
  await expect.poll(height).toBe(OVERLAY_HEIGHT_COLLAPSED);

  // Work mode implies the expanded overlay — it exists to show the world.
  await toggleViaBridge(window, 'toggleWorkMode');
  await expect.poll(height).toBe(OVERLAY_HEIGHT_EXPANDED);

  // Leaving restores the presence the player left behind: collapsed.
  await toggleViaBridge(window, 'toggleWorkMode');
  await expect.poll(height).toBe(OVERLAY_HEIGHT_COLLAPSED);
});
