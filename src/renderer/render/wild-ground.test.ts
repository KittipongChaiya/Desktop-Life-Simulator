/**
 * The wilderness fringe. Phase-27.
 *
 * One property carries this module and it is the one a straight line would
 * break: every tile the SIMULATION treats as wilds must look like wilderness.
 * The fringe may reach inward past the gameplay boundary — that only means a
 * patch of rough ground with nothing on it, which needs no explanation — but it
 * may never fall short of it, because a node standing on mown farm grass says
 * the ground is workable when it is not.
 */

import { describe, expect, it } from 'vitest';

import { WILDS_MIN_X, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';

import { isWildGround, WILD_FRINGE_MAX, wildEdgeX } from './wild-ground';

describe('the wilderness fringe', () => {
  it('never starts east of the gameplay boundary', () => {
    // THE LOAD-BEARING ONE. Wild ground is a superset of the node region, so
    // every gatherable tile is drawn as gatherable ground.
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      expect(wildEdgeX(y)).toBeLessThanOrEqual(WILDS_MIN_X);
    }
  });

  it('reaches inward by a few tiles at most', () => {
    // The fringe is a ragged edge, not a second region. Left unbounded it
    // would eventually paint the town — and the town is somewhere you visit.
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      expect(wildEdgeX(y)).toBeGreaterThanOrEqual(WILDS_MIN_X - WILD_FRINGE_MAX);
    }
  });

  it('is actually ragged, not a straight line wearing a jitter', () => {
    const edges = new Set<number>();
    for (let y = 0; y < WORLD_HEIGHT; y += 1) edges.add(wildEdgeX(y));

    // A hash that collapsed to one value would satisfy every bound above while
    // drawing the ruler-straight seam this module exists to avoid.
    expect(edges.size).toBeGreaterThan(2);
  });

  it('gives the same edge on every launch', () => {
    // Derived from the row alone (ADR-017 §5): no seed, no RNG, no position.
    // The regions are fixed world geometry, so their fringe is too.
    const first = Array.from({ length: WORLD_HEIGHT }, (_, y) => wildEdgeX(y));
    const second = Array.from({ length: WORLD_HEIGHT }, (_, y) => wildEdgeX(y));

    expect(second).toEqual(first);
  });

  it('calls every tile at or past the boundary wild', () => {
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
        expect(isWildGround(toIndexUnchecked(x, y))).toBe(true);
      }
    }
  });

  it('leaves the farm alone', () => {
    // Ownership never leaves `x < FARM_SIZE` and the fringe is nowhere near it,
    // so no amount of raggedness can reach the plot.
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      expect(isWildGround(toIndexUnchecked(0, y))).toBe(false);
      expect(isWildGround(toIndexUnchecked(63, y))).toBe(false);
    }
  });
});
