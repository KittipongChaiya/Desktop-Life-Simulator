/**
 * Electron main process entry. Phase-01.
 *
 * Owns the window, overlay geometry, tray, single-instance lock, and IPC
 * validation. No game logic and no rendering ever happens here (ADR-003 §3).
 */

import { join } from 'node:path';

import { app, ipcMain, Menu, nativeImage, screen, Tray, type BrowserWindow } from 'electron';

import { serializeSave } from '../persistence/serialize';
import { parseSaveDocument } from '../persistence/validate';
import {
  EventChannel,
  InvokeChannel,
  SendChannel,
  type CompanionState,
  type OverlayState,
  type SaveWriteOutcome,
  type UpdateState,
} from '../shared/ipc/contract';
import {
  validateBoolean,
  validateNullableString,
  validateNumber,
  validateVoid,
} from '../shared/ipc/schemas';
import { DEFAULT_BINDINGS, ShortcutAction } from '../shared/shortcuts';

import { applyHidden, applyOpacity, globalShortcutRegistrar } from './desktop-companion';
import { dockedBounds, watchDisplayChanges } from './docking';
import { createOverlayWindow, setClickThrough, setCollapsed } from './overlay-window';
import { discoverSources } from './plugin-discovery';
import { atomicWriteSave, readSavesForLoad, slotPath } from './save-store';
import { createSaveCoordinator, type SaveCoordinator } from './save-triggers';
import { loadSettings, saveSettings } from './settings';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  sanitizeOpacityPercent,
  sanitizeVolumePercent,
  type AppSettings,
} from './settings-schema';
import { createShortcutManager, type ShortcutManager } from './shortcut-manager';

/** `userData/plugins` — where installed content sources live (phase-09d). */
function pluginsDir(): string {
  return join(app.getPath('userData'), 'plugins');
}

/** `userData/saves` — never hardcoded (`PROJECT_STRUCTURE.md` §7). */
function savesDir(): string {
  return join(app.getPath('userData'), 'saves');
}

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
let saves: SaveCoordinator | null = null;
// Whether the quit-time save has already been awaited. `before-quit` runs
// again after we re-issue the quit, and a second save there would be a write
// with no world left to describe.
let quitSaveSettled = false;

/**
 * How long shutdown waits for the quit save (07e, `SAVE_FORMAT.md` §7.2 —
 * "blocks shutdown until complete").
 *
 * Generous next to a measured sub-100 ms write, and finite because a wedged
 * renderer must never be able to prevent quit — the previous good save is
 * already on disk, so the worst case is losing the last few seconds, not the
 * farm.
 */
const QUIT_SAVE_TIMEOUT_MS = 3_000;

function overlayState(): OverlayState {
  const bounds = dockedBounds(screen, settings.overlay.collapsed);
  return { collapsed: settings.overlay.collapsed, width: bounds.width, height: bounds.height };
}

function companionState(): CompanionState {
  return {
    opacityPercent: settings.desktop.opacityPercent,
    workMode: settings.desktop.workMode,
    clickThrough: clickThroughMode,
    hidden,
    volumePercent: settings.audio.volumePercent,
    muted: settings.audio.muted,
    motion: settings.motion,
  };
}

/**
 * The volume dial (07.5a). Sanitized here for the same reason opacity is:
 * the renderer is untrusted, and the dial's range is the schema's to enforce.
 * Nothing plays in main — this only persists and broadcasts the preference.
 */
function applyVolumePercent(next: number): CompanionState {
  settings = {
    ...settings,
    audio: { ...settings.audio, volumePercent: sanitizeVolumePercent(next) },
  };
  broadcastCompanionState();
  saveSettings(settings);
  return companionState();
}

/**
 * Applies a partial motion patch, re-sanitizing the merged result.
 *
 * Merged then parsed, rather than parsed then merged: a patch carrying one
 * field must not reset its five siblings to defaults, and re-parsing the whole
 * category is what guarantees a renderer cannot smuggle a value past the
 * bounds the file itself is held to.
 */
