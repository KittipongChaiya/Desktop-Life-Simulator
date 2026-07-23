/**
 * Preload bridge.
 *
 * The ONLY channel between renderer and main. `ipcRenderer` is never exposed —
 * only these named functions, so the renderer cannot reach a channel that is
 * not listed in the contract (TECH_STACK.md §7.3).
 */

import { contextBridge, ipcRenderer } from 'electron';

import {
  EventChannel,
  InvokeChannel,
  SendChannel,
  type CompanionState,
  type OverlayState,
} from '../shared/ipc/contract';

export interface DesktopLifeApi {
  readonly overlay: {
    setCollapsed(collapsed: boolean): Promise<OverlayState>;
    getState(): Promise<OverlayState>;
    setClickThrough(enabled: boolean): void;
    /** Subscribes to external collapse/expand (tray, hotkey). Returns teardown. */
    onStateChanged(listener: (state: OverlayState) => void): () => void;
  };
  /** Desktop companion (phase-01.8, ADR-014): app preferences, never game state. */
  readonly companion: {
    setOpacity(percent: number): Promise<CompanionState>;
    getState(): Promise<CompanionState>;
    /** Quick hide/restore — the same action `F12` and the tray drive. */
    toggleHidden(): Promise<CompanionState>;
    /** Click-through mode — the same action `Ctrl+Shift+C` drives. */
    toggleClickThrough(): Promise<CompanionState>;
    /** Work mode — the same action `F11` drives. */
    toggleWorkMode(): Promise<CompanionState>;
    /** Subscribes to companion changes (settings UI, global hotkeys). Returns teardown. */
    onStateChanged(listener: (state: CompanionState) => void): () => void;
  };
  readonly app: {
    quit(): Promise<void>;
  };
  readonly versions: {
    readonly electron: string;
    readonly chrome: string;
    readonly node: string;
  };
}

const api: DesktopLifeApi = {
  overlay: {
    setCollapsed: (collapsed) =>
      ipcRenderer.invoke(InvokeChannel.SetCollapsed, collapsed) as Promise<OverlayState>,

    getState: () => ipcRenderer.invoke(InvokeChannel.GetOverlayState) as Promise<OverlayState>,

    setClickThrough: (enabled) => {
      ipcRenderer.send(SendChannel.SetClickThrough, enabled);
    },

    onStateChanged: (listener) => {
      const handler = (_event: unknown, state: OverlayState): void => {
        listener(state);
      };
      ipcRenderer.on(EventChannel.OverlayStateChanged, handler);
      return () => {
        ipcRenderer.off(EventChannel.OverlayStateChanged, handler);
      };
    },
  },

  companion: {
    setOpacity: (percent) =>
      ipcRenderer.invoke(InvokeChannel.SetOpacity, percent) as Promise<CompanionState>,

    getState: () => ipcRenderer.invoke(InvokeChannel.GetCompanionState) as Promise<CompanionState>,

    toggleHidden: () => ipcRenderer.invoke(InvokeChannel.ToggleHidden) as Promise<CompanionState>,

    toggleClickThrough: () =>
      ipcRenderer.invoke(InvokeChannel.ToggleClickThrough) as Promise<CompanionState>,

    toggleWorkMode: () =>
      ipcRenderer.invoke(InvokeChannel.ToggleWorkMode) as Promise<CompanionState>,

    onStateChanged: (listener) => {
      const handler = (_event: unknown, state: CompanionState): void => {
        listener(state);
      };
      ipcRenderer.on(EventChannel.CompanionStateChanged, handler);
      return () => {
        ipcRenderer.off(EventChannel.CompanionStateChanged, handler);
      };
    },
  },

  app: {
    quit: () => ipcRenderer.invoke(InvokeChannel.Quit) as Promise<void>,
  },

  versions: {
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  },
};

contextBridge.exposeInMainWorld('desktopLife', api);
