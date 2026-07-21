/**
 * Fixed-timestep accumulator loop. ADR-007 §3.
 *
 * The accumulator is deliberately split from the `requestAnimationFrame`
 * driver: `createAccumulator` is pure and clock-free, so the tick-timing
 * guarantees (exactly TICKS_PER_SECOND per second, spiral-of-death guard) are
 * unit-testable without a DOM or a real clock.
 */

import { MAX_CATCHUP_TICKS, TICK_MS } from '../../shared/constants';

export interface Accumulator {
  /**
   * Feeds elapsed wall-clock time and returns how many fixed ticks to run.
   *
   * Never returns more than `MAX_CATCHUP_TICKS`. Time beyond that cap is
   * DISCARDED, not banked — a gap that large is a stall, and banking it would
   * make the next frame run an ever-growing backlog (the spiral of death).
   * Long gaps are handled by offline catch-up instead (SAVE_FORMAT.md §6).
   */
  advance(deltaMs: number): number;

  /**
   * Fraction of the way into the next tick, in [0, 1).
   *
   * Passed to the renderer for interpolation (ADR-007 §5). Interpolated values
   * are a rendering concern only and never re-enter the simulation.
   */
  alpha(): number;

  /** Remaining unconsumed time, in ms. Exposed for tests and diagnostics. */
  pending(): number;
}

export function createAccumulator(): Accumulator {
  let accumulated = 0;

  return {
    advance(deltaMs: number): number {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) return 0;

      // Clamp BEFORE accumulating so a huge gap cannot inflate the backlog.
      accumulated += Math.min(deltaMs, MAX_CATCHUP_TICKS * TICK_MS);

      let ticks = 0;
      while (accumulated >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
        accumulated -= TICK_MS;
        ticks += 1;
      }

      // Anything still queued past the cap is a stall, not a debt to repay.
      if (accumulated >= TICK_MS) accumulated = 0;

      return ticks;
    },

    alpha(): number {
      return accumulated / TICK_MS;
    },

    pending(): number {
      return accumulated;
    },
  };
}
