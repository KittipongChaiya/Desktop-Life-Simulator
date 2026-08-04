/**
 * The control surface for the frame loop.
 *
 * Lives in `shared` because BOTH sides need it and neither may depend on the
 * other: the renderer bootstrap implements it, devtools consumes it, and
 * nothing in the game may import devtools (phase-01.5 deliverable 8).
 *
 * It was originally declared in `src/devtools/`. That gave `game-loop.ts` — game
 * code — a source dependency on the debug layer. Type-only, so erased at build
 * time and invisible at runtime, but still a compile-time edge pointing the
 * wrong way. Found by the phase-01.6 architecture review.
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
  /**
   * Multiplies how much simulated time each real second produces.
   *
   * Scaling changes the NUMBER OF TICKS per frame, never the tick duration.
   * That distinction is the whole design: `TICK_MS` is frozen (ADR-007 §7), so
   * a scaled run visits exactly the same tick states as an unscaled one, just
   * sooner. Determinism, save `lastTick` semantics, and content authored in
   * ticks all survive. A scale that stretched `TICK_MS` would make tick counts
   * stop mapping to game time and silently corrupt every duration in the game.
   *
   * Declared HERE from 07.8g rather than on `GameLoop` alone. The loop has had
   * it since phase-01; devtools could not reach it, because this interface —
   * the development control surface — declared everything but. Pause and step
   * are equally dev-only and were always here; the scale was the odd one out.
   *
   * Throws on a non-positive or non-finite scale.
   */
  setTimeScale(scale: number): void;
  timeScale(): number;
}
