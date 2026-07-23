/**
 * Electron main process entry. Phase-01.
 *
 * Owns the window, overlay geometry, tray, single-instance lock, and IPC
 * validation. No game logic and no rendering ever happens here (ADR-003 §3).
 */

import { app, ipcMain, Menu, nativeImage, Tray, type BrowserWindow } from 'electron';

import {
  EventChannel,
  InvokeChannel,
  SendChannel,
  type CompanionState,
  type OverlayState,
} from '../shared/ipc/contract';
import { validateBoolean, validateNumber, validateVoid } from '../shared/ipc/schemas';

import { applyOpacity } from './desktop-companion';
import { dockedBounds, watchDisplayChanges } from './docking';
import { createOverlayWindow, setClickThrough, setCollapsed } from './overlay-window';
import { loadSettings, saveSettings } from './settings';
import { DEFAULT_SETTINGS, sanitizeOpacityPercent, type UiSettings } from './settings-schema';

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
// The one settings record. Updated immutably; every mutation persists it whole
// so no field can be dropped by a partial write (found designing 01.8a: the
// old `saveSettings({ collapsed })` calls would have erased the opacity).
let settings: UiSettings = DEFAULT_SETTINGS;
let stopWatchingDisplays: (() => void) | null = null;

function overlayState(): OverlayState {
  const bounds = dockedBounds(settings.collapsed);
  return { collapsed: settings.collapsed, width: bounds.width, height: bounds.height };
}

function companionState(): CompanionState {
  return { opacityPercent: settings.opacityPercent, workMode: settings.workMode };
}

function applyCollapsed(next: boolean): OverlayState {
  settings = { ...settings, collapsed: next };

  if (overlay !== null && !overlay.isDestroyed()) {
    setCollapsed(overlay, settings.collapsed);
    overlay.webContents.send(EventChannel.OverlayStateChanged, overlayState());
  }

  saveSettings(settings);
  refreshTrayMenu();
  return overlayState();
}

function applyOpacityPercent(next: number): CompanionState {
  settings = { ...settings, opacityPercent: sanitizeOpacityPercent(next) };

  if (overlay !== null && !overlay.isDestroyed()) {
    applyOpacity(overlay, settings);
    // Confirms the sanitized value to the settings UI, and keeps it in sync
    // when 01.8b/c change companion state from a global hotkey.
    overlay.webContents.send(EventChannel.CompanionStateChanged, companionState());
  }

  saveSettings(settings);
  return companionState();
}

function refreshTrayMenu(): void {
  if (tray === null) return;

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: settings.collapsed ? 'Expand' : 'Collapse',
        click: () => void applyCollapsed(!settings.collapsed),
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

function createTray(): void {
  // An empty image yields the platform's default tray icon. Real art lands
  // with the rest of the icon set; shipping a placeholder PNG would violate
  // AI_RULES.md §1.6.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Desktop Life Simulator');
  refreshTrayMenu();

  // Double-click toggles, matching the tray convention users expect.
  tray.on('double-click', () => void applyCollapsed(!settings.collapsed));
}

function registerIpc(): void {
  ipcMain.handle(InvokeChannel.SetCollapsed, (_event, payload: unknown) => {
    const parsed = validateBoolean(payload, InvokeChannel.SetCollapsed);
    if (!parsed.ok) return overlayState();
    return applyCollapsed(parsed.value);
  });

  ipcMain.handle(InvokeChannel.GetOverlayState, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.GetOverlayState);
    return overlayState();
  });

  ipcMain.handle(InvokeChannel.SetOpacity, (_event, payload: unknown) => {
    const parsed = validateNumber(payload, InvokeChannel.SetOpacity);
    if (!parsed.ok) return companionState();
    return applyOpacityPercent(parsed.value);
  });

  ipcMain.handle(InvokeChannel.GetCompanionState, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.GetCompanionState);
    return companionState();
  });

  ipcMain.handle(InvokeChannel.Quit, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.Quit);
    app.quit();
  });

  ipcMain.on(SendChannel.SetClickThrough, (_event, payload: unknown) => {
    const parsed = validateBoolean(payload, SendChannel.SetClickThrough);
    if (!parsed.ok || overlay === null) return;
    setClickThrough(overlay, parsed.value);
  });
}

function bootstrap(): void {
  settings = loadSettings();

  overlay = createOverlayWindow(settings.collapsed);
  // Opacity applies before first show — the window never flashes at 100% on
  // its way to the player's preference (fix/0.1/1.8.md acceptance 2).
  applyOpacity(overlay, settings);
  stopWatchingDisplays = watchDisplayChanges(() => settings.collapsed, overlay);

  overlay.on('closed', () => {
    stopWatchingDisplays?.();
    stopWatchingDisplays = null;
    overlay = null;
  });

  createTray();
  registerIpc();
}

// E2E and portable installs may isolate the profile — preferences AND the
// single-instance lock live under userData, so an overridden path also keeps
// test instances from quitting against a running dev instance. Must run before
// any `getPath('userData')` consumer, including the lock below.
const userDataOverride = process.env['DESKTOP_LIFE_USER_DATA'];
if (userDataOverride !== undefined && userDataOverride !== '') {
  app.setPath('userData', userDataOverride);
}

// Two instances would race on the same save file, which is a data-loss bug
// rather than an inconvenience (SAVE_FORMAT.md §7).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (overlay !== null && !overlay.isDestroyed()) overlay.showInactive();
  });

  void app.whenReady().then(bootstrap);
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  saveSettings(settings);
  tray?.destroy();
  tray = null;
});
