/**
 * Desktop-companion control surface for the UI. Phase-01.8a (ADR-014 §3).
 *
 * Wraps the preload bridge behind an interface, exactly like the overlay
 * controller: React never touches `window.desktopLife` directly, which keeps
 * components testable without Electron and the UI layer free of any
 * `electron` dependency (CODE_STYLE.md §8.1).
 */

import {
  AUDIO_MUTED_BY_DEFAULT,
  OPACITY_DEFAULT_PERCENT,
  VOLUME_DEFAULT_PERCENT,
} from '../../shared/constants';
import {
  DEFAULT_MOTION_SETTINGS,
  effectiveMotion,
  type EffectiveMotion,
  type MotionSettings,
} from '../../shared/motion';

/**
 * Per-category levels before any setting arrives.
 *
 * Ambience at ZERO is ADR-023 §5 condition 1 expressed as data rather than as
 * a check somewhere: unmuting the game does not start ambience, and a code
 * path that forgot to ask would still get silence.
 */
export const DEFAULT_CATEGORY_PERCENT: Readonly<Record<string, number>> = {
  ui: 100,
  world: 100,
  ambient: 0,
  music: 100,
};

interface CompanionState {
  readonly opacityPercent: number;
  readonly workMode: boolean;
  readonly clickThrough: boolean;
  readonly hidden: boolean;
  /** Stored motion preferences (07.7); resolved through `motion()` below. */
  readonly motion: MotionSettings;
  readonly volumePercent: number;
  /**
   * Per-category audio levels, 0–100 (phase-13b, ADR-023 §2).
   *
   * OPTIONAL because the main process does not send it yet — the schema and
   * its defaults exist, the settings panel that edits them does not. Absent
   * means every category at full except the default this controller holds,
   * which keeps ambience at zero either way.
   */
  readonly categoryPercent?: Readonly<Record<string, number>>;
  readonly muted: boolean;
}

export interface CompanionController {
  /** The dial's position — NOT the effective window opacity (work mode overrides). */
  opacityPercent(): number;
  setOpacityPercent(value: number): void;
  workMode(): boolean;
  /** Click-through MODE (the `Ctrl+Shift+C` override), not per-region hit-testing. */
  clickThrough(): boolean;
  hidden(): boolean;
  /** The volume dial's position, 0–100 (07.5a). NOT the effective loudness. */
  volumePercent(): number;
  /** A category's level, 0–100. Full when the category is unknown. */
  categoryPercent(category: string): number;
  /**
   * What may move, with Reduced Motion and work mode already applied
   * (ADR-017 §7). Resolved here so no consumer re-derives the precedence.
   */
  motion(): EffectiveMotion;
  /** The motion settings AS STORED, for the controls that edit them. */
  storedMotion(): MotionSettings;
  /**
   * Patches motion preferences. Applied optimistically, then confirmed.
   *
   * PARTIAL, so six independent controls cannot overwrite each other: sending
   * the whole object from each one would let two rapid toggles race, the
   * second carrying a stale copy of the first's field.
   */
  setMotion(patch: Partial<MotionSettings>): void;
  setVolumePercent(value: number): void;
  /** Sets one category's level, 0–100 (phase-13d). Optimistic, then confirmed. */
  setCategoryPercent(category: string, value: number): void;
  muted(): boolean;
  toggleMuted(): void;
  /** Subscribes to companion state. Returns teardown. */
  subscribe(listener: () => void): () => void;
}

export interface CompanionBridge {
  setOpacity(percent: number): Promise<CompanionState>;
  setVolume(percent: number): Promise<CompanionState>;
  toggleMuted(): Promise<CompanionState>;
  setMotion(patch: Partial<MotionSettings>): Promise<CompanionState>;
  setCategoryPercent(category: string, percent: number): Promise<CompanionState>;
  getState(): Promise<CompanionState>;
  onStateChanged(listener: (state: CompanionState) => void): () => void;
}

