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
import cropsData from '@assets/crops.json';
import cropsImage from '@assets/crops.png';
import entitiesData from '@assets/entities.json';
import entitiesImage from '@assets/entities.png';
import terrainData from '@assets/terrain.json';
import terrainImage from '@assets/terrain.png';
import uiWorldData from '@assets/ui-world.json';
import uiWorldImage from '@assets/ui-world.png';
import { Spritesheet, Texture, type Container } from 'pixi.js';

import { FEATURE_DEBUG } from '../../shared/build-flags';
import { TILE_SIZE } from '../../shared/constants';
import { toPosition } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';
import { CORE_GRASS } from '../../sim/content/tile-kinds';
import { ownedBounds } from '../../sim/world/tile-grid';
import type { World } from '../../sim/world/world';

import { createAmbientPresence, type AmbientPresence } from './ambient-presence';
import { bindAnimationLease, type AnimationLease } from './animation-lease';
import { createRenderApp, type RenderApp, type RenderBackend } from './app';
import { createBuildingGhost, type BuildingGhost, type GhostState } from './building-ghost';
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
import { createCameraFocus, needsFocus, type CameraFocus } from './camera-focus';
import { isShakeFinished, shakeOffset, type ShakeConfig } from './camera-shake';
import { createCropRenderer, type CropRenderer } from './crop-view';
import { planDecor } from './decor';
import { createDecorRenderer, type DecorRenderer } from './decor-view';
import { createDirtyGate, type DirtyGate } from './dirty-gate';
import { EffectKind } from './effect-state';
import { createEffects, type Effects } from './effects';
import { createFloatingNumberPool, type FloatingKind } from './floating-number-state';
import { createFloatingNumberRenderer, type FloatingNumberRenderer } from './floating-numbers';
import { createHighlight, type Highlight, type HighlightState } from './highlight';
import { createLightingRenderer, type LightingRenderer } from './lighting-view';
import { createParticlePool } from './particle-pool';
import { createParticleRenderer, type ParticleRenderer } from './particle-view';
import { createChunkTracker, type ChunkTracker } from './terrain-chunks';
import { createTerrainRenderer, type TerrainRenderer } from './terrain-renderer';
import { createWorkerRenderer, type WorkerRenderer } from './worker-view';
import type { WorldDebug } from './world-debug';

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
  pan(deltaX: number, deltaY: number): void;
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
  /**
   * Draws the build ghost in the `worldUi` layer, or hides it when passed null.
   *
   * As with the highlight, the view owns the drawing and the caller owns the
   * state: the placement wiring decides what building is under the cursor and
   * whether it may go there; this only paints the result.
   */
  setGhost(state: GhostState | null): void;
  /**
   * Plays a one-shot acknowledgement at a tile (07.5b) — a harvest burst, or
   * a ring confirming a placement or a selection.
   *
   * Triggered by the composition root from things that ALREADY HAPPENED, so
   * the world never celebrates an action it rejected. The view owns the
   * timing and drops its animation lease the instant nothing is alive.
   */
  playEffect(kind: 'burst' | 'ring', tile: TileIndex): void;
  /**
   * Rattles the camera (07.7g). Ignored unless the player opted in.
   *
   * The offset is applied to the STAGE, never to `camera` — a shake that moved
   * the camera itself would fight the clamp, survive into the next pan, and
   * drift the view permanently.
   */
  shakeCamera(config: ShakeConfig, seed: number): void;
  /**
   * Raises a `+n` over a tile (07.7c) — coins earned, items gained.
   *
   * Like `playEffect`, driven by the composition root from things that HAVE
   * HAPPENED, so a rejected sale never shows a number.
   */
  showNumber(kind: FloatingKind, tile: TileIndex, amount: number): void;
  /**
   * Throws particles from a tile (07.7d) — dust off a hoe, leaves off a
   * harvest, gold off a sale.
   *
   * Driven by the composition root from things that HAVE HAPPENED, never from
   * an intent, so a rejected command scatters nothing.
   */
  emitParticles(kind: EffectKind, tile: TileIndex, count: number): void;
  /**
   * Eases the camera to bring a tile into view (07.5c).
   *
   * Does NOTHING when the tile is already comfortably visible, and any pan or
   * zoom abandons the glide instantly: `fix/0.1/7.5.md` §Camera's one hard
   * rule is that focus never interrupts player control.
   */
  focusOnTile(tile: TileIndex): void;
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
  /**
   * Sprites currently parented across the world layers (07.8a).
   *
   * Diagnostics only, and read-only: it counts children, it does not expose
   * them, so a debug panel cannot reach a sprite through this.
   */
  visibleSpriteCount(): number;
  destroy(): void;
}

