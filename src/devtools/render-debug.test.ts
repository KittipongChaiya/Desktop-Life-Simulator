/**
 * Render-debug toggles. Phase-07.8i and 07.8l.
 *
 * Small enough to look obviously right, and load-bearing enough to be wrong in
 * a way nobody would notice: the world view reads these once per frame, and
 * screenshot mode's whole contract — hide, do not forget — lives here.
 */

import { describe, expect, it } from 'vitest';

import { createRenderDebug } from './render-debug';

describe('render debug toggles', () => {
  it('starts with everything off', () => {
    const debug = createRenderDebug();

    expect(debug.chunks()).toBe(false);
    expect(debug.routes()).toBe(false);
    expect(debug.heatmap()).toBe(false);
    expect(debug.screenshot()).toBe(false);
  });

  it('toggles the chunk overlay', () => {
    const debug = createRenderDebug();
    debug.setChunks(true);

    expect(debug.chunks()).toBe(true);
  });

  it('cycles pathfinding through routes, then the heatmap, then off', () => {
    const debug = createRenderDebug();

    debug.cyclePathfinding();
    expect([debug.routes(), debug.heatmap()]).toEqual([true, false]);

    debug.cyclePathfinding();
    expect([debug.routes(), debug.heatmap()]).toEqual([true, true]);

    debug.cyclePathfinding();
    expect([debug.routes(), debug.heatmap()]).toEqual([false, false]);
  });
});

describe('screenshot mode', () => {
  it('suppresses every in-world overlay at once', () => {
    const debug = createRenderDebug();
    debug.setChunks(true);
    debug.cyclePathfinding();
    debug.cyclePathfinding();

    debug.setScreenshot(true);

    expect(debug.chunks()).toBe(false);
    expect(debug.routes()).toBe(false);
    expect(debug.heatmap()).toBe(false);
  });

  it('HIDES rather than forgets, so leaving it restores what was on', () => {
    // The property that separates a screenshot mode from a "close everything"
    // button: what you had open comes back.
    const debug = createRenderDebug();
    debug.setChunks(true);
    debug.cyclePathfinding();

    debug.setScreenshot(true);
    debug.setScreenshot(false);

    expect(debug.chunks()).toBe(true);
    expect(debug.routes()).toBe(true);
    expect(debug.heatmap()).toBe(false);
  });

  it('lets a toggle pressed during the mode take effect on leaving it', () => {
    const debug = createRenderDebug();
    debug.setScreenshot(true);

    debug.setChunks(true);
    expect(debug.chunks()).toBe(false);

    debug.setScreenshot(false);
    expect(debug.chunks()).toBe(true);
  });
});
