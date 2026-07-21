/**
 * The control surface devtools needs over the frame loop.
 *
 * The INTERFACE lives here; the IMPLEMENTATION lives in the renderer bootstrap,
 * which owns the loop. That direction matters: `bootstrap` may import
 * `devtools`, but nothing in the game may import devtools (deliverable 8). If
 * this interface lived in bootstrap, devtools would depend on it and the
 * dependency would run the wrong way.
 *
 * Pausing is a development capability, not a game feature. There is no pause in
 * the shipped product — an idle game that can be paused is a contradiction, and
 * `VISION.md` §2.2 makes running-while-away the entire point.
 */

export interface SimulationControl {
  isPaused(): boolean;
  pause(): void;
  resume(): void;
  /** Advances exactly `count` ticks, even while paused. */
  step(count: number): void;
  /** Ticks elapsed since world creation. */
  tick(): number;
  /** Measured simulation updates per second. */
  ups(): number;
  /** Measured frames per second. */
  fps(): number;
  /** Most recent frame duration, in milliseconds. */
  frameTimeMs(): number;
}
