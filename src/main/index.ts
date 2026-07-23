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
import { DEFAULT_BINDINGS, ShortcutAction } from '../shared/shortcuts';

import { applyHidden, applyOpacity, globalShortcutRegistrar } from './desktop-companion';
import { dockedBounds, watchDisplayChanges } from './docking';
import { createOverlayWindow, setClickThrough, setCollapsed } from './overlay-window';
import { loadSettings, saveSettings } from './settings';
import { DEFAULT_SETTINGS, sanitizeOpacityPercent, type AppSettings } from './settings-schema';
import { createShortcutManager, type ShortcutManager } from './shortcut-manager';

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
// The one settings record. Updated immutably; every mutation persists it whole
// so no field can be dropped by a partial write (found designing 01.8a: the
// old `saveSettings({ collapsed })` calls would have erased the opacity).
let settings: AppSettings = DEFAULT_SETTINGS;
// Companion RUNTIME state — deliberately not part of the settings record.
// Both reset by not existing anywhere at launch: a player must never start
// the app invisible or untouchable (ADR-014 §4).
let hidden = false;
let clickThroughMode = false;
// The last per-region hit-testing request from the renderer, recorded even
// while the click-through MODE overrides it — so lifting the mode restores
// exactly the state hit-testing believes is applied (its dedupe cache stays
// truthful; without this, the window stays mouse-inert until the pointer
// happens to cross a UI boundary).
let hitTestClickThrough = true;
// Whether the overlay was collapsed when work mode was entered — runtime
// only, so leaving work mode within a session restores the prior presence
// (resolved interpretation 1); across a relaunch the memory is gone and
// leaving work mode simply stays expanded.
let collapsedBeforeWorkMode: boolean | null = null;
let shortcuts: ShortcutManager | null = null;
let stopWatchingDisplays: (() => void) | null = null;

function overlayState(): OverlayState {
  const bounds = dockedBounds(settings.overlay.collapsed);
  return { collapsed: settings.overlay.collapsed, width: bounds.width, height: bounds.height };
}

function companionState(): CompanionState {
  return {
    opacityPercent: settings.desktop.opacityPercent,
    workMode: settings.desktop.workMode,
    clickThrough: clickThroughMode,
    hidden,
  };
}

function broadcastCompanionState(): void {
  if (overlay !== null && !overlay.isDestroyed()) {
    overlay.webContents.send(EventChannel.CompanionStateChanged, companionState());
  }
}

/**
 * Quick hide / restore. ONE action with three inputs — the `F12` global
 * hotkey, the tray item, and the IPC toggle — exactly the action/input split
 * fix/0.1/1.8a.md demands. Nothing is persisted: relaunch always shows.
 */
function toggleHidden(): CompanionState {
  hidden = !hidden;
  if (overlay !== null) applyHidden(overlay, hidden);
  // The renderer keeps running while hidden (backgroundThrottling: false), so
  // it receives this and can toast the restore when the window returns.
  broadcastCompanionState();
  refreshTrayMenu();
  return companionState();
}

/**
 * Work mode (fix/0.1/1.8.md §5): the simulation runs on; opacity drops to the
 * mode constant by schema precedence; the renderer strips its HUD off the
 * broadcast state. Work mode implies the expanded overlay — it exists to show
 * the living world, which collapse has torn down (ADR-001 §2) — so entering
 * from collapsed expands, and leaving restores the prior presence.
 */
function toggleWorkMode(): CompanionState {
  const entering = !settings.desktop.workMode;

  if (entering) {
    collapsedBeforeWorkMode = settings.overlay.collapsed;
    if (settings.overlay.collapsed) applyCollapsed(false);
  }

  settings = { ...settings, desktop: { ...settings.desktop, workMode: entering } };
  if (overlay !== null) applyOpacity(overlay, settings.desktop);

  if (!entering) {
    if (collapsedBeforeWorkMode === true) applyCollapsed(true);
    collapsedBeforeWorkMode = null;
  }

  broadcastCompanionState();
  saveSettings(settings);
  return companionState();
}

/**
 * Click-through mode: the main-process override above per-region hit-testing
 * (ADR-014 §2). Mode ON forces mouse transparency; mode OFF restores the last
 * hit-testing request, which kept being recorded underneath.
 */