function applyMotion(patch: Record<string, unknown>): CompanionState {
  const merged = parseSettings({ ...settings, motion: { ...settings.motion, ...patch } });
  settings = { ...settings, motion: merged.motion };
  broadcastCompanionState();
  saveSettings(settings);
  return companionState();
}

/** The update state the renderer sees (phase-15, ADR-025 §6). */
function updateState(): UpdateState {
  return {
    currentVersion: app.getVersion(),
    pinnedVersion: settings.update.pinnedVersion,
  };
}

/**
 * Sets or clears the pin, through the settings schema rather than around it.
 *
 * Merged then parsed, exactly as `applyMotion` is and for the same reason: the
 * renderer is untrusted (ADR-003 §3), and re-parsing the whole category is
 * what guarantees it cannot write a value a hand-edited file would have been
 * refused. That the schema then KEEPS an unreadable pin is deliberate — it is
 * the player's request to be held, and `update-policy.ts` is what declines to
 * order it against a release.
 */
function applyPinnedVersion(next: string | null): UpdateState {
  const merged = parseSettings({ ...settings, update: { pinnedVersion: next } });
  settings = { ...settings, update: merged.update };
  saveSettings(settings);
  return updateState();
}

function toggleMuted(): CompanionState {
  settings = { ...settings, audio: { ...settings.audio, muted: !settings.audio.muted } };
  broadcastCompanionState();
  saveSettings(settings);
  return companionState();
}

function broadcastCompanionState(): void {
  if (overlay !== null && !overlay.isDestroyed()) {
    overlay.webContents.send(EventChannel.CompanionStateChanged, companionState());
  }
}

/**
 * Quick hide / restore. ONE action with three inputs — the `F10` global
 * hotkey, the tray item, and the IPC toggle — exactly the action/input split
 * fix/0.1/1.8a.md demands. Nothing is persisted: relaunch always shows.
 */