export interface WorldViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly world: World;
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
  /**
   * Logical pixels at the top of the viewport covered by opaque HUD, so the
   * plot is framed in the band the player can actually see and click (07.9).
   */
  readonly viewportTopInset?: number;
  /** Atlas name to load, from the generated manifest (ASSETS.md §5). */
  readonly atlas: string;
  /** The selected worker id, read each frame to draw its selection box. */
  readonly selectedWorkerId: () => number | null;
  /**
   * Motion strength, 0–1, read per animation (ADR-017 §7).
   *
   * Absent means full. Reduced Motion and the minimum intensity both arrive
   * as 0, which leaves everything at rest without disabling any code path —
   * so a setting changed mid-animation cannot strand a sprite.
   */
  readonly motionIntensity?: (() => number) | undefined;
  /**
   * Whether particles may be thrown at all (ADR-017 §7).
   *
   * Checked HERE rather than at each call site because the stage-change
   * sparkle is raised inside this module — a caller-side gate would silently
   * miss it. Absent means enabled.
   */
  readonly particlesEnabled?: (() => boolean) | undefined;
  /**
   * Whether living things move on their own — idle worker breathing now, the
   * 07.7f fidgets and the 07.7j creatures later (ADR-017 §2).
   *
   * UNBOUNDED, so absent means no.
   */
  readonly creaturesEnabled?: (() => boolean) | undefined;
  /** Whether the camera may shake at all (ADR-017 §7). Absent means no. */
  readonly shakeEnabled?: (() => boolean) | undefined;
  /**
   * Whether ambient environment motion may run (ADR-017 §2).
   *
   * Already resolved for Reduced Motion and work mode by `effectiveMotion`;
   * this view adds the presence condition. Absent means no.
   */
  readonly environmentEnabled?: (() => boolean) | undefined;
  /**
   * In-world debug overlays (07.8i, 07.8j), absent in a build with no tooling.
   *
   * A FACTORY, not a boolean: production must not merely skip drawing them, it
   * must not contain them. Supplied from the composition root behind
   * `FEATURE_DEBUG`, so the overlay modules have no importer at all in a
   * release build and Rollup drops them (ADR-018 §6). ONE port for every
   * in-world tool — see `world-debug.ts` for why that is not one each.
   */
  readonly debug?: { readonly create: (parent: Container) => WorldDebug } | undefined;
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
  // Each atlas is a separate imported sheet. Static imports so Vite bundles
  // them under the CSP.
  //
  // The `crops` sheet was generated in phase-05.6 and never loaded here, so
  // every `crops:*` key resolved to `Texture.EMPTY` — one half of why a planted
  // farm looked identical to an empty one.
  const parseSheet = async (image: string, data: unknown): Promise<Spritesheet> => {
    const sheet = new Spritesheet(await loadAtlasTexture(image), data as never);
    await sheet.parse();
    return sheet;
  };
  const sheets: Readonly<Record<string, Spritesheet>> = {
    terrain: await parseSheet(terrainImage, terrainData),
    entities: await parseSheet(entitiesImage, entitiesData),
    buildings: await parseSheet(buildingsImage, buildingsData),
    crops: await parseSheet(cropsImage, cropsData),
    // Loaded for the numeric glyphs the floating numbers compose (07.7c); the
    // item and tool icons in this atlas are drawn by the DOM HUD, not here.
    'ui-world': await parseSheet(uiWorldImage, uiWorldData),
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
    viewportTopInset: options.viewportTopInset ?? 0,
  };
  // Frame the owned plot at startup so workers and crops are on-screen: the
  // world is far taller than the short overlay, and the plot sits at its centre.
  // The camera stays gameplay-agnostic — it is handed a world-pixel focus only.
  const bounds = ownedBounds(options.world.tiles);
  const focusPoint =
    bounds === null
      ? undefined
      : {
          x: ((bounds.min.x + bounds.max.x + 1) / 2) * TILE_SIZE,
          y: ((bounds.min.y + bounds.max.y + 1) / 2) * TILE_SIZE,
        };
  let camera = createCamera(limits, focusPoint);
  let chunkRedraws = 0;

  // The eased focus glide (07.5c). `createCamera` above already frames the
  // owned plot at construction, which is the directive's "focus on loading a
  // save" — done geometrically, with no movement to watch.
  const focus: CameraFocus = createCameraFocus();
  // The glide's lease, bound rather than hand-rolled (07.7b) — see
  // `animation-lease.ts` for why the bookkeeping stopped living at call sites.
  const focusLease: AnimationLease = bindAnimationLease(gate);

  const endFocus = (): void => {
    focusLease.release();
  };

  const terrain: TerrainRenderer = createTerrainRenderer({
    renderer: app.app.renderer,
    layer: app.layers.terrain,
    grid: options.world.tiles,
    tileKinds: options.world.tileKinds,
    tracker,
    textureFor,
  });

  const doPan = (deltaX: number, deltaY: number): void => {
    // The player moved the camera, so whatever it was doing on its own stops.
    focus.cancel();
    const next = panCamera(camera, deltaX, deltaY, limits);
    if (next === camera) return;
    camera = next;
    applyCamera();
    gate.markDirty();
  };

  const doZoom = (nextZoom: number): void => {
    focus.cancel();
    const updated = zoomCamera(camera, nextZoom, limits);
    if (updated === camera) return;
    camera = updated;
    applyCamera();
    // Chunk textures are resolution-independent, but the visible set changes.
    tracker.invalidateAll();
    gate.markDirty();
  };

  /** The active shake, or null. Presentation-only; never part of `camera`. */
  let shake: { config: ShakeConfig; startedAt: number; seed: number } | null = null;
  const shakeLease: AnimationLease = bindAnimationLease(gate);

  const applyCamera = (): void => {
    // The whole stage shifts; individual layers never track the camera
    // separately, which would let them drift out of alignment.
    const offset =
      shake === null
        ? { x: 0, y: 0 }
        : shakeOffset(
            shake.config,
            performance.now() - shake.startedAt,
            shake.seed,
            options.motionIntensity?.() ?? 1,
          );

    app.app.stage.x = -camera.x + offset.x;
    app.app.stage.y = -camera.y + offset.y;
    app.app.stage.scale.set(camera.zoom);
  };
  applyCamera();

  // Gated on the LITERAL, so a release build contains no overlay to switch off
  // — not the hook, not the null check. See `shared/build-flags.ts`.
  const debug: WorldDebug | null = FEATURE_DEBUG
    ? (options.debug?.create(app.layers.worldUi) ?? null)
    : null;

  const highlight: Highlight = createHighlight(app.layers.worldUi);

  const workers: WorkerRenderer = createWorkerRenderer({
    layer: app.layers.entities,
    worldUi: app.layers.worldUi,
    textureFor,
    gate,
    selectedId: options.selectedWorkerId,
    breathing: options.creaturesEnabled,
    intensity: options.motionIntensity,
  });

  const buildings: BuildingRenderer = createBuildingRenderer({
    layer: app.layers.objects,
    textureFor,
    gate,
  });

  // Crops share the y-sorted `objects` layer with buildings and decor, so a
  // worker standing south of a pumpkin draws in front of it.
  const particles = createParticlePool();

  /** The one path particles are thrown through, so the setting cannot be skipped. */
  const emit = (kind: EffectKind, tile: TileIndex, count: number): void => {
    if (options.particlesEnabled?.() === false) return;
    particles.emit(kind, tile, performance.now(), count);
  };

  const crops: CropRenderer = createCropRenderer({
    layer: app.layers.objects,
    textureFor,
    gate,
    intensity: options.motionIntensity,
    // A crop reaching a new stage sparkles where it stands. Raised here rather
    // than by the composition root because the STAGE CHANGE is only visible in
    // the slice diff, which is this renderer's business and nobody else's.
    onStageChange: (tile) => {
      emit(EffectKind.Sparkle, tile as TileIndex, 4);
    },
  });

  // Layer 5, claimed (ADR-001 §Layers). It is parented to the app stage
  // rather than the camera-transformed world, because a day/night wash is a
  // property of the light, not of where the player has panned to.
  const lighting: LightingRenderer = createLightingRenderer({
    layer: app.layers.lighting,
    registry: options.world.phaseTintRegistry,
    gate,
    width: options.width,
    height: options.height,
    intensity: options.motionIntensity,
  });

  // The build ghost shares the worldUi layer with the highlight (ADR-001
  // §Layers). Created after it so the translucent building draws over the
  // hover box on the same tile.
  const ghost: BuildingGhost = createBuildingGhost({ layer: app.layers.worldUi, textureFor });

  // Layer 4, which `layers.ts` reserved and left empty for exactly this.
  const effects: Effects = createEffects(app.layers.effects, gate);

  const particleRenderer: ParticleRenderer = createParticleRenderer({
    layer: app.layers.effects,
    pool: particles,
    gate,
  });

  // Numbers share the effects layer: both are transient acknowledgements that
  // belong above the world and below the HUD.
  const numbers = createFloatingNumberPool();
  const numberRenderer: FloatingNumberRenderer = createFloatingNumberRenderer({
    layer: app.layers.effects,
    pool: numbers,
    textureFor,
    gate,
  });

  // Ground decoration (07.5e). Shares the y-sorted `objects` layer with
  // buildings so props, buildings, and workers interleave correctly by depth.
  const decor: DecorRenderer = createDecorRenderer({ layer: app.layers.objects, textureFor });

  // AMBIENT MOTION (07.7j, ADR-017 §2). Its lease is the one thing in this
  // file that could be held indefinitely, so all four conditions are resolved
  // in one place, every frame, and the answer drives both the drawing and the
  // lease together.
  const presence: AmbientPresence = createAmbientPresence();
  const ambientLease: AnimationLease = bindAnimationLease(gate);

  const ambientAllowed = (nowMs: number): boolean =>
    // Condition 1 and 3 (off by default, never in work mode) arrive resolved
    // in this flag; condition 2 is structural, since collapsing destroys this
    // whole view; condition 4 is presence.
    options.environmentEnabled?.() === true && presence.isPresent(nowMs);

  // Grass is the only decorated kind; its dense index is resolved once here
  // rather than assumed, since registration order is content's business.
  const grassKindIndex = options.world.tileKinds.indexOf(CORE_GRASS);

  /** Expansion count the decor was last planned against — see `renderFrame`. */
  let decorOwnedRevision = -1;

  const replanDecor = (): void => {
    if (grassKindIndex < 0) return;
    decor.set(planDecor(options.world.tiles, options.world.seed, grassKindIndex));
    gate.markDirty();
  };

  return {
    gate,
    backend: app.backend,

    setHighlight(state) {
      highlight.update(state);
      gate.markDirty();
    },

    setGhost(state) {
      ghost.update(state);
      gate.markDirty();
    },

    shakeCamera(config, seed) {
      if (options.shakeEnabled?.() !== true) return;
      shake = { config, startedAt: performance.now(), seed };
      shakeLease.sync(true);
    },

    playEffect(kind, tile) {
      const now = performance.now();
      if (kind === 'burst') effects.burst(tile, now);
      else effects.ring(tile, now);
    },

    emitParticles(kind, tile, count) {
      emit(kind, tile, count);
    },

    showNumber(kind, tile, amount) {
      numbers.emit(kind, tile, amount, performance.now());
    },

    focusOnTile(tile) {
      const position = toPosition(tile);
      // Cosmetic: a bad index must never take down a frame.
      if (!position.ok) return;

      const centreWorldX = (position.value.x + 0.5) * TILE_SIZE;
      // Already on screen? Then the player is looking at it, and moving the
      // camera would be disruption rather than help.
      if (!needsFocus(centreWorldX, camera, limits)) return;

      const targetX = clampCameraX(
        centreWorldX * camera.zoom - limits.viewportWidth / 2,
        limits,
        camera.zoom,
      );
      if (targetX === camera.x) return;

      focus.start(camera.x, targetX, performance.now());
      // Held only while gliding, and released the frame it finishes — the
      // same lease discipline the effects follow (ADR-001 §1).
      focusLease.sync(true);
    },

    renderFrame(alpha = 0, tick = 0) {
      // The glide, before anything reads the camera this frame.
      const glidedX = focus.sample(performance.now());
      if (glidedX !== null) {
        camera = { ...camera, x: clampCameraX(glidedX, limits, camera.zoom) };
        applyCamera();
        gate.markDirty();
      } else {
        // Idempotent, so calling it on every non-gliding frame is free.
        focusLease.sync(false);
      }

      // The shake, before anything reads the stage this frame. It ends by
      // restoring the stage to the unshaken camera position exactly once.
      if (shake !== null) {
        if (isShakeFinished(shake.config, shake.startedAt, performance.now())) {
          shake = null;
          shakeLease.sync(false);
        }
        applyCamera();
        gate.markDirty();
      }

      const range = visibleTileRange(camera, limits);

      // Sampled before the terrain update, and dirties nothing. See
      // `chunk-debug.ts` for why both of those matter.
      if (FEATURE_DEBUG && debug !== null) {
        debug.update({
          stale: tracker.staleVisible(range.first, range.last),
          firstColumn: range.first,
          lastColumn: range.last,
        });
      }

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
        nowMs: performance.now(),
        firstColumn: range.first,
        lastColumn: range.last,
      });
      buildings.update(options.world.snapshots.buildings.value);
      // The slice republishes on a stage change, so this is a reference
      // comparison on all but four frames of a crop's life.
      crops.update(options.world.snapshots.crops.value);
      // Republishes four times a day, so this is a string comparison on every
      // other frame of the world's life.
      lighting.update(options.world.snapshots.time.value);

      // Decor is static until the plot grows, so it is re-planned only when
      // the expansion counter moves — never per frame. A tile that becomes
      // the player's loses its tree.
      const expansions = options.world.economy.expansionsPurchased;
      if (expansions !== decorOwnedRevision) {
        decorOwnedRevision = expansions;
        replanDecor();
      }
      // Ambient motion, and the lease that pays for it. Both come from one
      // answer so they can never disagree — a swaying world with no lease
      // would stutter, and a lease with no sway would be a permanent cost.
      const ambientNow = performance.now();
      const ambient = ambientAllowed(ambientNow);
      decor.sway(ambientNow, ambient);
      ambientLease.sync(ambient);

      // Effects animate in REAL time, not simulation time: they acknowledge
      // an event to a person, so they must not stretch when the sim is
      // time-scaled in devtools. This also releases the animation lease the
      // moment the last one expires.
      effects.update(performance.now());
      numberRenderer.update(performance.now());
      particleRenderer.update(performance.now());
      // Crops animate per frame but reconcile only on a slice change; this
      // holds a lease for exactly as long as something is actually moving.
      crops.animate(performance.now());
      // Finite by construction: a phase transition runs for a fixed duration and
      // drops its lease, so the idle state is zero frames (ADR-020 §3).
      lighting.animate(performance.now());

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
      lighting.resize(width, height);
      applyCamera();
      gate.markDirty();
    },

    attachInput(target) {
      let dragging = false;
      let lastX = 0;
      let lastY = 0;

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
        presence.touch(performance.now());
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        target.setPointerCapture(event.pointerId);
      };

      const onPointerMove = (event: PointerEvent): void => {
        // Any pointer activity is presence (07.7j) — including a move that
        // does not drag, which is the ordinary case for someone glancing at
        // the farm.
        presence.touch(performance.now());
        gate.markDirty();
        if (!dragging) return;
        // Drag right moves the world right, i.e. the camera left. Vertical
        // works the same way, and exists because the plot is taller than the
        // overlay and grows with every expansion (07.9 — see `camera.ts`).
        doPan(lastX - event.clientX, lastY - event.clientY);
        lastX = event.clientX;
        lastY = event.clientY;
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
          doPan(event.deltaX, 0);
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

    visibleSpriteCount: () =>
      app.layers.terrain.children.length +
      app.layers.objects.children.length +
      app.layers.entities.children.length +
      app.layers.effects.children.length,

    visibleTileCount() {
      // The shake, before anything reads the stage this frame. It ends by
      // restoring the stage to the unshaken camera position exactly once.
      if (shake !== null) {
        if (isShakeFinished(shake.config, shake.startedAt, performance.now())) {
          shake = null;
          shakeLease.sync(false);
        }
        applyCamera();
        gate.markDirty();
      }

      const range = visibleTileRange(camera, limits);
      return (range.last - range.first + 1) * options.world.tiles.height;
    },

    destroy() {
      // Before `app.destroy()`, which tears down the layer that parents them.
      workers.destroy();
      buildings.destroy();
      crops.destroy();
      lighting.destroy();
      ghost.destroy();
      highlight.destroy();
      // A glide's lease must not outlive the view that owns it.
      focus.cancel();
      endFocus();
      shakeLease.release();
      ambientLease.release();
      presence.clear();
      decor.destroy();
      // Before the gate goes: a lease outliving its view is a permanent frame
      // cost on the next scene (ADR-001 §2 destroys and rebuilds on collapse).
      numberRenderer.destroy();
      particleRenderer.destroy();
      effects.destroy();
      terrain.destroy();
      if (FEATURE_DEBUG) debug?.destroy();
      app.destroy();
    },
  };
}

/** Logical pixel size of one tile at a given zoom. Used by UI positioning. */
export function tilePixelSize(zoom: number): number {
  return TILE_SIZE * zoom;
}