function toggleClickThroughMode(): CompanionState {
  clickThroughMode = !clickThroughMode;
  if (overlay !== null) {
    setClickThrough(overlay, clickThroughMode ? true : hitTestClickThrough);
  }
  broadcastCompanionState();
  return companionState();
}

function applyCollapsed(next: boolean): OverlayState {
  settings = { ...settings, overlay: { ...settings.overlay, collapsed: next } };

  if (overlay !== null && !overlay.isDestroyed()) {
    setCollapsed(overlay, settings.overlay.collapsed);
    overlay.webContents.send(EventChannel.OverlayStateChanged, overlayState());
  }

  saveSettings(settings);
  refreshTrayMenu();
  return overlayState();
}

function applyOpacityPercent(next: number): CompanionState {
  settings = {
    ...settings,
    desktop: { ...settings.desktop, opacityPercent: sanitizeOpacityPercent(next) },
  };

  if (overlay !== null && !overlay.isDestroyed()) {
    applyOpacity(overlay, settings.desktop);
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
        // The no-hotkey fallback ADR-014 §5.2 promises — and the Show/Hide
        // item the phase-01 tray spec always wanted.
        label: hidden ? 'Show overlay' : 'Hide overlay',
        click: () => void toggleHidden(),
      },
      {
        label: settings.overlay.collapsed ? 'Expand' : 'Collapse',
        click: () => void applyCollapsed(!settings.overlay.collapsed),
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
  tray.on('double-click', () => void applyCollapsed(!settings.overlay.collapsed));
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

  ipcMain.handle(InvokeChannel.ToggleHidden, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.ToggleHidden);
    return toggleHidden();
  });

  ipcMain.handle(InvokeChannel.ToggleClickThrough, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.ToggleClickThrough);
    return toggleClickThroughMode();
  });

  ipcMain.handle(InvokeChannel.ToggleWorkMode, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.ToggleWorkMode);
    return toggleWorkMode();
  });

  ipcMain.handle(InvokeChannel.Quit, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.Quit);
    app.quit();
  });

  ipcMain.on(SendChannel.SetClickThrough, (_event, payload: unknown) => {
    const parsed = validateBoolean(payload, SendChannel.SetClickThrough);
    if (!parsed.ok || overlay === null) return;
    // Always RECORD the hit-testing request; only APPLY it when the
    // click-through mode is not overriding (ADR-014 §2 — two mechanisms, one
    // owner). Lifting the mode replays the newest recorded value.
    hitTestClickThrough = parsed.value;
    if (clickThroughMode) return;
    setClickThrough(overlay, parsed.value);
  });
}

function bootstrap(): void {
  settings = loadSettings();

  overlay = createOverlayWindow(settings.overlay.collapsed);
  // Opacity applies before first show — the window never flashes at 100% on
  // its way to the player's preference (fix/0.1/1.8.md acceptance 2).
  applyOpacity(overlay, settings.desktop);
  stopWatchingDisplays = watchDisplayChanges(() => settings.overlay.collapsed, overlay);

  overlay.on('closed', () => {
    stopWatchingDisplays?.();
    stopWatchingDisplays = null;
    overlay = null;
  });

  createTray();
  registerIpc();

  // Global hotkeys, resolved through the one manager (fix/0.1/1.8a.md).
  // Failures are non-fatal by policy: the feature degrades and the tray
  // remains the fallback (ADR-014 §5.2). Known on Windows: F12 is refused
  // outright — RegisterHotKey reserves it for the debugger (01.8b finding).
  shortcuts = createShortcutManager(DEFAULT_BINDINGS, globalShortcutRegistrar);
  const failed = shortcuts.registerAll({
    [ShortcutAction.WorkMode]: () => void toggleWorkMode(),
    [ShortcutAction.QuickHide]: () => void toggleHidden(),
    [ShortcutAction.ClickThrough]: () => void toggleClickThroughMode(),
  });
  if (failed.length > 0) {
    // Operational warning, not a debug statement: another app owns the key,
    // the feature degrades, and silence here would be undiagnosable
    // (ADR-014 §5.2 — "logged and skipped"). Main has no logger; stderr is it.
    // eslint-disable-next-line no-console
    console.warn(`shortcut registration failed (key in use): ${failed.join(', ')}`);
  }
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

app.on('will-quit', () => {
  // Release the global keys back to the OS the moment we stop being an app.
  shortcuts?.dispose();
  shortcuts = null;
});
