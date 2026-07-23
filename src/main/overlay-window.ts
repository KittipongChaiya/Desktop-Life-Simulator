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

  // ALWAYS-ON-TOP (ADR-003's original clause, RESTORED 2026-07-23 by owner
  // decision — the livability verdict on phase-01.8c's z-order inversion: a
  // maximized window covering the game entirely, collapsed status bar
  // included, proved unlivable in practice; the trade ADR-014 §2 accepted
  // with eyes open was rejected by use). 'floating' is the phase-01 level:
  // above normal windows, below OS-critical surfaces, and fullscreen
  // applications still cover it. On-top and focus-proof are INDEPENDENT —
  // the window remains unfocusable and shown with showInactive, so it sits
  // above the workspace without ever interrupting it.
  window.setAlwaysOnTop(true, 'floating');

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
