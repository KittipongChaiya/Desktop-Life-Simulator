/**
 * Overlay geometry. Phase-01.
 *
 * Docks the window to the bottom edge of the primary display's WORK AREA — not
 * its bounds. `workArea` excludes the taskbar, which is what keeps the overlay
 * above the taskbar rather than under or over it (VISION.md §2.1: the desktop
 * comes first; the game is the guest).
 */

import { screen, type BrowserWindow, type Rectangle } from 'electron';

import { OVERLAY_HEIGHT_COLLAPSED, OVERLAY_HEIGHT_EXPANDED } from '../shared/constants';

export function overlayHeight(collapsed: boolean): number {
  return collapsed ? OVERLAY_HEIGHT_COLLAPSED : OVERLAY_HEIGHT_EXPANDED;
}

/**
 * Computes the docked rectangle for the current display configuration.
 *
 * Uses the primary display only in v0.1; monitor *selection* is deferred
 * (phase-01 Out of Scope).
 */
export function dockedBounds(collapsed: boolean): Rectangle {
  const { workArea } = screen.getPrimaryDisplay();
  const height = overlayHeight(collapsed);

  return {
    x: workArea.x,
    y: workArea.y + workArea.height - height,
    width: workArea.width,
    height,
  };
}

/** Applies the docked bounds to a window. */
export function applyDocking(window: BrowserWindow, collapsed: boolean): void {
  if (window.isDestroyed()) return;
  window.setBounds(dockedBounds(collapsed));
}

/**
 * Re-docks on any display change.
 *
 * Resolution changes, DPI scaling changes, and monitor add/remove all move the
 * work area. Without this the overlay ends up floating mid-screen or off it
 * entirely — a class of bug that only shows up on someone else's machine.
 *
 * @returns a teardown function removing the listeners.
 */
export function watchDisplayChanges(
  getCollapsed: () => boolean,
  window: BrowserWindow,
): () => void {
  const redock = (): void => {
    applyDocking(window, getCollapsed());
  };

  screen.on('display-metrics-changed', redock);
  screen.on('display-added', redock);
  screen.on('display-removed', redock);

  return () => {
    screen.off('display-metrics-changed', redock);
    screen.off('display-added', redock);
    screen.off('display-removed', redock);
  };
}
