/**
 * Electron main process entry.
 *
 * PHASE-00 SCOPE: opens a plain window so the build is demonstrably runnable.
 * Overlay behavior — transparency, bottom docking, always-on-top, click-through,
 * tray, single-instance lock — is phase-01 and deliberately absent here.
 *
 * The `webPreferences` below are NOT placeholders. They are the security and
 * correctness posture required by TECH_STACK.md §2.1 and must not be relaxed.
 */

import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';

import { OVERLAY_HEIGHT_EXPANDED } from '../shared/constants';

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: OVERLAY_HEIGHT_EXPANDED,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // CRITICAL: Chromium throttles background renderer timers to ~1 Hz.
      // "Backgrounded" is this product's NORMAL state, so without this the
      // simulation silently stalls whenever the player does their actual work.
      // ADR-003 §2. Phase-01 adds an E2E test asserting the tick continues
      // while the window is occluded.
      backgroundThrottling: false,
    },
  });

  // Show only once painted, so the window never flashes empty.
  window.once('ready-to-show', () => window.show());

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devServerUrl !== undefined) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }

  return window;
}

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Windows-first (VISION.md §5.1); quit on last window close.
  app.quit();
});
