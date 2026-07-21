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
}
