/**
 * Overlay control surface for the UI.
 *
 * Wraps the preload bridge behind an interface so React never touches
 * `window.desktopLife` directly — which keeps components testable without
 * Electron and keeps the UI layer free of any `electron` dependency
 * (CODE_STYLE.md §8.1).
 */

export interface OverlayController {
  isCollapsed(): boolean;
  setCollapsed(collapsed: boolean): void;
  toggle(): void;
  /** Subscribes to collapse state. Returns teardown. */
  subscribe(listener: () => void): () => void;
  /** Reports whether the pointer is over interactive UI. */
  setPointerOverUi(over: boolean): void;
  quit(): void;
}

interface OverlayBridge {
  setCollapsed(collapsed: boolean): Promise<{ collapsed: boolean }>;
  getState(): Promise<{ collapsed: boolean }>;
  setClickThrough(enabled: boolean): void;
  onStateChanged(listener: (state: { collapsed: boolean }) => void): () => void;
}

export function createOverlayController(bridge: OverlayBridge): OverlayController {
  const listeners = new Set<() => void>();
  let collapsed = false;
  // Tracks the last value sent to main so pointer movement does not spam IPC.
  let clickThrough: boolean | null = null;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const setLocal = (next: boolean): void => {
    if (collapsed === next) return;
    collapsed = next;
    notify();
  };

  // Hydrate from main, and stay in sync with tray-driven changes.
  void bridge.getState().then((state) => {
    setLocal(state.collapsed);
  });
  bridge.onStateChanged((state) => {
    setLocal(state.collapsed);
  });

  return {
    isCollapsed: () => collapsed,

    setCollapsed(next) {
      // Optimistic: the UI responds immediately, main confirms.
      setLocal(next);
      void bridge.setCollapsed(next);
    },

    toggle() {
      this.setCollapsed(!collapsed);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setPointerOverUi(over) {
      // Click-through is ON when the pointer is NOT over interactive UI.
      const next = !over;
      if (clickThrough === next) return;
      clickThrough = next;
      bridge.setClickThrough(next);
    },

    quit() {
      void (
        globalThis as { desktopLife?: { app: { quit(): Promise<void> } } }
      ).desktopLife?.app.quit();
    },
  };
}
