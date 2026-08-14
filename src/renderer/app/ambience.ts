/**
 * When an ambient bed may sound. Phase-13d — ADR-023 §5.
 *
 * ADR-016 §4 deferred continuous audio and asked for a measurement before it
 * shipped. ADR-023 §5 is the amendment, and it permits ambience under five
 * conditions — four adopted verbatim from ADR-017 §2, because a bed that never
 * ends is the audible form of exactly the problem ambient MOTION had.
 *
 * This is those conditions, as one function of its arguments. It has no
 * timers, no listeners and no device: the caller reports the world and asks,
 * which is what keeps it testable in Node and impossible to leak — the same
 * shape `ambient-presence.ts` chose for the motion half.
 *
 * ## Silence is the resting state
 *
 * ADR-016 §4's principle is unchanged for effects: every sound that ships is
 * triggered by something that already happened. Ambience is the single
 * declared exception, it is opt-in, and it surrenders when the player is not
 * there — so `triggered` is a condition here rather than an assumption. Rain
 * audio without rain is what ADR-016 calls unreachable code.
 *
 * The fifth condition is a **measured idle budget** — a number in
 * `docs/perf/` and a line in `PERFORMANCE.md`, not a branch — so it does not
 * appear below. It is what makes §5 an amendment rather than a reversal.
 */

import type { Sound } from './sounds';

/** Everything the five conditions need, read at the moment the question is asked. */
export interface AmbienceConditions {
  /**
   * Whether anything in the world is producing this bed right now — rain
   * falling, for the first one (ADR-022's weather, which is why phase 13
   * follows phase 12).
   */
  readonly triggered: boolean;
  readonly muted: boolean;
  /** Silences everything unconditionally, beds included (ADR-016 §2). */
  readonly workMode: boolean;
  /** Collapsed tears the renderer down; ambience may not keep it warm. */
  readonly collapsed: boolean;
  /** From `ambient-presence.ts` — the same signal ambient motion surrenders on. */
  readonly present: boolean;
  /** The master dial, 0–100. */
  readonly volumePercent: number;
  /** The ambient category, 0–100. Zero by default, which is condition 1. */
  readonly ambientPercent: number;
}

/** Turns a 0–100 dial into a 0–1 multiplier, clamped at both ends. */
function level(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(percent, 100) / 100;
}

/**
 * The gain an ambient bed may sound at right now — `0` meaning silent.
 *
 * Every condition is independently sufficient to silence it, which is the
 * property worth having: a bed that survived any single lapse would be an
 * always-on cost wearing an opt-in label.
 *
 * Ducking is deliberately NOT applied here. ADR-023 §2 declares that ambient
 * ducks under `ui` and `world`, and that table lives with the bus because the
 * mix is the bus's job — a bed routed through it inherits the rule rather than
 * reimplementing it.
 */
export function ambienceGain(conditions: AmbienceConditions): number {
  if (!conditions.triggered) return 0;
  if (conditions.muted || conditions.workMode) return 0;
  if (conditions.collapsed || !conditions.present) return 0;

  // Clamped rather than trusted. These crossed a process boundary from main,
  // which sanitises them — but this is presentation code, and amplifying past
  // unity is the one arithmetic mistake here a player would hear immediately.
  return level(conditions.volumePercent) * level(conditions.ambientPercent);
}

/**
 * The device half: something that can hold a continuous sound.
 *
 * Separate from `AudioPorts` because a bed is a different shape from an
 * effect. `play` is fire-and-forget and the device keeps no reference; a bed
 * has to be adjustable and stoppable, so exactly one node is held and
 * `set` is idempotent — the caller reports the gain it wants and does not
 * track whether anything is running.
 */
export interface AmbienceDevice {
  /**
   * Sets the bed's gain, starting it if it is not already sounding.
   *
   * A gain of zero STOPS it rather than playing silence, which is the whole
   * point: ADR-023 §5 condition 4 surrenders the audio thread when the player
   * is not there, and a silent-but-running source surrenders nothing.
   *
   * Never throws. A missing device is not a game concern.
   */
  set(bed: Sound, gain: number): void;
}
