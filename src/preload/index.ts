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
