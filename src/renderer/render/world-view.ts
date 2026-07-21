/**
 * The world view — Pixi lifecycle, camera, terrain, and the dirty gate wired
 * together.
 *
 * This is a PURE VIEW of world state (ADR-003 §4). It holds no authoritative
 * data, so destroying and rebuilding it is lossless — which is exactly what
 * collapsed mode does on every toggle (ADR-001 §2).
 *
 * Nothing here draws unconditionally. `renderFrame` asks the dirty gate first
 * and returns whether it actually drew, so the caller (and the devtools FPS
 * metric) can tell a skipped frame from a real one.
 */

// The atlas is IMPORTED, not fetched. The renderer loads from a file:// URL
// under a strict CSP (connect-src 'self'), where fetching a sibling file fails
// with "Failed to fetch" — which is how a runtime `Assets.load('terrain.json')`
// presented. Importing lets Vite inline the descriptor and emit the image as a
// bundled asset that resolves in both dev and production.
import atlasData from '@assets/terrain.json';
import atlasImage from '@assets/terrain.png';
import { Spritesheet, Texture } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import type { TileIndex } from '../../shared/ids';
import type { World } from '../../sim/world/world';

import { createRenderApp, type RenderApp, type RenderBackend } from './app';
import {
  clampCameraX,
  createCamera,
  panCamera,
  screenToTile,
  visibleTileRange,
  zoomCamera,
  type CameraLimits,
  type CameraState,
} from './camera';
import { createDirtyGate, type DirtyGate } from './dirty-gate';
import { createChunkTracker, type ChunkTracker } from './terrain-chunks';
import { createTerrainRenderer, type TerrainRenderer } from './terrain-renderer';

export interface WorldView {
  readonly gate: DirtyGate;
  readonly backend: RenderBackend;
  /** Draws if the gate allows. Returns true when a frame was actually drawn. */
  renderFrame(): boolean;
  pan(deltaX: number): void;
  zoom(next: number): void;
  camera(): CameraState;
  /** Tile under a screen point, or null when outside the world. */
  tileAt(screenX: number, screenY: number): { x: number; y: number } | null;
  /** Marks a tile changed so its chunk re-renders. */
  invalidateTile(tile: TileIndex): void;
  resize(width: number, height: number): void;
  /**
   * Attaches drag-to-pan and wheel-to-zoom to an element. Returns teardown.
   *
   * Input lives here rather than in the UI layer because it manipulates the
   * camera, which is render state. React never touches the camera.
   */
  attachInput(target: HTMLElement): () => void;
  /** Chunks redrawn on the most recent frame. Zero on a cached frame. */
  lastChunkRedraws(): number;
  visibleTileCount(): number;
  destroy(): void;
}

export interface WorldViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly world: World;
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
  /** Atlas name to load, from the generated manifest (ASSETS.md §5). */
  readonly atlas: string;
}

/**
 * Loads the atlas image through an `<img>` element rather than Pixi's loader.
 *
 * Pixi's loader fetches, and EVERY url shape available here is blocked by the
 * strict CSP (`connect-src 'self'`): a `file://` sibling fails with
 * "Failed to fetch", and Vite inlines small images as `data:` which fetch also
 * rejects. It additionally spawns a blob: worker for decoding, which
 * `script-src 'self'` refuses.
 *
 * `img-src 'self' data:` already permits image loading, so an Image element
 * sidesteps all three without weakening the policy — which matters because the
 * renderer will execute plugin code from v0.2 (ADR-003 §6).
 */
async function loadAtlasTexture(source: string): Promise<Texture> {
  const image = new Image();
  image.src = source;
  await image.decode();
  return Texture.from(image);
}

