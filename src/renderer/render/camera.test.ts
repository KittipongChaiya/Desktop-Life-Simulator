/**
 * Camera tests. Phase-02 acceptance criteria 3 and 4; phase-04c vertical
 * centring correction.
 */

import { describe, expect, it } from 'vitest';

import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';

import {
  clampCameraX,
  clampCameraY,
  clampZoom,
  createCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  panCamera,
  screenToTile,
  tileToScreen,
  visibleTileRange,
  worldToScreen,
  zoomCamera,
} from './camera';

const limits = {
  viewportWidth: 1920,
  viewportHeight: 220,
  worldWidthTiles: WORLD_WIDTH,
  worldHeightTiles: WORLD_HEIGHT,
  resolution: 1,
};
const hiDpi = { ...limits, resolution: 2 };

/** Centre of the 8×8 starting plot (world-centre), in world pixels. */
const PLOT_CENTRE = { x: 32 * TILE_SIZE, y: 32 * TILE_SIZE };

describe('clamping (criterion 3)', () => {
  it('never pans left of the world', () => {
    expect(clampCameraX(-500, limits, 1)).toBe(0);
  });

  it('never pans past the right edge', () => {
    const worldWidth = WORLD_WIDTH * TILE_SIZE;
    expect(clampCameraX(99_999, limits, 1)).toBe(worldWidth - limits.viewportWidth);
  });

  it('pins to zero when the world is narrower than the viewport', () => {
    // Would otherwise go negative and drift content away from the edge.
    const narrow = { ...limits, worldWidthTiles: 4 };
    expect(clampCameraX(50, narrow, 1)).toBe(0);
  });

  it('pans within bounds', () => {
    const camera = createCamera(limits);
    expect(panCamera(camera, 64, limits).x).toBe(64);
  });

  it('returns the same object when a pan changes nothing', () => {
    // Referential stability stops the render layer marking dirty on a no-op.
    const camera = createCamera(limits);
    expect(panCamera(camera, -10, limits)).toBe(camera);
  });
});

describe('vertical clamping (phase-04c)', () => {
  it('never scrolls above the world', () => {
    expect(clampCameraY(-500, limits, 1)).toBe(0);
  });

  it('never scrolls past the bottom edge', () => {
    const worldHeight = WORLD_HEIGHT * TILE_SIZE;
    expect(clampCameraY(99_999, limits, 1)).toBe(worldHeight - limits.viewportHeight);
  });

  it('pins to zero when the world is shorter than the viewport', () => {
    const short = { ...limits, worldHeightTiles: 4 };
    expect(clampCameraY(50, short, 1)).toBe(0);
  });

  it('snaps to whole device pixels', () => {
    expect(clampCameraY(10.6, limits, 1)).toBe(11);
    expect(clampCameraY(10.26, hiDpi, 1)).toBe(10.5);
  });
});

describe('pixel snapping (criterion 4)', () => {
  it('snaps to whole pixels at 1x', () => {
    expect(clampCameraX(10.4, limits, 1)).toBe(10);
    expect(clampCameraX(10.6, limits, 1)).toBe(11);
  });

  it('snaps to whole DEVICE pixels at 2x DPI', () => {
    // Half-logical-pixel steps ARE whole device pixels; finer ones are not.
    expect(clampCameraX(10.5, hiDpi, 1)).toBe(10.5);
    expect(clampCameraX(10.26, hiDpi, 1)).toBe(10.5);
    expect(clampCameraX(10.1, hiDpi, 1)).toBe(10);
  });

  it('leaves no fractional device offset after any pan', () => {
    // A fractional device offset is what makes pixel art shimmer.
    let camera = createCamera(hiDpi);
    for (const delta of [0.3, 1.7, -0.9, 12.34, -5.55]) {
      camera = panCamera(camera, delta, hiDpi);
      expect(Number.isInteger(camera.x * hiDpi.resolution)).toBe(true);
    }
  });
});

describe('initial focus on the owned plot (phase-04c)', () => {
  it('with no focus, starts at the top-left (unchanged default)', () => {
    const camera = createCamera(limits);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
  });

  it('centres the viewport on the focus point', () => {
    const camera = createCamera(limits, PLOT_CENTRE);
    const screen = worldToScreen(camera, PLOT_CENTRE.x, PLOT_CENTRE.y);
    // The plot centre lands at the centre of the viewport.
    expect(screen.x).toBeCloseTo(limits.viewportWidth / 2, 0);
    expect(screen.y).toBeCloseTo(limits.viewportHeight / 2, 0);
  });

  it('brings the plot and a worker standing on it into view', () => {
    const camera = createCamera(limits, PLOT_CENTRE);
    // A worker spawns at the plot centre (worker-commands.ts). It must be on-screen.
    const worker = worldToScreen(camera, PLOT_CENTRE.x, PLOT_CENTRE.y);
    expect(worker.y).toBeGreaterThanOrEqual(0);
    expect(worker.y).toBeLessThanOrEqual(limits.viewportHeight);
    expect(worker.x).toBeGreaterThanOrEqual(0);
    expect(worker.x).toBeLessThanOrEqual(limits.viewportWidth);
  });
});

