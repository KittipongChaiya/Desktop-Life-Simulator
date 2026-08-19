/**
 * Terrain rendering via cached chunk textures. ADR-001 §Terrain.
 *
 * Each 16x16-tile chunk is drawn ONCE into a `RenderTexture` and thereafter
 * displayed as a single sprite. A static 64x64 farm is 16 quads per frame
 * instead of 4,096 — and combined with the dirty gate, usually zero frames at
 * all.
 *
 * Re-rendering is per chunk: changing one tile re-renders the 256 tiles around
 * it, not the world. Tilling a tile therefore costs one chunk redraw — the
 * composition root invalidates the tile when `tileTilled` is published, which
 * is what makes tilled soil appear at all.
 *
 * The chunk-index arithmetic lives in `terrain-chunks.ts` and the sprite choice
 * in `terrain-tiles.ts`, both unit-tested without a GPU; this module is only
 * the Pixi half.
 */

// Container, RenderTexture, and Sprite are used as CONSTRUCTORS — they must be
// value imports. `eslint --fix` once collapsed this whole line to `import type`,
// which typechecks against the declarations and then fails at build time.
import { Sprites } from '@assets/manifest';
import { Container, RenderTexture, Sprite, type Renderer, type Texture } from 'pixi.js';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';
import { asTileIndex } from '../../shared/ids';
import type { TileKindRegistry } from '../../sim/content/tile-kinds';
import { isOwned, type TileGrid } from '../../sim/world/tile-grid';

import { CHUNK_SIZE, chunkOrigin, type ChunkTracker } from './terrain-chunks';
import { tileSpriteKey } from './terrain-tiles';
import { variantSprite } from './tile-variants';

const CHUNK_PIXELS = CHUNK_SIZE * TILE_SIZE;

/**
 * Tint applied to tiles OUTSIDE the owned plot.
 *
 * Darkening the unowned world rather than highlighting the owned plot keeps the
 * player's land at full-brightness reference colour, and costs nothing: the
 * tint is baked into the cached chunk texture, so it adds no draw calls and no
 * per-frame work (criterion 2 without violating criterion 8).
 *
 * WARMED AND LIFTED IN PHASE-39, and found by looking rather than by reasoning.
 * It was `0x6b7280` — a cool blue-grey at 42% brightness — and the first
 * screenshot of the running game showed what that means in practice: the
 * player's plot is a small part of the view, so this multiplied almost
 * everything on screen into dark desaturated green. A grey wash over most of
 * the world is exactly the "sterile grey environment" the art direction
 * forbids, and no contact sheet could ever have shown it, because a contact
 * sheet never has an owned plot in it.
 *
 * The value keeps the job — unowned land still reads as not-yours — and pays
 * far less for it: warm rather than blue, and lifted twice. 42% was the
 * original blue-grey; 78% was the first warm try, and a second screenshot
 * (this time with the real grass tile in the atlas rather than a stale one)
 * showed it still reading as dark forest rather than as countryside. 86% is
 * where the boundary is still legible — and it has other cues besides, since
 * the plot is where the tilled soil and the buildings are — while the world
 * stays the warm green the art direction asks for.
 */
const UNOWNED_TINT = 0xdcd0bf;

/**
 * The tint for unowned land that TOUCHES the plot. Phase-44 — ADR-042.
 *
 * Ownership used to change in one step, which drew a perfectly straight line
 * down the middle of the world — and a straight line of brightness is the most
 * grid-like thing a renderer can do, because nothing in a field has an edge
 * like that. The first photograph of a built-up farm made it the most obvious
 * artefact left on screen.
 *
 * Halfway between white and `UNOWNED_TINT`, so the boundary becomes a two-step
 * ramp instead of a cliff. It still reads as a boundary — which the player
 * needs, since it is where they may build — and it stops reading as a wall.
 *
 * A one-tile ramp rather than a wide gradient on purpose: the world viewport is
 * five tiles tall, so a three-tile fade would be most of the screen.
 */
const FRINGE_TINT = 0xeee8df;

/** The four path fringes and the neighbour each one answers for. */
const PATH_EDGES: readonly (readonly [number, number, string])[] = [
  [0, -1, Sprites.terrainPathEdgeN],
  [1, 0, Sprites.terrainPathEdgeE],
  [0, 1, Sprites.terrainPathEdgeS],
  [-1, 0, Sprites.terrainPathEdgeW],
];

/**
 * Whether a tile has an owned neighbour — i.e. sits on the plot's edge.
 *
 * Four-neighbour rather than eight: a diagonal-only touch reads as a corner
 * artefact rather than as an edge, and lighting it makes the boundary look
 * chewed.
 */
function touchesOwned(grid: TileGrid, worldX: number, worldY: number): boolean {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = worldX + dx;
    const ny = worldY + dy;
    if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
    if (isOwned(grid, asTileIndex(ny * WORLD_WIDTH + nx))) return true;
  }
  return false;
}

export interface TerrainRenderer {
  /**
   * Re-renders stale chunks within the visible column range and returns how
   * many were redrawn. Zero means the frame cost nothing.
   */
  update(firstColumn: number, lastColumn: number): number;
  /** Sprites currently parented, i.e. draw calls contributed by terrain. */
  visibleChunkCount(): number;
  /**
   * Tints the whole terrain, for the season AND the weather. Phase-11c —
   * ADR-021 §6; weather joined it in phase-33 (ADR-041).
   *
   * Applied to the chunk SPRITES, not baked into their textures, so a season
   * change costs a tint assignment per visible chunk and **no chunk redraw at
   * all**. Baking it would invalidate every cached texture four times a year,
   * which is the one thing this renderer exists to avoid.
   *
   * Multiplies over the owned/unowned tint already baked in, so `0xffffff`
   * leaves the terrain exactly as it was.
   */
  setWorldTint(color: number): void;
  destroy(): void;
}

