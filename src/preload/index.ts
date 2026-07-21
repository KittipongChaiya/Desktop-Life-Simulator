/**
 * Preload bridge.
 *
 * The ONLY channel between renderer and main. Exposes a narrow, explicitly
 * enumerated, typed surface — `ipcRenderer` itself is never exposed
 * (TECH_STACK.md §7.3). The renderer is treated as untrusted, which becomes
 * literally true once plugins load in v0.2.
 *
 * PHASE-00 SCOPE: version reporting only, proving the bridge works end to end.
 * Real channels (collapse/expand, display geometry, click-through) are phase-01;
 * save/load is phase-07.
 */

import { contextBridge } from 'electron';

export interface DesktopLifeApi {
  readonly versions: {
    readonly electron: string;
    readonly chrome: string;
    readonly node: string;
  };
}

const api: DesktopLifeApi = {
  versions: {
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  },
};

contextBridge.exposeInMainWorld('desktopLife', api);
