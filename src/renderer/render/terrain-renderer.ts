/**
 * Terrain rendering via cached chunk textures. ADR-001 §Terrain.
 *
 * Each 16x16-tile chunk is drawn ONCE into a `RenderTexture` and thereafter
 * displayed as a single sprite. A static 64x64 farm is 16 quads per frame
 * instead of 4,096 — and combined with the dirty gate, usually zero frames at
 * all.
 *
 * Re-rendering is per chunk: changing one tile re-renders the 256 tiles around
 * it, not the world. Phase-03 tilling a tile therefore costs one chunk redraw.
 *
 * The chunk-index arithmetic lives in `terrain-chunks.ts` and is unit-tested
 * without a GPU; this module is only the Pixi half.
 */

// Container, RenderTexture, and Sprite are used as CONSTRUCTORS — they must be
// value imports. `eslint --fix` once collapsed this whole line to `import type`,
// which typechecks against the declarations and then fails at build time.
import { Container, RenderTexture, Sprite, type Renderer, type Texture } from 'pixi.js';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';
import { asTileIndex } from '../../shared/ids';
import type { TileKindRegistry } from '../../sim/content/tile-kinds';
import { getKind, type TileGrid } from '../../sim/world/tile-grid';

import { CHUNK_SIZE, chunkOrigin, type ChunkTracker } from './terrain-chunks';

const CHUNK_PIXELS = CHUNK_SIZE * TILE_SIZE;

export interface TerrainRenderer {
  /**
   * Re-renders stale chunks within the visible column range and returns how
   * many were redrawn. Zero means the frame cost nothing.
   */
  update(firstColumn: number, lastColumn: number): number;
  /** Sprites currently parented, i.e. draw calls contributed by terrain. */
  visibleChunkCount(): number;
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

  /** Reused scratch container — allocating one per chunk redraw would churn. */
  const scratch = new Container();

  const textureForKindIndex = (kindIndex: number): Texture => {
    const definition = tileKinds.byIndex(kindIndex);
    // An unknown index means the grid references a kind that is not registered
    // — a save from a build with more content, or a bug. Fall back to the first
    // kind rather than throwing inside a render pass.
    return textureFor(definition?.sprite ?? tileKinds.byIndex(0)?.sprite ?? '');
  };

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
        const sprite = new Sprite(textureForKindIndex(getKind(grid, tile)));
        sprite.x = tx * TILE_SIZE;
        sprite.y = ty * TILE_SIZE;
        scratch.addChild(sprite);
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
      layer.addChild(display);
      sprites.set(chunk, display);
    } else {
      display.texture = target;
    }
  };

  return {
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
