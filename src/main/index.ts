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
  type OverlayState,
} from '../shared/ipc/contract';
import { validateBoolean, validateVoid } from '../shared/ipc/schemas';

import { dockedBounds, watchDisplayChanges } from './docking';
import { createOverlayWindow, setClickThrough, setCollapsed } from './overlay-window';
import { loadSettings, saveSettings } from './settings';

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let collapsed = false;
let stopWatchingDisplays: (() => void) | null = null;

function overlayState(): OverlayState {
  const bounds = dockedBounds(collapsed);
  return { collapsed, width: bounds.width, height: bounds.height };
}

function applyCollapsed(next: boolean): OverlayState {
  collapsed = next;

  if (overlay !== null && !overlay.isDestroyed()) {
    setCollapsed(overlay, collapsed);
    overlay.webContents.send(EventChannel.OverlayStateChanged, overlayState());
  }

  saveSettings({ collapsed });
  refreshTrayMenu();
  return overlayState();
}

function refreshTrayMenu(): void {
  if (tray === null) return;

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: collapsed ? 'Expand' : 'Collapse',
        click: () => void applyCollapsed(!collapsed),
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
  tray.on('double-click', () => void applyCollapsed(!collapsed));
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
  collapsed = loadSettings().collapsed;

  overlay = createOverlayWindow(collapsed);
  stopWatchingDisplays = watchDisplayChanges(() => collapsed, overlay);

  overlay.on('closed', () => {
    stopWatchingDisplays?.();
    stopWatchingDisplays = null;
    overlay = null;
  });

  createTray();
  registerIpc();
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
  saveSettings({ collapsed });
  tray?.destroy();
  tray = null;
});