/**
 * Field-wise, because `motion` is the one nested object on the state.
 *
 * Main rebuilds `CompanionState` on every broadcast, so a reference check
 * would report a change on every hotkey press and wake the renderer for
 * nothing.
 */
function sameMotion(a: MotionSettings | undefined, b: MotionSettings | undefined): boolean {
  // Tolerant of absence, because the flat comparisons beside it already are:
  // `state.muted === next.muted` is happily false-y for a partial payload,
  // whereas dereferencing a missing nested object throws inside the listener.
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.intensityPercent === b.intensityPercent &&
    a.particles === b.particles &&
    a.cameraShake === b.cameraShake &&
    a.decorativeCreatures === b.decorativeCreatures &&
    a.environmental === b.environmental &&
    a.reducedMotion === b.reducedMotion
  );
}

/**
 * Field-wise, for the reason `sameMotion` is: main rebuilds `CompanionState`
 * on every broadcast, so a reference check would report a change on every
 * hotkey press and wake the renderer — and the ambience controller with it.
 */
function sameCategories(
  a: Readonly<Record<string, number>> | undefined,
  b: Readonly<Record<string, number>> | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

export function createCompanionController(bridge: CompanionBridge): CompanionController {
  const listeners = new Set<() => void>();
  let state: CompanionState = {
    opacityPercent: OPACITY_DEFAULT_PERCENT,
    workMode: false,
    clickThrough: false,
    hidden: false,
    volumePercent: VOLUME_DEFAULT_PERCENT,
    categoryPercent: DEFAULT_CATEGORY_PERCENT,
    muted: AUDIO_MUTED_BY_DEFAULT,
    motion: DEFAULT_MOTION_SETTINGS,
  };

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const setLocal = (next: CompanionState): void => {
    if (
      state.opacityPercent === next.opacityPercent &&
      state.workMode === next.workMode &&
      state.clickThrough === next.clickThrough &&
      state.hidden === next.hidden &&
      state.volumePercent === next.volumePercent &&
      state.muted === next.muted &&
      sameCategories(state.categoryPercent, next.categoryPercent) &&
      sameMotion(state.motion, next.motion)
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
    volumePercent: () => state.volumePercent,
    categoryPercent: (category) =>
      state.categoryPercent?.[category] ?? DEFAULT_CATEGORY_PERCENT[category] ?? 100,

    motion: () => effectiveMotion(state.motion, { workMode: state.workMode }),

    // Defaulted rather than asserted. The same reason `sameMotion` tolerates
    // absence: this state crosses a process boundary, and a settings panel
    // that throws on a malformed payload is worse than one showing defaults.
    storedMotion: () => state.motion ?? DEFAULT_MOTION_SETTINGS,

    setMotion(patch) {
      // Optimistic, exactly like `setOpacityPercent`: the control has to move
      // under the finger, not after an IPC round trip. Main re-sanitizes and
      // broadcasts, and `setLocal` reconciles if it disagreed.
      setLocal({ ...state, motion: { ...state.motion, ...patch } });
      void bridge.setMotion(patch).then(setLocal);
    },
    muted: () => state.muted,

    setCategoryPercent(category, value) {
      // Optimistic like every other dial here, and notified so the ambience
      // controller re-evaluates on the next update rather than at the next
      // broadcast — turning ambience on should be audible immediately.
      setLocal({
        ...state,
        categoryPercent: { ...(state.categoryPercent ?? {}), [category]: value },
      });
      void bridge.setCategoryPercent(category, value).then(setLocal);
    },

    setVolumePercent(value) {
      // Optimistic, exactly like opacity: the dial answers instantly and the
      // NEXT sound is already at the new level, because the bus reads this
      // state at play time rather than caching it.
      setLocal({ ...state, volumePercent: value });
      void bridge.setVolume(value);
    },

    toggleMuted() {
      setLocal({ ...state, muted: !state.muted });
      void bridge.toggleMuted();
    },

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
