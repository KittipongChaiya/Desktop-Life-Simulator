/**
 * The complete IPC surface. ADR-003 §3.
 *
 * Every channel is enumerated here. `ipcRenderer` is never exposed to the
 * renderer — the preload bridge forwards only these calls (TECH_STACK.md §7.3).
 * The renderer is treated as untrusted, which becomes literally true in v0.2
 * when plugin code runs there.
 */

/** Renderer -> main, awaiting a reply. */
export const InvokeChannel = {
  /** Collapse or expand the overlay. Resizes and re-docks the window. */
  SetCollapsed: 'overlay:set-collapsed',
  /** Current overlay state, for hydrating the UI on load. */
  GetOverlayState: 'overlay:get-state',
  /** Quit the application. */
  Quit: 'app:quit',
} as const;

export type InvokeChannel = (typeof InvokeChannel)[keyof typeof InvokeChannel];

/** Renderer -> main, fire and forget. */
export const SendChannel = {
  /**
   * Toggle mouse transparency for the window.
   *
   * Driven by renderer hit-testing: the overlay is click-through except where
   * a real control sits under the cursor. Fire-and-forget because it is called
   * on pointer movement and must never block input.
   */
  SetClickThrough: 'overlay:set-click-through',
} as const;

export type SendChannel = (typeof SendChannel)[keyof typeof SendChannel];

/** Main -> renderer. */
export const EventChannel = {
  /** Overlay was collapsed or expanded from outside the UI (tray, hotkey). */
  OverlayStateChanged: 'overlay:state-changed',
} as const;

export type EventChannel = (typeof EventChannel)[keyof typeof EventChannel];

export interface OverlayState {
  readonly collapsed: boolean;
  /** Logical width of the docked overlay, in CSS pixels. */
  readonly width: number;
  /** Logical height of the docked overlay, in CSS pixels. */
  readonly height: number;
}

export interface IpcContract {
  [InvokeChannel.SetCollapsed]: { request: boolean; response: OverlayState };
  [InvokeChannel.GetOverlayState]: { request: void; response: OverlayState };
  [InvokeChannel.Quit]: { request: void; response: void };
  [SendChannel.SetClickThrough]: { request: boolean };
  [EventChannel.OverlayStateChanged]: { payload: OverlayState };
}
