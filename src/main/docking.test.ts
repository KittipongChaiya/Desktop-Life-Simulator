/**
 * Overlay geometry. Phase-08.0c — the module was at 0%, and untestable.
 *
 * Every case here is a display configuration that exists on someone's desk and
 * not on the one this was written on: a taskbar on top, a secondary monitor at
 * a negative offset, a resolution change mid-session. Docking to the work area
 * rather than the screen bounds is what keeps the overlay above the taskbar
 * instead of under it (`VISION.md` §2.1), and nothing proved that until now.
 *
 * The module takes the work area and the screen as parameters (08.0c), so all
 * of this runs in plain Node with a stub `DisplaySource` — no Electron, no
 * mocking framework (`TESTING.md` §2).
 */

import type { BrowserWindow, Rectangle } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { OVERLAY_HEIGHT_COLLAPSED, OVERLAY_HEIGHT_EXPANDED } from '../shared/constants';

import {
  applyDocking,
  dockedBounds,
  dockedBoundsIn,
  overlayHeight,
  watchDisplayChanges,
  type DisplaySource,
} from './docking';

/** A typical 1080p display with a 40px taskbar along the bottom. */
const WORK_AREA: Rectangle = { x: 0, y: 0, width: 1920, height: 1040 };

function stubScreen(workArea: Rectangle = WORK_AREA): DisplaySource & {
  readonly listeners: Map<string, () => void>;
  emit(event: string): void;
} {
  const listeners = new Map<string, () => void>();
  return {
    listeners,
    getPrimaryDisplay: () => ({ workArea }),
    on: (event, listener) => listeners.set(event, listener),
    off: (event, listener) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
    emit: (event) => listeners.get(event)?.(),
  };
}

function stubWindow(destroyed = false): BrowserWindow & { readonly bounds: Rectangle[] } {
  const bounds: Rectangle[] = [];
  return {
    bounds,
    isDestroyed: () => destroyed,
    setBounds: (rectangle: Rectangle) => bounds.push(rectangle),
  } as unknown as BrowserWindow & { readonly bounds: Rectangle[] };
}

describe('overlayHeight', () => {
  it('is the collapsed height when collapsed and the expanded one when not', () => {
    expect(overlayHeight(true)).toBe(OVERLAY_HEIGHT_COLLAPSED);
    expect(overlayHeight(false)).toBe(OVERLAY_HEIGHT_EXPANDED);
    expect(OVERLAY_HEIGHT_COLLAPSED).toBeLessThan(OVERLAY_HEIGHT_EXPANDED);
  });
});

describe('dockedBoundsIn', () => {
  it('sits on the bottom edge of the work area and spans its full width', () => {
    const bounds = dockedBoundsIn(WORK_AREA, false);
    expect(bounds.x).toBe(WORK_AREA.x);
    expect(bounds.width).toBe(WORK_AREA.width);
    expect(bounds.y + bounds.height).toBe(WORK_AREA.y + WORK_AREA.height);
  });

  it('stays on the work area edge when collapsed — only the height changes', () => {
    const expanded = dockedBoundsIn(WORK_AREA, false);
    const collapsed = dockedBoundsIn(WORK_AREA, true);
    expect(collapsed.y + collapsed.height).toBe(expanded.y + expanded.height);
    expect(collapsed.height).toBe(OVERLAY_HEIGHT_COLLAPSED);
    expect(collapsed.y).toBeGreaterThan(expanded.y);
  });

  it('honours a work area that does not start at the origin (taskbar on top)', () => {
    // A top or left taskbar offsets the work area. Ignoring the offset docks
    // the overlay 40px off the bottom of the screen.
    const shifted: Rectangle = { x: 0, y: 40, width: 1920, height: 1040 };
    const bounds = dockedBoundsIn(shifted, false);
    expect(bounds.y + bounds.height).toBe(1080);
  });

  it('honours a display at a negative offset (a monitor to the left)', () => {
    const secondary: Rectangle = { x: -1920, y: -200, width: 1600, height: 900 };
    const bounds = dockedBoundsIn(secondary, false);
    expect(bounds.x).toBe(-1920);
    expect(bounds.width).toBe(1600);
    expect(bounds.y + bounds.height).toBe(700);
  });
});

