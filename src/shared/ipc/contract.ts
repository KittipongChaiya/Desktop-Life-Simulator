/**
 * The complete IPC surface. ADR-003 §3.
 *
 * Every channel is enumerated here. `ipcRenderer` is never exposed to the
 * renderer — the preload bridge forwards only these calls (TECH_STACK.md §7.3).
 * The renderer is treated as untrusted, which becomes literally true in v0.2
 * when plugin code runs there.
 */

import type { MotionSettings } from '../motion';

/** Renderer -> main, awaiting a reply. */
export const InvokeChannel = {
  /** Collapse or expand the overlay. Resizes and re-docks the window. */
  SetCollapsed: 'overlay:set-collapsed',
  /** Current overlay state, for hydrating the UI on load. */
  GetOverlayState: 'overlay:get-state',
  /**
   * Content sources found on disk (phase-09d, ADR-019 §6).
   *
   * Returns BYTES AND PATHS, never judgements: main may not import `src/sim`,
   * so the renderer's composition root validates and resolves what this finds.
   */
  PluginsDiscover: 'plugins:discover',
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
   * Sets the volume dial, in percent (phase-07.5a, ADR-016). The companion's
   * audible presence dial, sanitized in main exactly like opacity.
   */
  SetVolume: 'companion:set-volume',
  /**
   * Sets one or more motion preferences (phase-07.7L, ADR-017 §7).
   *
   * A PARTIAL patch rather than the whole object: the accessibility panel has
   * six independent controls, and sending the full set from each one would let
   * two rapid toggles overwrite each other with a stale sibling value.
   */
  SetMotion: 'companion:set-motion',
  /** Mute toggle (phase-07.5a) — independent of the dial, so unmuting restores it. */
  ToggleMuted: 'companion:toggle-muted',
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
  /** Current update state — the pin and this build's version (phase-15). */
  GetUpdateState: 'update:get-state',
  /**
   * Sets or clears the version pin (phase-15, ADR-025 §6).
   *
   * `null` clears it. Main sanitizes through `parseSettings`, so a renderer
   * cannot smuggle a value past the bounds the settings file itself is held
   * to — the same treatment opacity and motion get.
   */
  SetPinnedVersion: 'update:set-pinned-version',
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
  /**
   * An update has something to say (phase-15, ADR-025 §5).
   *
   * Push rather than poll, because the moment is decided in main: the
   * announcer holds an offer until presence allows it, so the renderer cannot
   * know when to ask. Never an OS notification — this arrives at the in-overlay
   * toast surface and nowhere else (`VISION.md` §5.1).
   */
  UpdateAnnounced: 'update:announced',
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
  /**
   * The volume dial's position, 0–100 (phase-07.5a, ADR-016).
   *
   * Audio rides the companion state because volume IS a presence dial: opacity
   * governs how much the overlay intrudes on the eye, volume how much it
   * intrudes on the ear. Work mode overrides both by the same precedence.
   */
  readonly volumePercent: number;
  /** Whether sound is muted. True by default — sound is opt-in (`VISION.md` §5.1). */
  readonly muted: boolean;
  /**
   * How much the overlay MOVES (phase-07.7, ADR-017 §7).
   *
   * The third presence family, riding the same channel for the same reason as
   * volume: opacity governs how much the overlay intrudes on the eye, volume
   * on the ear, and these on the attention. Carried as STORED settings, not as
   * resolved ones — `effectiveMotion` needs `workMode`, which is on this same
   * object, and resolving in one place beats shipping both forms.
   */
  readonly motion: MotionSettings;
}

/**
 * What the load pipeline receives from disk (phase-07c, `SAVE_FORMAT.md`
 * §4.3 step 1). Both documents travel when both parse, because a structural
 * failure discovered AFTER migration also falls back to `.bak` (§5.1) — the
 * renderer needs the backup in hand without a second round trip.
 */
/**
 * What main found in the plugins directory (phase-09d).
 *
 * Deliberately unvalidated: `manifest` is whatever `JSON.parse` produced, and
 * the renderer decides what it means. `failed` carries directories that look
 * like sources but could not be read, so a plugin never vanishes without a
 * reason someone can show its author.
 */
export interface SourceDiscovery {
  readonly sources: readonly { readonly directory: string; readonly manifest: unknown }[];
  readonly failed: readonly { readonly directory: string; readonly reason: string }[];
}

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

/**
 * The write's outcome. A failure notifies and play continues (§7.3).
 *
 * The failure carries the PATH because that is what makes the notification
 * actionable (07e): "permission denied" is a shrug, "permission denied —
 * C:\...\saves\slot-0.json" is something a player can fix. Only main knows it;
 * the renderer must never derive a filesystem path of its own (ADR-003 §3).
 */
export type SaveWriteOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: string; readonly path: string };

/**
 * What the renderer knows about updating (phase-15, ADR-025 §6).
 *
 * Deliberately NOT part of `CompanionState`. That object is the presence
 * family — how much the overlay intrudes on the eye, the ear, the attention —
 * and a pin intrudes on none of them. Riding along would have made the
 * companion state mean "settings the panel happens to show".
 */
export interface UpdateState {
  /** The version running now, so the UI can show what a pin is relative to. */
  readonly currentVersion: string;
  /** The version the player will not be moved past, or `null` for no pin. */
  readonly pinnedVersion: string | null;
}

/**
 * What an announcement says. Mirrors `update-announcer.ts`'s `Announcement`,
 * restated here because this is the process boundary and the main-side type
 * may not leak across it (ADR-003 §3).
 *
 * A refusal carries a finished MESSAGE rather than the refusal record: the
 * wording belongs with the rule that produced it (`explainRefusal`), and the
 * renderer's job is to show it, not to phrase it.
 */
export type UpdateAnnouncement =
  | { readonly kind: 'offer'; readonly version: string }
  | { readonly kind: 'refusal'; readonly message: string };

export interface IpcContract {
  [InvokeChannel.SetCollapsed]: { request: boolean; response: OverlayState };
  [InvokeChannel.GetOverlayState]: { request: void; response: OverlayState };
  [InvokeChannel.SetOpacity]: { request: number; response: CompanionState };
  [InvokeChannel.GetCompanionState]: { request: void; response: CompanionState };
  [InvokeChannel.ToggleHidden]: { request: void; response: CompanionState };
  [InvokeChannel.ToggleClickThrough]: { request: void; response: CompanionState };
  [InvokeChannel.ToggleWorkMode]: { request: void; response: CompanionState };
  [InvokeChannel.SetVolume]: { request: number; response: CompanionState };
  [InvokeChannel.SetMotion]: { request: Partial<MotionSettings>; response: CompanionState };
  [InvokeChannel.ToggleMuted]: { request: void; response: CompanionState };
  [InvokeChannel.PluginsDiscover]: { request: void; response: SourceDiscovery };
  [InvokeChannel.SaveLoad]: { request: void; response: SavesOnDisk };
  [InvokeChannel.SaveWrite]: { request: unknown; response: SaveWriteOutcome };
  [InvokeChannel.GetUpdateState]: { request: void; response: UpdateState };
  [InvokeChannel.SetPinnedVersion]: { request: string | null; response: UpdateState };
  [InvokeChannel.Quit]: { request: void; response: void };
  [SendChannel.SetClickThrough]: { request: boolean };
  [EventChannel.OverlayStateChanged]: { payload: OverlayState };
  [EventChannel.CompanionStateChanged]: { payload: CompanionState };
  [EventChannel.SaveRequested]: { payload: void };
  [EventChannel.UpdateAnnounced]: { payload: UpdateAnnouncement };
}
