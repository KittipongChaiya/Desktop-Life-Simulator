/**
 * Camera. Phase-02; vertical centring added in phase-04c.
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
 * The camera is CENTRED on a focus point (the owned plot) at construction and
 * pans on BOTH axes thereafter. Centring is a pure geometric operation — the
 * camera is handed a world-pixel focus and knows nothing about plots or
 * gameplay (kept independent per ADR-003 §4).
 *
 * VERTICAL PAN, added in 07.9, replacing "the vertical position is fixed".
 * That rule rested on the plot fitting the overlay vertically, and it never
 * did: the starting plot is 8 tiles = 256px against a 220px overlay, and
 * `GAME_DESIGN.md` §6.3 expansion adds a ring per purchase — 8 → 10 → 12 tiles
 * is 256 → 320 → 384px. No fixed strip height can contain a plot that grows,
 * so "centre it once and pan sideways" could only ever have worked for a farm
 * nobody expanded. Reported from a live session as a farm whose lower rows were
 * unreachable, workers walking off the bottom of the view and vanishing, and
 * tiles under the status bar that would not take a click.
 *
 * `viewportTopInset` is the second half of that fix: the overlay's top strip is
 * covered by the opaque status bar, and a tile under it cannot be clicked at
 * all (`pointer-actions` refuses a press whose target is inside the HUD). The
 * camera therefore centres on the VISIBLE band rather than the whole viewport.
 * It is a geometric fact about the viewport — how much of it is obscured — not
 * knowledge of what is doing the obscuring, so ADR-003 §4 still holds.
 */

import { TILE_SIZE } from '../../shared/constants';

export interface CameraState {
  /** Left edge of the view, in world pixels. Always whole device pixels. */
  readonly x: number;
  /** Top edge of the view, in world pixels. Always whole device pixels. */
  readonly y: number;
  /** Integer zoom. Non-integer zoom resamples pixel art (ASSETS.md §8). */
  readonly zoom: number;
}

export interface CameraLimits {
  /** Viewport width in logical (CSS) pixels. */
  readonly viewportWidth: number;
  /** Viewport height in logical (CSS) pixels. */
  readonly viewportHeight: number;
  /** World width in tiles. */
  readonly worldWidthTiles: number;
  /** World height in tiles. */
  readonly worldHeightTiles: number;
  /** Device pixel ratio. */
  readonly resolution: number;
  /**
   * Logical pixels at the TOP of the viewport hidden behind opaque UI, so
   * framing can centre on what the player can actually see and click. Optional
   * and defaulting to 0: a caller with nothing covering the view says nothing.
   */
  readonly viewportTopInset?: number;
}

/** A world-pixel point to centre the view on. */
export interface Focus {
  readonly x: number;
  readonly y: number;
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

/** Total world height in world pixels at a given zoom. */
export function worldPixelHeight(worldHeightTiles: number, zoom: number): number {
  return worldHeightTiles * TILE_SIZE * zoom;
}

/** Snaps a value to a whole DEVICE pixel, not a logical one. */
function snapToDevicePixel(value: number, resolution: number): number {
  return Math.round(value * resolution) / resolution;
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
  return snapToDevicePixel(Math.min(maxX, Math.max(0, x)), limits.resolution);
}

/**
 * Clamps and snaps a camera y.
 *
 * Symmetric with `clampCameraX`: pins to 0 when the world is shorter than the
 * viewport, and snaps to whole device pixels so vertical offset never shimmers.
 */
export function clampCameraY(y: number, limits: CameraLimits, zoom: number): number {
  const worldHeight = worldPixelHeight(limits.worldHeightTiles, zoom);
  const maxY = Math.max(0, worldHeight - limits.viewportHeight);
  return snapToDevicePixel(Math.min(maxY, Math.max(0, y)), limits.resolution);
}

/**
 * Creates the camera.
 *
 * With no `focus` it starts at the top-left, the phase-02 default. With a focus
 * (world pixels) it centres the viewport on that point — how the app frames the
 * owned plot at startup so workers and crops are visible.
 */
/**
 * Where a focus point should sit in the viewport, vertically.
 *
 * The middle of the VISIBLE band — below whatever covers the top — rather than
 * the middle of the viewport, so framing does not bury rows under the HUD.
 * With no inset the two are the same value.
 */
function focusScreenY(limits: CameraLimits): number {
  return (limits.viewportHeight + (limits.viewportTopInset ?? 0)) / 2;
}

export function createCamera(limits: CameraLimits, focus?: Focus): CameraState {
  const zoom = MIN_ZOOM;
  if (focus === undefined) {
    return { x: clampCameraX(0, limits, zoom), y: clampCameraY(0, limits, zoom), zoom };
  }
  return {
    x: clampCameraX(focus.x * zoom - limits.viewportWidth / 2, limits, zoom),
    y: clampCameraY(focus.y * zoom - focusScreenY(limits), limits, zoom),
    zoom,
  };
}

/**
 * Pans on both axes. Returns the SAME state when neither axis moved, which is
 * what lets `doPan` skip the redraw and keeps render-on-demand asleep through a
 * drag that is already against a clamp.
 */
export function panCamera(
  state: CameraState,
  deltaX: number,
  deltaY: number,
  limits: CameraLimits,
): CameraState {
  const x = clampCameraX(state.x + deltaX, limits, state.zoom);
  const y = clampCameraY(state.y + deltaY, limits, state.zoom);
  return x === state.x && y === state.y ? state : { ...state, x, y };
}

export function zoomCamera(
  state: CameraState,
  nextZoom: number,
  limits: CameraLimits,
): CameraState {
  const zoom = clampZoom(nextZoom);
  if (zoom === state.zoom) return state;

  // Keep the view's centre fixed on BOTH axes across a zoom change; otherwise
  // zooming appears to fling the world sideways or vertically. Vertically that
  // means the centre of the VISIBLE band, the same point `createCamera` frames
  // — anchoring on the viewport's midpoint instead would slide the world out
  // from under the pointer by half the inset on every zoom step.
  const anchorY = focusScreenY(limits);
  const centreWorldX = (state.x + limits.viewportWidth / 2) / state.zoom;
  const centreWorldY = (state.y + anchorY) / state.zoom;
  return {
    x: clampCameraX(centreWorldX * zoom - limits.viewportWidth / 2, limits, zoom),
    y: clampCameraY(centreWorldY * zoom - anchorY, limits, zoom),
    zoom,
  };
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
  return { x: worldX * state.zoom - state.x, y: worldY * state.zoom - state.y };
}

/** Tile coordinate -> screen pixel position of the tile's top-left corner. */
export function tileToScreen(
  state: CameraState,
  tileX: number,
  tileY: number,
): {
  x: number;
  y: number;
} {
  return worldToScreen(state, tileX * TILE_SIZE, tileY * TILE_SIZE);
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
    y: (screenY + state.y) / (TILE_SIZE * state.zoom),
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
