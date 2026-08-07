/**
 * Overlay geometry. Phase-01, parameterised in phase-08.0c.
 *
 * Docks the window to the bottom edge of the primary display's WORK AREA — not
 * its bounds. `workArea` excludes the taskbar, which is what keeps the overlay
 * above the taskbar rather than under or over it (VISION.md §2.1: the desktop
 * comes first; the game is the guest).
 *
 * THE WORK AREA AND THE SCREEN ARE PARAMETERS, NOT `screen.getPrimaryDisplay()`
 * — the doctrine `save-store.ts` states for the save directory. Only TYPES are
 * imported from `electron`, and types erase, so this module loads in a plain
 * Node test and every branch here is reachable without a browser or an app.
 *
 * That matters most for `watchDisplayChanges`: resolution, DPI, and monitor
 * changes are a class of bug that only shows up on someone else's machine, and
 * before this it could not be tested at all. `index.ts` and `overlay-window.ts`
 * supply the real `screen`.
 */

import type { BrowserWindow, Rectangle } from 'electron';

import { OVERLAY_HEIGHT_COLLAPSED, OVERLAY_HEIGHT_EXPANDED } from '../shared/constants';

/** The parts of Electron's `screen` this module uses. */
export interface DisplaySource {
  getPrimaryDisplay(): { workArea: Rectangle };
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

/** Display events that move the work area, and so require a re-dock. */
const REDOCK_EVENTS = ['display-metrics-changed', 'display-added', 'display-removed'] as const;

export function overlayHeight(collapsed: boolean): number {
  return collapsed ? OVERLAY_HEIGHT_COLLAPSED : OVERLAY_HEIGHT_EXPANDED;
}

/**
 * Computes the docked rectangle for a work area.
 *
 * Uses the primary display only in v0.1; monitor *selection* is deferred
 * (phase-01 Out of Scope).
 */
export function dockedBoundsIn(workArea: Rectangle, collapsed: boolean): Rectangle {
  const height = overlayHeight(collapsed);

  return {
    x: workArea.x,
    y: workArea.y + workArea.height - height,
    width: workArea.width,
    height,
  };
}

/** The docked rectangle for the current display configuration. */
export function dockedBounds(screen: DisplaySource, collapsed: boolean): Rectangle {
  return dockedBoundsIn(screen.getPrimaryDisplay().workArea, collapsed);
}

/** Applies the docked bounds to a window. */
export function applyDocking(
  window: BrowserWindow,
  screen: DisplaySource,
  collapsed: boolean,
): void {
  if (window.isDestroyed()) return;
  window.setBounds(dockedBounds(screen, collapsed));
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
  screen: DisplaySource,
  getCollapsed: () => boolean,
  window: BrowserWindow,
): () => void {
  const redock = (): void => {
    applyDocking(window, screen, getCollapsed());
  };

  for (const event of REDOCK_EVENTS) screen.on(event, redock);

  return () => {
    for (const event of REDOCK_EVENTS) screen.off(event, redock);
  };
}