function toggleHidden(): CompanionState {
  hidden = !hidden;
  // Close-to-tray, in the shape this app actually has: quick hide is the
  // only state where the window stops being present and the tray becomes the
  // way back (`SAVE_FORMAT.md` §7.2 "on window close to tray"). Fire and
  // forget — hiding must feel instant, and the renderer coalesces.
  if (hidden) saves?.fire();
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

  ipcMain.handle(InvokeChannel.SetVolume, (_event, payload: unknown) => {
    const parsed = validateNumber(payload, InvokeChannel.SetVolume);
    if (!parsed.ok) return companionState();
    return applyVolumePercent(parsed.value);
  });

  ipcMain.handle(InvokeChannel.SetMotion, (_event, payload: unknown) => {
    // Sanitized through the same schema the settings FILE goes through, so a
    // renderer — which ADR-003 §3 treats as untrusted, and which literally
    // becomes untrusted when v0.2 runs plugin code there — cannot write a
    // value that a hand-edited file would have been refused.
    if (typeof payload !== 'object' || payload === null) return companionState();
    return applyMotion(payload as Record<string, unknown>);
  });

  ipcMain.handle(InvokeChannel.ToggleMuted, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.ToggleMuted);
    return toggleMuted();
  });

  ipcMain.handle(InvokeChannel.GetUpdateState, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.GetUpdateState);
    return updateState();
  });

  ipcMain.handle(InvokeChannel.SetPinnedVersion, (_event, payload: unknown) => {
    const parsed = validateNullableString(payload, InvokeChannel.SetPinnedVersion);
    if (!parsed.ok) return updateState();
    return applyPinnedVersion(parsed.value);
  });

  ipcMain.handle(InvokeChannel.SaveLoad, (_event, payload: unknown) => {
    validateVoid(payload, InvokeChannel.SaveLoad);
    // Main's half of the load pipeline: bytes -> parsed JSON with .bak
    // routing (SAVE_FORMAT.md 4.3 step 1). Migration, validation, and
    // hydration run in the renderer (ARCHITECTURE.md 4.3).
    return readSavesForLoad(savesDir());
  });

  ipcMain.handle(InvokeChannel.PluginsDiscover, () => discoverSources(pluginsDir()));

  ipcMain.handle(InvokeChannel.SaveWrite, (_event, payload: unknown): SaveWriteOutcome => {
    const path = slotPath(savesDir());
    // Every exit from this handler settles the quit rendezvous (07e): a
    // shutdown must be released by a save that FAILED just as surely as by
    // one that succeeded, or a full disk becomes a hang.
    try {
      // The renderer is untrusted (ADR-003 3): the document is validated
      // STRUCTURALLY on receipt, and the canonical bytes are produced here in
      // main from the validated value - never trusted as a pre-serialized blob.
      const structural = parseSaveDocument(payload);
      if (!structural.ok) {
        return { ok: false, error: `rejected: ${structural.error.message}`, path };
      }
      try {
        atomicWriteSave(savesDir(), serializeSave(structural.value), structural.value.world.tick);
        return { ok: true };
      } catch (thrown) {
        // A failed save never crashes the game and never damages the existing
        // save (SAVE_FORMAT.md 7.3) - the sequence's ordering guarantees the
        // second half; this catch guarantees the first.
        return {
          ok: false,
          error: thrown instanceof Error ? thrown.message : String(thrown),
          path,
        };
      }
    } finally {
      saves?.writeSettled();
    }
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
  stopWatchingDisplays = watchDisplayChanges(screen, () => settings.overlay.collapsed, overlay);

  overlay.on('closed', () => {
    stopWatchingDisplays?.();
    stopWatchingDisplays = null;
    overlay = null;
  });

  createTray();
  registerIpc();

  // Save triggers (07e). Wall-clock timers here rather than a tick count in
  // the renderer, so the cadence keeps running when the render loop is
  // throttled — and so serialization is never scheduled from inside a frame
  // (`SAVE_FORMAT.md` §7.2, "off the render path").
  saves = createSaveCoordinator({
    request: () => {
      if (overlay === null || overlay.isDestroyed()) return false;
      overlay.webContents.send(EventChannel.SaveRequested);
      return true;
    },
    startInterval: (handler, ms) => {
      const handle = setInterval(handler, ms);
      return () => {
        clearInterval(handle);
      };
    },
    startTimeout: (handler, ms) => {
      const handle = setTimeout(handler, ms);
      return () => {
        clearTimeout(handle);
      };
    },
  });
  saves.start();

  // Global hotkeys, resolved through the one manager (fix/0.1/1.8a.md).
  // Failures are non-fatal by policy: the feature degrades and the tray
  // remains the fallback (ADR-014 §5.2). Quick hide defaults to F10 because
  // Windows refuses F12 outright — RegisterHotKey reserves it for the
  // debugger (01.8b finding; owner rebind 2026-07-23).
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

app.on('before-quit', (event) => {
  // The quit save BLOCKS shutdown (`SAVE_FORMAT.md` §7.2). The renderer owns
  // the world, so the only way to save it is to ask and wait — which means
  // deferring the quit exactly once, then re-issuing it however the save
  // turned out. `quitSaveSettled` is what makes the second pass fall through
  // instead of asking a torn-down window to serialize.
  if (!quitSaveSettled && saves !== null) {
    event.preventDefault();
    void saves.fireAndWait(QUIT_SAVE_TIMEOUT_MS).then(() => {
      quitSaveSettled = true;
      app.quit();
    });
    return;
  }

  saves?.stop();
  saves = null;
  saveSettings(settings);
  tray?.destroy();
  tray = null;
});

app.on('will-quit', () => {
  // Release the global keys back to the OS the moment we stop being an app.
  shortcuts?.dispose();
  shortcuts = null;
});
