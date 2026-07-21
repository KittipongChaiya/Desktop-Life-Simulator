/**
 * Camera tests. Phase-02 acceptance criteria 3 and 4.
 */

import { describe, expect, it } from 'vitest';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';

import {
  clampCameraX,
  clampZoom,
  createCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  panCamera,
  screenToTile,
  visibleTileRange,
  worldToScreen,
  zoomCamera,
} from './camera';

const limits = { viewportWidth: 1920, worldWidthTiles: WORLD_WIDTH, resolution: 1 };
const hiDpi = { ...limits, resolution: 2 };

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

  it('keeps the viewport centre fixed across a zoom change', () => {
    const camera = panCamera(createCamera(limits), 400, limits);
    const centreBefore = (camera.x + limits.viewportWidth / 2) / camera.zoom;

    const zoomed = zoomCamera(camera, 2, limits);
    const centreAfter = (zoomed.x + limits.viewportWidth / 2) / zoomed.zoom;

    expect(Math.abs(centreAfter - centreBefore)).toBeLessThan(1);
  });

  it('returns the same object when zoom does not change', () => {
    const camera = createCamera(limits);
    expect(zoomCamera(camera, MIN_ZOOM, limits)).toBe(camera);
  });
});

describe('coordinate conversion', () => {
  it('round-trips screen and tile coordinates', () => {
    const camera = panCamera(createCamera(limits), 320, limits);

    for (const tileX of [0, 5, 31, 63]) {
      const screen = worldToScreen(camera, tileX * TILE_SIZE, 0);
      expect(Math.floor(screenToTile(camera, screen.x, 0).x)).toBe(tileX);
    }
  });

  it('accounts for zoom', () => {
    const camera = zoomCamera(createCamera(limits), 2, limits);
    const screen = worldToScreen(camera, TILE_SIZE, 0);
    expect(Math.floor(screenToTile(camera, screen.x, 0).x)).toBe(1);
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
