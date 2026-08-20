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

  /**
   * Dial values this renderer has ASKED main for and not yet heard back about.
   * Phase-54.
   *
   * ## The defect this exists for
   *
   * Every dial is optimistic: the control moves under the finger, main
   * sanitises, and the answer comes back as a `companion:state-changed`
   * broadcast. Those broadcasts are asynchronous, so **press N's echo can
   * arrive after press N+1 has already been applied** — and `setLocal` only
   * asked whether a value DIFFERED, never whether it was older. It moved the
   * state backwards.
   *
   * On a controlled `<input type="range">` that is visible: React re-renders
   * with the stale value, the DOM input jumps back, and the next arrow key
   * increments from the wrong number. Recorded on the running app, six presses
   * produced `30 → 35 → 40 → (back to 35) → 40 → 45 → 50 → 55` and the dial
   * finished a step short. A player holding an arrow key, or dragging the
   * slider, sees it stick and jump backwards.
   *
   * ## The rule
   *
   * An incoming value is ignored ONLY when it is a stale echo — a value this
   * renderer sent earlier and has since superseded. Anything else is
   * authoritative and applied:
   *
   * - the value we last sent → our request landed; stop guarding
   * - a value we sent before that → an old echo; keep what we have
   * - a value we never sent → main overruled us (a clamp) or somebody else
   *   moved it (a global hotkey, the tray); take it
   *
   * That last case is why this cannot simply drop broadcasts while a write is
   * in flight: opacity also moves by hotkey, and a panel that ignored those
   * would show a dial the window no longer has.
   */
  const pending = new Map<string, number[]>();

  const remember = (field: string, value: number): void => {
    pending.set(field, [...(pending.get(field) ?? []), value]);
  };

  /** Whether `incoming` should overwrite what this renderer already knows. */
  const accepts = (field: string, incoming: number | undefined): boolean => {
    const sent = pending.get(field);
    if (sent === undefined || sent.length === 0 || incoming === undefined) return true;
    if (incoming === sent.at(-1)) {
      pending.delete(field);
      return true;
    }
    // A value we asked for earlier and have since moved past: stale.
    if (sent.includes(incoming)) return false;
    // Never asked for it, so somebody else decided it. Theirs wins.
    pending.delete(field);
    return true;
  };

  /**
   * Applies state that came FROM HERE. Never guarded: this renderer is the
   * author, so there is nothing to be stale relative to.
   *
   * Split from `fromMain` because the guard has to know which side a value
   * came from. The first version of it did not, applied to both, and every
   * optimistic write consumed its own marker the moment it was made.
   */
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

  /**
   * Applies state that came from MAIN — a broadcast, or the answer to a
   * request. Guarded: see `pending` for why an older echo must not overwrite
   * a newer local value.
   */
  const fromMain = (next: CompanionState): void => {
    setLocal({
      ...next,
      opacityPercent: accepts('opacity', next.opacityPercent)
        ? next.opacityPercent
        : state.opacityPercent,
      volumePercent: accepts('volume', next.volumePercent)
        ? next.volumePercent
        : state.volumePercent,
    });
  };

  // Hydrate from main, and stay in sync with externally-driven changes — the
  // global hotkeys (01.8b/c) flip state without the UI's involvement.
  void bridge.getState().then(fromMain);
  bridge.onStateChanged(fromMain);

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
      void bridge.setMotion(patch).then(fromMain);
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
      void bridge.setCategoryPercent(category, value).then(fromMain);
    },

    setVolumePercent(value) {
      // Optimistic, exactly like opacity: the dial answers instantly and the
      // NEXT sound is already at the new level, because the bus reads this
      // state at play time rather than caching it.
      //
      // And guarded exactly like opacity, because it is the same control with
      // the same race: a dragged volume slider sends a burst of values whose
      // echoes come back out of step.
      remember('volume', value);
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
      // Remembered first, so the echo of THIS value is recognised when it
      // returns and an older one cannot drag the dial back (see `pending`).
      remember('opacity', value);
      setLocal({ ...state, opacityPercent: value });
      void bridge.setOpacity(value);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
