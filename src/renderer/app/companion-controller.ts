/**
 * Desktop-companion control surface for the UI. Phase-01.8a (ADR-014 §3).
 *
 * Wraps the preload bridge behind an interface, exactly like the overlay
 * controller: React never touches `window.desktopLife` directly, which keeps
 * components testable without Electron and the UI layer free of any
 * `electron` dependency (CODE_STYLE.md §8.1).
 */

import { OPACITY_DEFAULT_PERCENT } from '../../shared/constants';

interface CompanionState {
  readonly opacityPercent: number;
  readonly workMode: boolean;
  readonly clickThrough: boolean;
  readonly hidden: boolean;
}

export interface CompanionController {
  /** The dial's position — NOT the effective window opacity (work mode overrides). */
  opacityPercent(): number;
  setOpacityPercent(value: number): void;
  workMode(): boolean;
  /** Click-through MODE (the `Ctrl+Shift+C` override), not per-region hit-testing. */
  clickThrough(): boolean;
  hidden(): boolean;
  /** Subscribes to companion state. Returns teardown. */
  subscribe(listener: () => void): () => void;
}

export interface CompanionBridge {
  setOpacity(percent: number): Promise<CompanionState>;
  getState(): Promise<CompanionState>;
  onStateChanged(listener: (state: CompanionState) => void): () => void;
}

export function createCompanionController(bridge: CompanionBridge): CompanionController {
  const listeners = new Set<() => void>();
  let state: CompanionState = {
    opacityPercent: OPACITY_DEFAULT_PERCENT,
    workMode: false,
    clickThrough: false,
    hidden: false,
  };

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const setLocal = (next: CompanionState): void => {
    if (
      state.opacityPercent === next.opacityPercent &&
      state.workMode === next.workMode &&
      state.clickThrough === next.clickThrough &&
      state.hidden === next.hidden
    ) {
      return;
    }
    state = next;
    notify();
  };

  // Hydrate from main, and stay in sync with externally-driven changes — the
  // global hotkeys (01.8b/c) flip state without the UI's involvement.
  void bridge.getState().then(setLocal);
  bridge.onStateChanged(setLocal);

  return {
    opacityPercent: () => state.opacityPercent,
    workMode: () => state.workMode,
    clickThrough: () => state.clickThrough,
    hidden: () => state.hidden,

    setOpacityPercent(value) {
      // Optimistic: the readout answers immediately; main sanitizes and
      // confirms through the state-changed event (deduplicated in setLocal).
      setLocal({ ...state, opacityPercent: value });
      void bridge.setOpacity(value);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
