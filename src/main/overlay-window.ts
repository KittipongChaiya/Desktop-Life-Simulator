/**
 * The overlay window. Phase-01 — the product's highest-risk assumption.
 *
 * Every option here is deliberate. `VISION.md` §2.1 makes "the desktop comes
 * first" a hard constraint that overrides gameplay ambition, and this file is
 * where that constraint is actually implemented.
 */

import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';

import { applyDocking, dockedBounds } from './docking';

export function createOverlayWindow(collapsed: boolean): BrowserWindow {
  const window = new BrowserWindow({
    ...dockedBounds(collapsed),

    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,

    // Absent from the taskbar and from Alt-Tab: this is a desktop widget, not
    // an application the player switches to.
    skipTaskbar: true,

    // NEVER take focus. Not on launch, not on show, not on any event. Stealing
    // focus while someone is typing in another application is the single
    // fastest way to get a desktop overlay uninstalled.
    focusable: false,
    show: false,

    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // CRITICAL: Chromium throttles background renderer timers to ~1 Hz, and
      // "backgrounded" is this product's NORMAL state. Without this the
      // simulation silently stalls whenever the player does their actual work.
      // ADR-003 §2. Asserted by tests/e2e/background-tick.spec.ts.
      backgroundThrottling: false,
    },
  });

  // ALWAYS-ON-BOTTOM (ADR-014 §2, superseding ADR-003's always-on-top
  // clause): the game is part of the desktop, not the workspace — VSCode, the
  // browser, and every ordinary window sit above it. Electron exposes no
  // push-to-bottom on Windows, so the mechanism is NEVER-RAISE: the window is
  // unfocusable, shown with showInactive (SW_SHOWNA keeps z-position), and no
  // code path calls moveTop or focus — every window the player touches rises
  // above the overlay and stays there. The launch instant, before the first
  // interaction elsewhere, is the accepted residue; the native HWND_BOTTOM
  // escape hatch (ADR-014 §2) stays deliberately unexercised in v0.1.
  window.setAlwaysOnTop(false);

  // Do not follow the user across virtual desktops; the overlay belongs to the
  // workspace it was opened on.
  window.setVisibleOnAllWorkspaces(false);

  // Show only once painted, so the window never flashes empty.
  window.once('ready-to-show', () => {
    // showInactive, not show: presenting the window must not focus it.
    window.showInactive();
  });

  loadRenderer(window);
  return window;
}

function loadRenderer(window: BrowserWindow): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

  if (!app.isPackaged && devServerUrl !== undefined) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

/**
 * Applies click-through.
 *
 * `forward: true` keeps move events flowing to the renderer while clicks pass
 * to whatever is underneath — without it, the renderer stops receiving the
 * pointer events it needs to decide when to turn click-through back OFF, and
 * the overlay becomes permanently untouchable.
 */
export function setClickThrough(window: BrowserWindow, enabled: boolean): void {
  if (window.isDestroyed()) return;
  window.setIgnoreMouseEvents(enabled, { forward: true });
}

export function setCollapsed(window: BrowserWindow, collapsed: boolean): void {
  applyDocking(window, collapsed);
}
