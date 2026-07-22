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
import buildingsData from '@assets/buildings.json';
import buildingsImage from '@assets/buildings.png';
import entitiesData from '@assets/entities.json';
import entitiesImage from '@assets/entities.png';
import terrainData from '@assets/terrain.json';
import terrainImage from '@assets/terrain.png';
import { Spritesheet, Texture } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import type { TileIndex } from '../../shared/ids';
import { ownedBounds } from '../../sim/world/tile-grid';
import type { World } from '../../sim/world/world';

import { createRenderApp, type RenderApp, type RenderBackend } from './app';
import { createBuildingRenderer, type BuildingRenderer } from './building-view';
import {
  clampCameraX,
  clampCameraY,
  createCamera,
  panCamera,
  screenToTile,
  visibleTileRange,
  zoomCamera,
  type CameraLimits,
  type CameraState,
} from './camera';
import { createDirtyGate, type DirtyGate } from './dirty-gate';
import { createHighlight, type Highlight, type HighlightState } from './highlight';
import { createChunkTracker, type ChunkTracker } from './terrain-chunks';
import { createTerrainRenderer, type TerrainRenderer } from './terrain-renderer';
import { createWorkerRenderer, type WorkerRenderer } from './worker-view';

export interface WorldView {
  readonly gate: DirtyGate;
  readonly backend: RenderBackend;
  /**
   * Draws if the gate allows. Returns true when a frame was actually drawn.
   *
   * `alpha` is the fraction of a tick elapsed (ADR-007 §5) for interpolating
   * worker positions; `tick` drives frame-based animation (ASSETS.md §7).
   */
  renderFrame(alpha?: number, tick?: number): boolean;
  pan(deltaX: number): void;
  zoom(next: number): void;
  camera(): CameraState;
  /** Tile under a screen point, or null when outside the world. */
  tileAt(screenX: number, screenY: number): { x: number; y: number } | null;
  /** Marks a tile changed so its chunk re-renders. */
  invalidateTile(tile: TileIndex): void;
  /**
   * Draws the hover, selection, and rejection boxes in the `worldUi` layer.
   *
   * The view owns the drawing; the caller owns the state. Interaction state is
   * presentation state and never reaches `World` (ADR-007 §1).
   */
  setHighlight(state: HighlightState): void;
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
  /** The selected worker id, read each frame to draw its selection box. */
  readonly selectedWorkerId: () => number | null;
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

  // Textures come from the generated atlases, never a runtime path (ADR-006 §4).
  // Each atlas is a separate imported sheet; more (crops, buildings) are added
  // here as their phases land. Static imports so Vite bundles them under the CSP.
  const parseSheet = async (image: string, data: unknown): Promise<Spritesheet> => {
    const sheet = new Spritesheet(await loadAtlasTexture(image), data as never);
    await sheet.parse();
    return sheet;
  };
  const sheets: Readonly<Record<string, Spritesheet>> = {
    terrain: await parseSheet(terrainImage, terrainData),
    entities: await parseSheet(entitiesImage, entitiesData),
    buildings: await parseSheet(buildingsImage, buildingsData),
  };

  const textureFor = (spriteKey: string): Texture => {
    // Manifest keys are `atlas:frame`; each sheet is keyed by frame filename.
    const [atlas, frame] = spriteKey.includes(':') ? spriteKey.split(':') : ['terrain', spriteKey];
    return sheets[atlas ?? '']?.textures[`${frame ?? ''}.png`] ?? Texture.EMPTY;
  };

  const gate: DirtyGate = createDirtyGate();
  const tracker: ChunkTracker = createChunkTracker();

  let limits: CameraLimits = {
    viewportWidth: options.width,
    viewportHeight: options.height,
    worldWidthTiles: options.world.tiles.width,
    worldHeightTiles: options.world.tiles.height,
    resolution: options.resolution,
  };
  // Frame the owned plot at startup so workers and crops are on-screen: the
  // world is far taller than the short overlay, and the plot sits at its centre.
  // The camera stays gameplay-agnostic — it is handed a world-pixel focus only.
  const bounds = ownedBounds(options.world.tiles);
  const focus =
    bounds === null
      ? undefined
      : {
          x: ((bounds.min.x + bounds.max.x + 1) / 2) * TILE_SIZE,
          y: ((bounds.min.y + bounds.max.y + 1) / 2) * TILE_SIZE,
        };
  let camera = createCamera(limits, focus);
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
    app.app.stage.y = -camera.y;
    app.app.stage.scale.set(camera.zoom);
  };
  applyCamera();

  const highlight: Highlight = createHighlight(app.layers.worldUi);

  const workers: WorkerRenderer = createWorkerRenderer({
    layer: app.layers.entities,
    worldUi: app.layers.worldUi,
    textureFor,
    gate,
    selectedId: options.selectedWorkerId,
  });

  const buildings: BuildingRenderer = createBuildingRenderer({
    layer: app.layers.objects,
    textureFor,
    gate,
  });

  return {
    gate,
    backend: app.backend,

    setHighlight(state) {
      highlight.update(state);
      gate.markDirty();
    },

    renderFrame(alpha = 0, tick = 0) {
      const range = visibleTileRange(camera, limits);
      // Chunk re-renders are themselves a scene change, so they must happen
      // before the gate is consulted.
      chunkRedraws = terrain.update(range.first, range.last);
      if (chunkRedraws > 0) gate.markDirty();

      // Workers are consumed from the snapshot slice, never the live store
      // (ADR-005 §2). The update marks the gate dirty when they change and
      // holds an animation lease while any is walking.
      workers.update({
        workers: options.world.snapshots.workers.value,
        alpha,
        tick,
        firstColumn: range.first,
        lastColumn: range.last,
      });
      buildings.update(options.world.snapshots.buildings.value);

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
      limits = { ...limits, viewportWidth: width, viewportHeight: height };
      camera = {
        ...camera,
        x: clampCameraX(camera.x, limits, camera.zoom),
        y: clampCameraY(camera.y, limits, camera.zoom),
      };
      app.resize(width, height);
      applyCamera();
      gate.markDirty();
    },

    attachInput(target) {
      let dragging = false;
      let lastX = 0;

      const onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) return;
        // Ignore drags that begin over interactive UI (the HUD). Capturing the
        // pointer here would redirect the button's pointerup to `target` and
        // swallow its click — the bug the hire button first exposed.
        if (
          event.target instanceof Element &&
          event.target.closest('[data-interactive]') !== null
        ) {
          return;
        }
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
      // Before `app.destroy()`, which tears down the layer that parents them.
      workers.destroy();
      buildings.destroy();
      highlight.destroy();
      terrain.destroy();
      app.destroy();
    },
  };
}

/** Logical pixel size of one tile at a given zoom. Used by UI positioning. */
export function tilePixelSize(zoom: number): number {
  return TILE_SIZE * zoom;
}