describe('dockedBounds', () => {
  it('reads the primary display through the injected screen', () => {
    const screen = stubScreen({ x: 5, y: 5, width: 800, height: 600 });
    expect(dockedBounds(screen, false)).toEqual(
      dockedBoundsIn(screen.getPrimaryDisplay().workArea, false),
    );
  });
});

describe('applyDocking', () => {
  it('moves the window onto the docked rectangle', () => {
    const window = stubWindow();
    const screen = stubScreen();
    applyDocking(window, screen, false);
    expect(window.bounds).toEqual([dockedBoundsIn(WORK_AREA, false)]);
  });

  it('does nothing to a destroyed window — a late display event must not throw', () => {
    const window = stubWindow(true);
    applyDocking(window, stubScreen(), false);
    expect(window.bounds).toEqual([]);
  });
});

describe('watchDisplayChanges', () => {
  it('re-docks on every event that can move the work area', () => {
    const window = stubWindow();
    const screen = stubScreen();
    watchDisplayChanges(screen, () => false, window);

    for (const event of ['display-metrics-changed', 'display-added', 'display-removed']) {
      expect(screen.listeners.has(event), `no listener for ${event}`).toBe(true);
      screen.emit(event);
    }
    expect(window.bounds).toHaveLength(3);
  });

  it('re-docks to the CURRENT collapse state, not the one at registration', () => {
    // The callback is a getter for exactly this reason: the player may collapse
    // the overlay between the watch starting and a monitor being unplugged.
    const window = stubWindow();
    const screen = stubScreen();
    let collapsed = false;
    watchDisplayChanges(screen, () => collapsed, window);

    collapsed = true;
    screen.emit('display-added');
    expect(window.bounds[0]?.height).toBe(OVERLAY_HEIGHT_COLLAPSED);
  });

  it('re-docks to the NEW work area after a resolution change', () => {
    // The whole point of the watch: reading a cached work area would re-dock
    // the overlay to where the screen used to be.
    const window = stubWindow();
    const listeners = new Map<string, () => void>();
    let workArea: Rectangle = { x: 0, y: 0, width: 1920, height: 1040 };
    const screen: DisplaySource = {
      getPrimaryDisplay: () => ({ workArea }),
      on: (event, listener) => listeners.set(event, listener),
      off: (event) => listeners.delete(event),
    };

    watchDisplayChanges(screen, () => false, window);
    workArea = { x: 0, y: 0, width: 1280, height: 680 };
    listeners.get('display-metrics-changed')?.();

    const docked = window.bounds[0];
    expect(docked?.width).toBe(1280);
    expect((docked?.y ?? 0) + (docked?.height ?? 0)).toBe(680);
  });

  it('removes every listener on teardown', () => {
    const screen = stubScreen();
    const stop = watchDisplayChanges(screen, () => false, stubWindow());
    expect(screen.listeners.size).toBe(3);
    stop();
    expect(screen.listeners.size).toBe(0);
  });

  it('stops re-docking once torn down', () => {
    const window = stubWindow();
    const screen = stubScreen();
    const stop = watchDisplayChanges(screen, () => false, window);
    stop();
    screen.emit('display-added');
    expect(window.bounds).toEqual([]);
  });
});

describe('the redock listener set', () => {
  it('registers one listener per event and no duplicates', () => {
    const screen = stubScreen();
    const on = vi.spyOn(screen, 'on');
    watchDisplayChanges(screen, () => false, stubWindow());
    expect(on).toHaveBeenCalledTimes(3);
  });
});