describe('zoom', () => {
  it('clamps to the integer range', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(2.4)).toBe(2);
  });

  it('never produces a fractional zoom', () => {
    // Non-integer zoom resamples pixel art (ASSETS.md §8).
    for (const requested of [1.1, 1.5, 2.7, 2.99]) {
      expect(Number.isInteger(zoomCamera(createCamera(limits), requested, limits).zoom)).toBe(true);
    }
  });

  it('keeps the viewport centre fixed across a zoom change (both axes)', () => {
    const camera = panCamera(createCamera(limits, PLOT_CENTRE), 200, limits);
    const centreBefore = {
      x: (camera.x + limits.viewportWidth / 2) / camera.zoom,
      y: (camera.y + limits.viewportHeight / 2) / camera.zoom,
    };

    const zoomed = zoomCamera(camera, 2, limits);
    const centreAfter = {
      x: (zoomed.x + limits.viewportWidth / 2) / zoomed.zoom,
      y: (zoomed.y + limits.viewportHeight / 2) / zoomed.zoom,
    };

    expect(Math.abs(centreAfter.x - centreBefore.x)).toBeLessThan(1);
    expect(Math.abs(centreAfter.y - centreBefore.y)).toBeLessThan(1);
  });

  it('returns the same object when zoom does not change', () => {
    const camera = createCamera(limits);
    expect(zoomCamera(camera, MIN_ZOOM, limits)).toBe(camera);
  });
});

describe('coordinate conversion', () => {
  it('round-trips screen and tile coordinates on both axes', () => {
    const camera = panCamera(createCamera(limits, PLOT_CENTRE), 96, limits);

    for (const tileX of [0, 5, 31, 63]) {
      for (const tileY of [0, 28, 32, 35, 63]) {
        const screen = worldToScreen(camera, tileX * TILE_SIZE, tileY * TILE_SIZE);
        const tile = screenToTile(camera, screen.x, screen.y);
        expect(Math.floor(tile.x)).toBe(tileX);
        expect(Math.floor(tile.y)).toBe(tileY);
      }
    }
  });

  it('tileToScreen is the inverse of screenToTile', () => {
    const camera = createCamera(limits, PLOT_CENTRE);
    for (const [tx, ty] of [
      [10, 30],
      [32, 32],
      [40, 35],
    ] as const) {
      const screen = tileToScreen(camera, tx, ty);
      const back = screenToTile(camera, screen.x, screen.y);
      expect(Math.floor(back.x)).toBe(tx);
      expect(Math.floor(back.y)).toBe(ty);
    }
  });

  it('accounts for zoom', () => {
    const camera = zoomCamera(createCamera(limits), 2, limits);
    const screen = worldToScreen(camera, TILE_SIZE, 0);
    expect(Math.floor(screenToTile(camera, screen.x, 0).x)).toBe(1);
  });

  it('maps a click at the plot centre back to the plot centre tile', () => {
    const camera = createCamera(limits, PLOT_CENTRE);
    const centre = screenToTile(camera, limits.viewportWidth / 2, limits.viewportHeight / 2);
    expect(Math.floor(centre.x)).toBe(32);
    expect(Math.floor(centre.y)).toBe(32);
  });
});

describe('pan does not move vertically (phase-04c)', () => {
  it('leaves y unchanged when panning horizontally', () => {
    const camera = createCamera(limits, PLOT_CENTRE);
    const panned = panCamera(camera, 128, limits);
    expect(panned.y).toBe(camera.y);
    expect(panned.x).not.toBe(camera.x);
  });
});

describe('visible range (culling)', () => {
  it('covers the viewport', () => {
    const range = visibleTileRange(createCamera(limits), limits);
    expect(range.first).toBe(0);
    expect(range.last).toBe(Math.min(WORLD_WIDTH - 1, Math.floor(1920 / TILE_SIZE)));
  });

  it('never exceeds world bounds', () => {
    const camera = panCamera(createCamera(limits), 99_999, limits);
    const range = visibleTileRange(camera, limits);
    expect(range.last).toBeLessThanOrEqual(WORLD_WIDTH - 1);
    expect(range.first).toBeGreaterThanOrEqual(0);
  });

  it('shows fewer tiles when zoomed in', () => {
    const wide = visibleTileRange(createCamera(limits), limits);
    const zoomed = visibleTileRange(zoomCamera(createCamera(limits), 3, limits), limits);
    expect(zoomed.last - zoomed.first).toBeLessThan(wide.last - wide.first);
  });
});