export interface TerrainRendererOptions {
  readonly renderer: Renderer;
  readonly layer: Container;
  readonly grid: TileGrid;
  readonly tileKinds: TileKindRegistry;
  readonly tracker: ChunkTracker;
  /** Resolves a sprite key to a texture from the loaded atlas. */
  readonly textureFor: (spriteKey: string) => Texture;
}

export function createTerrainRenderer(options: TerrainRendererOptions): TerrainRenderer {
  const { renderer, layer, grid, tileKinds, tracker, textureFor } = options;

  const textures = new Map<number, RenderTexture>();
  const sprites = new Map<number, Sprite>();
  /** White until a season sets one — i.e. terrain exactly as v0.1 drew it. */
  let worldTint = 0xffffff;

  /** Reused scratch container — allocating one per chunk redraw would churn. */
  const scratch = new Container();

  const renderChunk = (chunk: number): void => {
    let target = textures.get(chunk);
    if (target === undefined) {
      target = RenderTexture.create({
        width: CHUNK_PIXELS,
        height: CHUNK_PIXELS,
        scaleMode: 'nearest',
      });
      textures.set(chunk, target);
    }

    const origin = chunkOrigin(chunk);
    scratch.removeChildren();

    for (let ty = 0; ty < CHUNK_SIZE; ty += 1) {
      for (let tx = 0; tx < CHUNK_SIZE; tx += 1) {
        const worldX = origin.x + tx;
        const worldY = origin.y + ty;
        if (worldX >= grid.width || worldY >= grid.height) continue;

        const tile = asTileIndex(worldY * WORLD_WIDTH + worldX);
        // WHICH ground, then which of its faces. `tileSpriteKey` answers the
        // first and is the tile's identity; `variantSprite` answers the second
        // and is pure decoration, which is why it lives out here rather than
        // inside the selector — nothing but the chunk baker should care that
        // grass has three faces (phase-33, ADR-041 §4).
        const key = variantSprite(tileSpriteKey(grid, tileKinds, tile), tile);
        const sprite = new Sprite(textureFor(key));
        sprite.x = tx * TILE_SIZE;
        sprite.y = ty * TILE_SIZE;
        if (!isOwned(grid, tile)) {
          sprite.tint = touchesOwned(grid, worldX, worldY) ? FRINGE_TINT : UNOWNED_TINT;
        }
        scratch.addChild(sprite);

        // PATH FRINGES (phase-45). A plaza of path tiles has four perfectly
        // straight edges, which is the most grid-like thing a renderer can
        // draw. Turf encroaches over the path wherever its neighbour is not
        // one; the four overlays COMPOSE, so a corner simply draws two.
        //
        // Baked into the chunk texture like everything else here, so the whole
        // effect costs nothing per frame.
        if (key === Sprites.terrainPath) {
          for (const [dx, dy, edge] of PATH_EDGES) {
            const nx = worldX + dx;
            const ny = worldY + dy;
            const outside = nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height;
            const neighbour = outside
              ? ''
              : tileSpriteKey(grid, tileKinds, asTileIndex(ny * WORLD_WIDTH + nx));
            if (neighbour === Sprites.terrainPath) continue;

            const fringe = new Sprite(textureFor(edge));
            fringe.x = tx * TILE_SIZE;
            fringe.y = ty * TILE_SIZE;
            fringe.tint = sprite.tint;
            scratch.addChild(fringe);
          }
        }
      }
    }

    renderer.render({ container: scratch, target, clear: true });

    // The scratch sprites have served their purpose; the pixels now live in the
    // render texture. Leaving them parented would retain 256 display objects
    // per chunk.
    for (const child of scratch.removeChildren()) child.destroy();

    let display = sprites.get(chunk);
    if (display === undefined) {
      display = new Sprite(target);
      display.x = origin.x * TILE_SIZE;
      display.y = origin.y * TILE_SIZE;
      // A chunk created after the season was set must arrive already tinted —
      // otherwise scrolling into new ground shows last season's colour until
      // the next boundary, hours away.
      display.tint = worldTint;
      layer.addChild(display);
      sprites.set(chunk, display);
    } else {
      display.texture = target;
    }
  };

  return {
    setWorldTint(color) {
      // Change-gated. Four times a year for the season, and once per weather
      // period on top of that — still nothing next to a frame.
      if (color === worldTint) return;
      worldTint = color;
      for (const sprite of sprites.values()) sprite.tint = color;
    },

    update(firstColumn, lastColumn) {
      const stale = tracker.staleVisible(firstColumn, lastColumn);
      for (const chunk of stale) {
        renderChunk(chunk);
        tracker.markClean(chunk);
      }
      return stale.length;
    },

    visibleChunkCount: () => sprites.size,

    destroy() {
      for (const sprite of sprites.values()) sprite.destroy();
      sprites.clear();

      // Render textures hold GPU memory that GC will not reclaim
      // (CODE_STYLE.md §10). Collapsed mode destroys the renderer on every
      // toggle, so a missed release here leaks on each collapse.
      for (const texture of textures.values()) texture.destroy(true);
      textures.clear();

      scratch.destroy({ children: true });
    },
  };
}
