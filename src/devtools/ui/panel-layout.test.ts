/**
 * Panel geometry and its storage. Phase-07.8n.
 *
 * Stored layout is input from outside the program: absent, truncated,
 * hand-edited, or written by an older build. The tests that matter here are
 * the ones where it is wrong, because the failure mode is a debug toolkit that
 * will not open.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  clampGeometry,
  EMPTY_LAYOUT,
  loadLayout,
  parseLayout,
  saveLayout,
  withOpen,
  withPanel,
  type LayoutStorage,
} from './panel-layout';

const VIEWPORT = { width: 1200, height: 400 };
const BOX = { x: 100, y: 50, width: 300, height: 200 };

function fakeStorage(initial: string | null = null): LayoutStorage & { value: string | null } {
  return {
    value: initial,
    getItem(): string | null {
      return this.value;
    },
    setItem(_key: string, value: string): void {
      this.value = value;
    },
  };
}

describe('parseLayout', () => {
  it('reads a layout it wrote', () => {
    const layout = withOpen(withPanel(EMPTY_LAYOUT, 'events', BOX), 'events', true);

    expect(parseLayout(JSON.stringify(layout))).toEqual(layout);
  });

  it('falls back to empty for absent or unparseable storage', () => {
    expect(parseLayout(null)).toEqual(EMPTY_LAYOUT);
    expect(parseLayout('')).toEqual(EMPTY_LAYOUT);
    expect(parseLayout('{ truncated')).toEqual(EMPTY_LAYOUT);
    expect(parseLayout('"a string"')).toEqual(EMPTY_LAYOUT);
    expect(parseLayout('null')).toEqual(EMPTY_LAYOUT);
  });

  it('drops one unreadable panel without losing the others', () => {
    const raw = JSON.stringify({
      panels: { good: BOX, bad: { x: 'left', y: 0, width: 1, height: 1 }, missing: {} },
      open: ['good'],
    });

    const layout = parseLayout(raw);

    expect(Object.keys(layout.panels)).toEqual(['good']);
    expect(layout.open).toEqual(['good']);
  });

  it('rejects non-finite numbers, which JSON round-trips as null', () => {
    const raw = JSON.stringify({ panels: { p: { x: NaN, y: 0, width: 10, height: 10 } } });

    expect(parseLayout(raw).panels).toEqual({});
  });

  it('ignores an `open` list that is not a list of ids', () => {
    expect(parseLayout(JSON.stringify({ open: 'events' })).open).toEqual([]);
    expect(parseLayout(JSON.stringify({ open: [1, 'events', null] })).open).toEqual(['events']);
  });
});

describe('clampGeometry', () => {
  it('leaves a sensible box alone', () => {
    expect(clampGeometry(BOX, VIEWPORT)).toEqual(BOX);
  });

  it('refuses a panel too small to use', () => {
    const tiny = clampGeometry({ x: 0, y: 0, width: 1, height: 1 }, VIEWPORT);

    expect(tiny.width).toBeGreaterThanOrEqual(180);
    expect(tiny.height).toBeGreaterThanOrEqual(80);
  });

  it('keeps a panel reachable when the viewport shrinks', () => {
    // Saved on a second monitor, reopened on a laptop: a title bar off-screen
    // cannot be dragged back, so the layout would be stuck.
    const offscreen = clampGeometry({ x: 5_000, y: 3_000, width: 300, height: 200 }, VIEWPORT);

    expect(offscreen.x).toBeLessThanOrEqual(VIEWPORT.width - 32);
    expect(offscreen.y).toBeLessThanOrEqual(VIEWPORT.height - 32);
  });

  it('never makes a panel taller than the window it lives in', () => {
    // The overlay is a desktop STRIP — 1920x220 measured. A 210-tall panel at
    // y=150 hangs its grip off the bottom, where no mouse can reach it. Found
    // by an E2E that tried to grab one.
    const strip = { width: 1920, height: 220 };
    const clamped = clampGeometry({ x: 8, y: 150, width: 430, height: 210 }, strip);

    expect(clamped.height).toBeLessThanOrEqual(strip.height);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(strip.height);
  });

  it('allows a panel to hang off the left, but never entirely', () => {
    const nudged = clampGeometry({ x: -10_000, y: 0, width: 300, height: 200 }, VIEWPORT);

    expect(nudged.x).toBe(32 - 300);
  });
});

describe('layout updates', () => {
  it('records a panel position without disturbing the others', () => {
    const layout = withPanel(withPanel(EMPTY_LAYOUT, 'a', BOX), 'b', { ...BOX, x: 0 });

    expect(Object.keys(layout.panels)).toEqual(['a', 'b']);
    expect(layout.panels['a']).toEqual(BOX);
  });

  it('tracks which panels are open, without duplicates', () => {
    let layout = withOpen(EMPTY_LAYOUT, 'events', true);
    layout = withOpen(layout, 'events', true);
    layout = withOpen(layout, 'commands', true);

    expect(layout.open).toEqual(['events', 'commands']);

    expect(withOpen(layout, 'events', false).open).toEqual(['commands']);
  });
});

describe('storage', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage();
    const layout = withOpen(withPanel(EMPTY_LAYOUT, 'perf', BOX), 'perf', true);

    saveLayout(layout, storage);

    expect(loadLayout(storage)).toEqual(layout);
  });

  it('returns defaults when there is no storage at all', () => {
    expect(loadLayout(null)).toEqual(EMPTY_LAYOUT);
    expect(() => {
      saveLayout(EMPTY_LAYOUT, null);
    }).not.toThrow();
  });

  it('survives storage that throws', () => {
    // Full, or disabled by policy. Losing a remembered position is a nuisance;
    // a panel that throws while being dragged is a defect.
    const throwing: LayoutStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };

    expect(loadLayout(throwing)).toEqual(EMPTY_LAYOUT);
    expect(() => {
      saveLayout(EMPTY_LAYOUT, throwing);
    }).not.toThrow();
  });

  it('writes once per save, so dragging does not hammer storage', () => {
    const storage = fakeStorage();
    const spy = vi.spyOn(storage, 'setItem');

    saveLayout(EMPTY_LAYOUT, storage);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
