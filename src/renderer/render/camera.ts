/**
 * Camera. Phase-02.
 *
 * Pure maths, no Pixi — so clamping, pixel snapping, and coordinate conversion
 * are testable without a GPU.
 *
 * PIXEL SNAPPING IS NOT COSMETIC. Sub-pixel camera offsets are the most common
 * cause of shimmering pixel art (ASSETS.md §8): texels land between device
 * pixels and the sampler picks differently each frame. The camera therefore
 * snaps to whole DEVICE pixels — dividing by resolution before snapping would
 * still leave a fractional device offset on a high-DPI display.
 *
 * Horizontal panning only. The overlay is 220 logical px tall and the world
 * fits vertically (phase-02 Out of Scope).
 */

import { TILE_SIZE } from '../../shared/constants';

export interface CameraState {
  /** Left edge of the view, in world pixels. Always whole device pixels. */
  readonly x: number;
  /** Integer zoom. Non-integer zoom resamples pixel art (ASSETS.md §8). */
  readonly zoom: number;
}

export interface CameraLimits {
  /** Viewport width in logical (CSS) pixels. */
  readonly viewportWidth: number;
  /** World width in tiles. */
  readonly worldWidthTiles: number;
  /** Device pixel ratio. */
  readonly resolution: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom)));
}

/** Total world width in world pixels at a given zoom. */
export function worldPixelWidth(worldWidthTiles: number, zoom: number): number {
  return worldWidthTiles * TILE_SIZE * zoom;
}

/**
 * Clamps and snaps a camera x.
 *
 * When the world is narrower than the viewport the camera pins to 0 rather than
 * going negative, so content stays left-aligned instead of drifting.
 */
export function clampCameraX(x: number, limits: CameraLimits, zoom: number): number {
  const worldWidth = worldPixelWidth(limits.worldWidthTiles, zoom);
  const maxX = Math.max(0, worldWidth - limits.viewportWidth);
  const clamped = Math.min(maxX, Math.max(0, x));

  // Snap to whole DEVICE pixels, not logical pixels.
  return Math.round(clamped * limits.resolution) / limits.resolution;
}

export function createCamera(limits: CameraLimits): CameraState {
  return { x: clampCameraX(0, limits, MIN_ZOOM), zoom: MIN_ZOOM };
}

export function panCamera(state: CameraState, deltaX: number, limits: CameraLimits): CameraState {
  const x = clampCameraX(state.x + deltaX, limits, state.zoom);
  return x === state.x ? state : { ...state, x };
}

export function zoomCamera(
  state: CameraState,
  nextZoom: number,
  limits: CameraLimits,
): CameraState {
  const zoom = clampZoom(nextZoom);
  if (zoom === state.zoom) return state;

  // Keep the viewport centre fixed across a zoom change; otherwise zooming
  // appears to fling the world sideways.
  const centreWorld = (state.x + limits.viewportWidth / 2) / state.zoom;
  const x = clampCameraX(centreWorld * zoom - limits.viewportWidth / 2, limits, zoom);
  return { x, zoom };
}

/** World pixel position -> screen pixel position. */
export function worldToScreen(
  state: CameraState,
  worldX: number,
  worldY: number,
): {
  x: number;
  y: number;
} {
  return { x: worldX * state.zoom - state.x, y: worldY * state.zoom };
}

/** Screen pixel position -> tile coordinate. Returns fractional tiles. */
export function screenToTile(
  state: CameraState,
  screenX: number,
  screenY: number,
): {
  x: number;
  y: number;
} {
  return {
    x: (screenX + state.x) / (TILE_SIZE * state.zoom),
    y: screenY / (TILE_SIZE * state.zoom),
  };
}

/** Inclusive tile-column range currently visible. Used for culling. */
export function visibleTileRange(
  state: CameraState,
  limits: CameraLimits,
): { first: number; last: number } {
  const tilePixels = TILE_SIZE * state.zoom;
  const first = Math.max(0, Math.floor(state.x / tilePixels));
  const last = Math.min(
    limits.worldWidthTiles - 1,
    Math.floor((state.x + limits.viewportWidth) / tilePixels),
  );
  return { first, last: Math.max(first, last) };
}