export async function createWorldView(options: WorldViewOptions): Promise<WorldView> {
  const app: RenderApp = await createRenderApp({
    canvas: options.canvas,
    width: options.width,
    height: options.height,
    resolution: options.resolution,
  });

  // Textures come from the generated atlas, never a runtime path (ADR-006 §4).
  const atlasTexture = await loadAtlasTexture(atlasImage);
  const sheet = new Spritesheet(atlasTexture, atlasData as never);
  await sheet.parse();

  const textureFor = (spriteKey: string): Texture => {
    // Manifest keys are `atlas:frame`; the sheet is keyed by frame filename.
    const frame = spriteKey.includes(':') ? spriteKey.split(':')[1] : spriteKey;
    return sheet.textures[`${frame ?? ''}.png`] ?? Texture.EMPTY;
  };

  const gate: DirtyGate = createDirtyGate();
  const tracker: ChunkTracker = createChunkTracker();

  let limits: CameraLimits = {
    viewportWidth: options.width,
    worldWidthTiles: options.world.tiles.width,
    resolution: options.resolution,
  };
  let camera = createCamera(limits);
  let chunkRedraws = 0;

  const terrain: TerrainRenderer = createTerrainRenderer({
    renderer: app.app.renderer,
    layer: app.layers.terrain,
    grid: options.world.tiles,
    tileKinds: options.world.tileKinds,
    tracker,
    textureFor,
  });

  const doPan = (deltaX: number): void => {
    const next = panCamera(camera, deltaX, limits);
    if (next === camera) return;
    camera = next;
    applyCamera();
    gate.markDirty();
  };

  const doZoom = (nextZoom: number): void => {
    const updated = zoomCamera(camera, nextZoom, limits);
    if (updated === camera) return;
    camera = updated;
    applyCamera();
    // Chunk textures are resolution-independent, but the visible set changes.
    tracker.invalidateAll();
    gate.markDirty();
  };

  const applyCamera = (): void => {
    // The whole stage shifts; individual layers never track the camera
    // separately, which would let them drift out of alignment.
    app.app.stage.x = -camera.x;
    app.app.stage.scale.set(camera.zoom);
  };
  applyCamera();

  return {
    gate,
    backend: app.backend,

    renderFrame() {
      const range = visibleTileRange(camera, limits);
      // Chunk re-renders are themselves a scene change, so they must happen
      // before the gate is consulted.
      chunkRedraws = terrain.update(range.first, range.last);
      if (chunkRedraws > 0) gate.markDirty();

      if (!gate.shouldRender()) return false;

      app.render();
      gate.clearDirty();
      return true;
    },

    pan: doPan,
    zoom: doZoom,

    camera: () => camera,

    tileAt(screenX, screenY) {
      const tile = screenToTile(camera, screenX, screenY);
      const x = Math.floor(tile.x);
      const y = Math.floor(tile.y);
      const grid = options.world.tiles;
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
      return { x, y };
    },

    invalidateTile(tile) {
      tracker.invalidateTile(tile);
      gate.markDirty();
    },

    resize(width, height) {
      limits = { ...limits, viewportWidth: width };
      camera = { ...camera, x: clampCameraX(camera.x, limits, camera.zoom) };
      app.resize(width, height);
      applyCamera();
      gate.markDirty();
    },

    attachInput(target) {
      let dragging = false;
      let lastX = 0;

      const onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) return;
        dragging = true;
        lastX = event.clientX;
        target.setPointerCapture(event.pointerId);
      };

      const onPointerMove = (event: PointerEvent): void => {
        if (!dragging) return;
        // Drag right moves the world right, i.e. the camera left.
        doPan(lastX - event.clientX);
        lastX = event.clientX;
      };

      const endDrag = (event: PointerEvent): void => {
        if (!dragging) return;
        dragging = false;
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      };

      const onWheel = (event: WheelEvent): void => {
        // Horizontal scroll pans; ctrl+wheel zooms. A bare vertical wheel is
        // left alone so the gesture stays available to UI panels.
        if (event.ctrlKey) {
          event.preventDefault();
          doZoom(camera.zoom + (event.deltaY < 0 ? 1 : -1));
          return;
        }
        if (event.deltaX !== 0) {
          event.preventDefault();
          doPan(event.deltaX);
        }
      };

      target.addEventListener('pointerdown', onPointerDown);
      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', endDrag);
      target.addEventListener('pointercancel', endDrag);
      target.addEventListener('wheel', onWheel, { passive: false });

      return () => {
        target.removeEventListener('pointerdown', onPointerDown);
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', endDrag);
        target.removeEventListener('pointercancel', endDrag);
        target.removeEventListener('wheel', onWheel);
      };
    },

    lastChunkRedraws: () => chunkRedraws,

    visibleTileCount() {
      const range = visibleTileRange(camera, limits);
      return (range.last - range.first + 1) * options.world.tiles.height;
    },

    destroy() {
      terrain.destroy();
      app.destroy();
    },
  };
}

/** Logical pixel size of one tile at a given zoom. Used by UI positioning. */
export function tilePixelSize(zoom: number): number {
  return TILE_SIZE * zoom;
}
