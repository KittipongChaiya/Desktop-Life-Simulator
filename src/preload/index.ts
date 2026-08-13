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
  type SavesOnDisk,
  type SourceDiscovery,
  type SaveWriteOutcome,
  type UpdateAnnouncement,
  type UpdateState,
} from '../shared/ipc/contract';
import type { MotionSettings } from '../shared/motion';

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
    /** Quick hide/restore — the same action `F10` and the tray drive. */
    toggleHidden(): Promise<CompanionState>;
    /** Click-through mode — the same action `Ctrl+Shift+C` drives. */
    toggleClickThrough(): Promise<CompanionState>;
    /** Work mode — the same action `F11` drives. */
    toggleWorkMode(): Promise<CompanionState>;
    /** The volume dial (07.5a) — the audible sibling of `setOpacity`. */
    setVolume(percent: number): Promise<CompanionState>;
    /** Motion preferences (07.7L). A PARTIAL patch — see the channel's note. */
    setMotion(patch: Partial<MotionSettings>): Promise<CompanionState>;
    /** Mute toggle (07.5a). Independent of the dial. */
    toggleMuted(): Promise<CompanionState>;
    /** Subscribes to companion changes (settings UI, global hotkeys). Returns teardown. */
    onStateChanged(listener: (state: CompanionState) => void): () => void;
  };
  /** Save/load transport (phase-07c). Disk stays in main (ADR-003 §3). */
  /** Content sources on disk (phase-09d). Unvalidated; the renderer judges. */
  readonly plugins: {
    discover(): Promise<SourceDiscovery>;
  };

  readonly save: {
    /** Both save files, parsed, with `.bak` routing done (`SAVE_FORMAT.md` §4.3 step 1). */
    load(): Promise<SavesOnDisk>;
    /** Writes a document through the §7.1 atomic sequence. */
    write(document: unknown): Promise<SaveWriteOutcome>;
    /** Main asks for a save — quit, tray, autosave (07e). Returns teardown. */
    onSaveRequested(listener: () => void): () => void;
  };
  /** Updating (phase-15, ADR-025). No download or install is reachable here. */
  readonly update: {
    getState(): Promise<UpdateState>;
    /** Sets or clears the pin. `null` clears it. */
    setPinnedVersion(version: string | null): Promise<UpdateState>;
    /**
     * Subscribes to announcements. Returns teardown.
     *
     * Pushed, never polled: main's announcer decides the moment, holding an
     * offer while the player is hidden or in work mode, so the renderer has no
     * way to know when asking would be right.
     */
    onAnnouncement(listener: (announcement: UpdateAnnouncement) => void): () => void;
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

    setVolume: (percent) =>
      ipcRenderer.invoke(InvokeChannel.SetVolume, percent) as Promise<CompanionState>,

    setMotion: (patch) =>
      ipcRenderer.invoke(InvokeChannel.SetMotion, patch) as Promise<CompanionState>,

    toggleMuted: () => ipcRenderer.invoke(InvokeChannel.ToggleMuted) as Promise<CompanionState>,

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

  plugins: {
    /** Content sources found on disk. Unvalidated — the renderer judges them. */
    discover: () => ipcRenderer.invoke(InvokeChannel.PluginsDiscover) as Promise<SourceDiscovery>,
  },

  save: {
    load: () => ipcRenderer.invoke(InvokeChannel.SaveLoad) as Promise<SavesOnDisk>,

    write: (document) =>
      ipcRenderer.invoke(InvokeChannel.SaveWrite, document) as Promise<SaveWriteOutcome>,

    onSaveRequested: (listener) => {
      const handler = (): void => {
        listener();
      };
      ipcRenderer.on(EventChannel.SaveRequested, handler);
      return () => {
        ipcRenderer.off(EventChannel.SaveRequested, handler);
      };
    },
  },

  update: {
    getState: () => ipcRenderer.invoke(InvokeChannel.GetUpdateState) as Promise<UpdateState>,

    setPinnedVersion: (version) =>
      ipcRenderer.invoke(InvokeChannel.SetPinnedVersion, version) as Promise<UpdateState>,

    onAnnouncement: (listener) => {
      const handler = (_event: unknown, announcement: UpdateAnnouncement): void => {
        listener(announcement);
      };
      ipcRenderer.on(EventChannel.UpdateAnnounced, handler);
      return () => {
        ipcRenderer.off(EventChannel.UpdateAnnounced, handler);
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
