/**
 * The frame loop, and the control surface devtools drives it through.
 *
 * Owns the accumulator, the simulation step, the snapshot pump, and the FPS/UPS
 * counters. Implements `SimulationControl` (declared in devtools) so pause,
 * resume, and step work without devtools reaching into the loop's internals.
 *
 * Pause exists for development only. There is no pause in the shipped product —
 * an idle game you can pause is a contradiction (VISION.md §2.2).
 */

import type { SimulationControl } from '../../shared/simulation-control';
import { stepSimulationBy } from '../../sim/tick';
import type { World } from '../../sim/world/world';

import { createAccumulator } from './loop';
import type { SnapshotStore } from './snapshot-store';

/** Window over which FPS and UPS are averaged, in milliseconds. */
const RATE_WINDOW_MS = 500;

export interface GameLoop extends SimulationControl {
  start(): void;
  stop(): void;
  /**
   * Multiplies how much simulated time each real second produces.
   *
   * Scaling changes the NUMBER OF TICKS per frame, never the tick duration.
   * That distinction is the whole design: `TICK_MS` is frozen (ADR-007 §7), so
   * a scaled run visits exactly the same tick states as an unscaled one, just
   * sooner. Determinism, save `lastTick` semantics, and content authored in
   * ticks all survive.
   *
   * A scale that stretched TICK_MS would make tick counts stop mapping to game
   * time and silently corrupt every duration in the game.
   *
   * Development and testing only; there is no time control in the product.
   */
  setTimeScale(scale: number): void;
  timeScale(): number;
}

export interface GameLoopOptions {
  readonly world: World;
  readonly store: SnapshotStore;
  /**
   * Called once per frame after the simulation advances.
   *
   * Returns true if the frame actually DREW. The loop counts drawn frames
   * rather than scheduled ones, so the reported FPS reflects real work — a
   * static world correctly reads 0 rather than 60 (ADR-001 §1).
   */
  readonly onFrame?: (alpha: number) => boolean | void;
  /** Injected for tests; defaults to requestAnimationFrame. */
  readonly schedule?: (callback: (now: number) => void) => number;
  readonly cancel?: (handle: number) => void;
  readonly now?: () => number;
}

export function createGameLoop(options: GameLoopOptions): GameLoop {
  const { world, store, onFrame } = options;
  const schedule = options.schedule ?? ((cb) => requestAnimationFrame(cb));
  const cancel =
    options.cancel ??
    ((handle) => {
      cancelAnimationFrame(handle);
    });
  const now = options.now ?? ((): number => performance.now());

  const accumulator = createAccumulator();

  let handle: number | null = null;
  let previous = now();
  let paused = false;
  let scale = 1;

  let frameTimeMs = 0;
  let framesInWindow = 0;
  let ticksInWindow = 0;
  let windowStart = previous;
  let fps = 0;
  let ups = 0;

  const frame = (timestamp: number): void => {
    const delta = timestamp - previous;
    previous = timestamp;
    frameTimeMs = delta;

    // While paused the accumulator is still drained, so unpausing does not
    // replay the entire paused duration as a burst of ticks.
    // Scale the INPUT to the accumulator. The accumulator's own cap still
    // applies, so a large scale cannot spiral (ADR-007 §3).
    const ticks = accumulator.advance(delta * scale);
    if (!paused && ticks > 0) {
      stepSimulationBy(world, ticks);
      ticksInWindow += ticks;
    }

    store.pump(timestamp);

    const drew = onFrame?.(accumulator.alpha());
    if (drew !== false) framesInWindow += 1;

    const windowElapsed = timestamp - windowStart;
    if (windowElapsed >= RATE_WINDOW_MS) {
      fps = (framesInWindow * 1000) / windowElapsed;
      ups = (ticksInWindow * 1000) / windowElapsed;
      framesInWindow = 0;
      ticksInWindow = 0;
      windowStart = timestamp;
    }

    handle = schedule(frame);
  };

  return {
    start() {
      if (handle !== null) return;
      previous = now();
      windowStart = previous;
      handle = schedule(frame);
    },

    stop() {
      if (handle === null) return;
      cancel(handle);
      handle = null;
    },

    setTimeScale(next) {
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error(`setTimeScale: expected a positive finite number, got ${String(next)}`);
      }
      scale = next;
    },

    timeScale: () => scale,

    isPaused: () => paused,
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },

    step(count) {
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(`step: expected a positive integer, got ${String(count)}`);
      }
      stepSimulationBy(world, count);
      ticksInWindow += count;
    },

    tick: () => world.tick,
    ups: () => ups,
    fps: () => fps,
    frameTimeMs: () => frameTimeMs,
  };
}
