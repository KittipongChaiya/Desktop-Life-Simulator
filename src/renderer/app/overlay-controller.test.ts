/**
 * The overlay control surface. Phase-08.0c — the module was at 0%.
 *
 * It exists so React never touches `window.desktopLife` directly, and it takes
 * its bridge as a parameter, so all of it tests without Electron — the boundary
 * was right, it simply had no tests.
 *
 * Two behaviours carry real weight. Collapse is applied OPTIMISTICALLY, so the
 * overlay responds to a click before main has confirmed; and click-through is
 * de-duplicated, because `setPointerOverUi` is driven by pointer movement and
 * forwarding every move would put an IPC message on every mouse event.
 */

import { describe, expect, it, vi } from 'vitest';

import { createOverlayController } from './overlay-controller';

type Bridge = Parameters<typeof createOverlayController>[0];

function stubBridge(overrides: Partial<Bridge> & { initial?: boolean } = {}): Bridge & {
  readonly sent: boolean[];
  readonly clickThrough: boolean[];
  push(collapsed: boolean): void;
} {
  const sent: boolean[] = [];
  const clickThrough: boolean[] = [];
  let onChanged: (state: { collapsed: boolean }) => void = () => {};

  return {
    sent,
    clickThrough,
    push: (collapsed) => onChanged({ collapsed }),
    getState: () => Promise.resolve({ collapsed: overrides.initial ?? false }),
    setCollapsed: (collapsed) => {
      sent.push(collapsed);
      return Promise.resolve({ collapsed });
    },
    setClickThrough: (enabled) => clickThrough.push(enabled),
    onStateChanged: (listener) => {
      onChanged = listener;
      return () => {
        onChanged = () => {};
      };
    },
    ...overrides,
  };
}

describe('createOverlayController', () => {
  it('starts collapsed-false and hydrates from main', async () => {
    const controller = createOverlayController(stubBridge({ initial: true }));
    expect(controller.isCollapsed()).toBe(false); // before the promise settles
    await Promise.resolve();
    expect(controller.isCollapsed()).toBe(true);
  });

  it('applies a collapse immediately and forwards it to main', () => {
    const bridge = stubBridge();
    const controller = createOverlayController(bridge);

    controller.setCollapsed(true);
    expect(controller.isCollapsed()).toBe(true); // optimistic, not awaited
    expect(bridge.sent).toEqual([true]);
  });

  it('toggle flips whichever state it is in', () => {
    const bridge = stubBridge();
    const controller = createOverlayController(bridge);

    controller.toggle();
    controller.toggle();
    expect(bridge.sent).toEqual([true, false]);
    expect(controller.isCollapsed()).toBe(false);
  });

  it('follows a tray-driven change pushed from main', () => {
    const bridge = stubBridge();
    const controller = createOverlayController(bridge);

    bridge.push(true);
    expect(controller.isCollapsed()).toBe(true);
    expect(bridge.sent).toEqual([]); // an echo back to main would loop
  });

  it('notifies subscribers on a change, and not on a no-op', () => {
    const bridge = stubBridge();
    const controller = createOverlayController(bridge);
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setCollapsed(true);
    expect(listener).toHaveBeenCalledTimes(1);

    controller.setCollapsed(true); // already collapsed
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying an unsubscribed listener', () => {
    const controller = createOverlayController(stubBridge());
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    unsubscribe();
    controller.setCollapsed(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies every subscriber', () => {
    const controller = createOverlayController(stubBridge());
    const listeners = [vi.fn(), vi.fn()];
    for (const listener of listeners) controller.subscribe(listener);

    controller.setCollapsed(true);
    for (const listener of listeners) expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('setPointerOverUi', () => {
  it('turns click-through ON when the pointer is NOT over interactive UI', () => {
    const bridge = stubBridge();
    const controller = createOverlayController(bridge);

    controller.setPointerOverUi(false);
    expect(bridge.clickThrough).toEqual([true]);
  });

  it('turns click-through OFF while the pointer is over the HUD', () => {
    const bridge = stubBridge();
    const controller = createOverlayController(bridge);

    controller.setPointerOverUi(true);
    expect(bridge.clickThrough).toEqual([false]);
  });

  it('sends nothing when the answer has not changed', () => {
    // This runs on pointer movement; forwarding each one is an IPC message per
    // mouse event, which is exactly what the overlay must not cost.
    const bridge = stubBridge();
    const controller = createOverlayController(bridge);

    controller.setPointerOverUi(true);
    controller.setPointerOverUi(true);
    controller.setPointerOverUi(true);
    expect(bridge.clickThrough).toEqual([false]);

    controller.setPointerOverUi(false);
    expect(bridge.clickThrough).toEqual([false, true]);
  });
});

describe('quit', () => {
  it('asks the app to quit through the global bridge', () => {
    const quit = vi.fn(() => Promise.resolve());
    (globalThis as { desktopLife?: unknown }).desktopLife = { app: { quit } };
    try {
      createOverlayController(stubBridge()).quit();
      expect(quit).toHaveBeenCalled();
    } finally {
      delete (globalThis as { desktopLife?: unknown }).desktopLife;
    }
  });

  it('does not throw when the bridge is absent — a browser-only render', () => {
    delete (globalThis as { desktopLife?: unknown }).desktopLife;
    expect(() => createOverlayController(stubBridge()).quit()).not.toThrow();
  });
});
