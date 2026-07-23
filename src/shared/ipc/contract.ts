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
  /**
   * Sets the desktop-companion opacity dial, in percent (phase-01.8a).
   * Main sanitizes to the dial's range/step and applies instantly (ADR-014 §2).
   */
  SetOpacity: 'companion:set-opacity',
  /** Current companion state, for hydrating the settings UI on load. */
  GetCompanionState: 'companion:get-state',
  /**
   * Quick hide / restore (phase-01.8b). One INPUT to the same action the
   * `F10` global hotkey and the tray drive — never a separate path.
   */
  ToggleHidden: 'companion:toggle-hidden',
  /** Click-through mode toggle (phase-01.8b) — the `Ctrl+Shift+C` action's IPC input. */
  ToggleClickThrough: 'companion:toggle-click-through',
  /** Work mode toggle (phase-01.8c) — the `F11` action's IPC input. */
  ToggleWorkMode: 'companion:toggle-work-mode',
  /**
   * Reads both save files from disk, parsed (phase-07c). Main's half of the
   * load pipeline (`ARCHITECTURE.md` §4.3): bytes → JSON with `.bak` routing;
   * migration, validation, and hydration run in the renderer.
   */
  SaveLoad: 'save:load',
  /**
   * Writes a save document atomically (phase-07c). Main validates the
   * document STRUCTURALLY on receipt — the renderer is untrusted (ADR-003
   * §3) — then runs the §7.1 six-step sequence.
   */
  SaveWrite: 'save:write',
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
  /** Companion state changed — settings UI, or a global hotkey (01.8b/c). */
  CompanionStateChanged: 'companion:state-changed',
  /**
   * Main asks the renderer for a save (phase-07c). The renderer owns the
   * world, so every save trigger — quit, tray, autosave timers (07e) —
   * arrives as this request; the renderer serializes and invokes SaveWrite.
   */
  SaveRequested: 'save:requested',
} as const;

export type EventChannel = (typeof EventChannel)[keyof typeof EventChannel];

export interface OverlayState {
  readonly collapsed: boolean;
  /** Logical width of the docked overlay, in CSS pixels. */
  readonly width: number;
  /** Logical height of the docked overlay, in CSS pixels. */
  readonly height: number;
}

/**
 * Desktop-companion state (phase-01.8, ADR-014).
 *
 * `clickThrough` and `hidden` are RUNTIME state: they cross IPC so the UI can
 * confirm toggles with toasts, but they are never persisted — both reset by
 * not existing anywhere at launch (ADR-014 §4).
 */
export interface CompanionState {
  /** The opacity dial's position, 30–100. Work mode does not move it. */
  readonly opacityPercent: number;
  /** Whether work mode is active (the toggle itself arrives in 01.8c). */
  readonly workMode: boolean;
  /** Whether click-through MODE forces mouse transparency (01.8b). */
  readonly clickThrough: boolean;
  /** Whether the overlay is quick-hidden (01.8b). */
  readonly hidden: boolean;
}

/**
 * What the load pipeline receives from disk (phase-07c, `SAVE_FORMAT.md`
 * §4.3 step 1). Both documents travel when both parse, because a structural
 * failure discovered AFTER migration also falls back to `.bak` (§5.1) — the
 * renderer needs the backup in hand without a second round trip.
 */
export interface SavesOnDisk {
  /** Parsed `slot-0.json`, or null if absent or unparseable. */
  readonly primary: unknown;
  /** Parsed `slot-0.json.bak`, or null if absent or unparseable. */
  readonly backup: unknown;
  /**
   * True only when NEITHER file exists — the one case where a new game is
   * correct. Present-but-unreadable is `missing: false` with both nulls:
   * silently starting over on corruption is the forbidden outcome.
   */
  readonly missing: boolean;
}

/** The write's outcome. A failure notifies and play continues (§7.3). */
export type SaveWriteOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

export interface IpcContract {
  [InvokeChannel.SetCollapsed]: { request: boolean; response: OverlayState };
  [InvokeChannel.GetOverlayState]: { request: void; response: OverlayState };
  [InvokeChannel.SetOpacity]: { request: number; response: CompanionState };
  [InvokeChannel.GetCompanionState]: { request: void; response: CompanionState };
  [InvokeChannel.ToggleHidden]: { request: void; response: CompanionState };
  [InvokeChannel.ToggleClickThrough]: { request: void; response: CompanionState };
  [InvokeChannel.ToggleWorkMode]: { request: void; response: CompanionState };
  [InvokeChannel.SaveLoad]: { request: void; response: SavesOnDisk };
  [InvokeChannel.SaveWrite]: { request: unknown; response: SaveWriteOutcome };
  [InvokeChannel.Quit]: { request: void; response: void };
  [SendChannel.SetClickThrough]: { request: boolean };
  [EventChannel.OverlayStateChanged]: { payload: OverlayState };
  [EventChannel.CompanionStateChanged]: { payload: CompanionState };
  [EventChannel.SaveRequested]: { payload: void };
}
