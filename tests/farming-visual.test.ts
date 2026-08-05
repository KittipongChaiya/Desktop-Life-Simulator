/**
 * Farming visual regression.
 *
 * Composes the frame the game WOULD draw at each point of the farming loop —
 * the terrain sprite, then the crop sprite over it — using the same two
 * functions the renderer uses (`tileSpriteKey` and `projectCrops`), driven by a
 * real simulation rather than by hand-written state. Every frame is compared
 * byte-for-byte against a committed reference.
 *
 * WHAT THIS CATCHES: a repainted crop, a stage threshold that moved, a crop
 * that stops being projected, tilled soil that stops being drawn — or that
 * stops being CLEARED, since 07.9 hands a harvested tile back to bare ground —
 * a sprite key that stops resolving: the whole decision path from world state
 * to pixels, plus the art behind it. All of that shipped broken once already:
 * tilling and planting produced no visual change whatsoever, and nothing
 * failed.
 *
 * WHAT IT DOES NOT CATCH: anything that needs a GPU — z-ordering inside the
 * `objects` layer, camera transforms, the dirty gate, atlas packing. Those have
 * no unit-testable surface and stay with the Playwright suite.
 *
 * After an INTENTIONAL art or stage change, regenerate and review by eye:
 *   UPDATE_FARMING_REFERENCE=1 npx vitest run tests/farming-visual.test.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  blitScaled,
  createCanvas,
  decodePng,
  encodePng,
  type Canvas,
} from '../scripts/lib/pixel-art.mjs';
import { harvestCrop, plantCrop, tillTile } from '../src/sim/commands/crop-commands';
import { CORE_TURNIP, STAGE_THRESHOLDS } from '../src/sim/content/crops';
import { DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems } from '../src/sim/world/container';
import { createWorld, type World } from '../src/sim/world/world';
import { TILE_SIZE } from '../src/shared/constants';
import { toIndexUnchecked } from '../src/shared/geometry';
import type { TileIndex } from '../src/shared/ids';
import { projectCrops } from '../src/sim/snapshot/crops-slice';
import { tileSpriteKey } from '../src/renderer/render/terrain-tiles';

const REFERENCE_DIR = join(import.meta.dirname, 'fixtures', 'farming-stages');
const SOURCE_DIR = join(import.meta.dirname, '..', 'assets', 'src');
const UPDATING = process.env.UPDATE_FARMING_REFERENCE === '1';

/** The tile every frame is composed for — inside the starting plot. */
const TILE: TileIndex = toIndexUnchecked(30, 30);

/**
 * Resolves a manifest sprite key to its SOURCE png.
 *
 * Deliberately the authored art in `assets/src`, not the packed atlas: a
 * reference that moved because the packer rearranged frames would fail for a
 * reason nobody can act on.
 */
function spriteCanvas(spriteKey: string): Canvas {
  const [atlas, frame] = spriteKey.split(':');
  return decodePng(join(SOURCE_DIR, `${atlas ?? ''}{tps}`, `${frame ?? ''}.png`));
}

/** The composed frame for one tile: terrain, then the crop standing on it. */
function composeFrame(world: World, tile: TileIndex): Canvas {
  const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
  blitScaled(canvas, spriteCanvas(tileSpriteKey(world.tiles, world.tileKinds, tile)), 0, 0, 1);

  const crop = projectCrops(world).find((view) => view.tile === tile);
  if (crop !== undefined && crop.sprite !== '') {
    blitScaled(canvas, spriteCanvas(crop.sprite), 0, 0, 1);
  }
  return canvas;
}

/**
 * Asserts one frame against its reference, or writes it when updating.
 *
 * A mismatch also writes the actual frame beside the reference, so the two can
 * be opened side by side instead of guessing what moved.
 */
function expectFrame(name: string, world: World): void {
  const actual = Buffer.from(encodePng(composeFrame(world, TILE)));
  const path = join(REFERENCE_DIR, `${name}.png`);

  if (UPDATING) {
    mkdirSync(REFERENCE_DIR, { recursive: true });
    writeFileSync(path, actual);
    return;
  }

  let reference: Buffer;
  try {
    reference = readFileSync(path);
  } catch {
    throw new Error(
      `no reference frame for "${name}". ` +
        `Generate with: UPDATE_FARMING_REFERENCE=1 npx vitest run tests/farming-visual.test.ts`,
    );
  }

  if (!actual.equals(reference)) {
    writeFileSync(join(REFERENCE_DIR, `${name}.actual.png`), actual);
    throw new Error(
      `farming frame "${name}" changed. Compare ${name}.png with ${name}.actual.png. ` +
        `If the change is intended: UPDATE_FARMING_REFERENCE=1 npx vitest run tests/farming-visual.test.ts`,
    );
  }
}

/** Ticks from planting at which each growth stage first shows. */
function stageStart(world: World, stage: number): number {
  const definition = world.cropRegistry.get(CORE_TURNIP);
  if (!definition.ok) throw new Error('setup failed');
  return Math.ceil(definition.value.growthTicks * (STAGE_THRESHOLDS[stage] ?? 0));
}

/** A farm holding turnip seed and nothing else. Turnip is the DEFAULT seed. */
function freshFarm(): World {
  const world = createWorld(1);
  const definition = world.cropRegistry.get(CORE_TURNIP);
  if (!definition.ok) throw new Error('setup failed');
  addItems(world.inventory, definition.value.seedItem, 4, DEFAULT_STACK_SIZE);
  return world;
}

describe('the farming loop is visible at every step', () => {
  it('renders a distinct frame for each stage, matching its reference', () => {
    const world = freshFarm();

    expectFrame('00-empty', world);

    tillTile(world, TILE);
    expectFrame('01-tilled', world);

    plantCrop(world, TILE, CORE_TURNIP);
    expectFrame('02-planted-seed', world);

    stepSimulationBy(world, stageStart(world, 1));
    expectFrame('03-sprout', world);

    stepSimulationBy(world, stageStart(world, 2) - world.tick);
    expectFrame('04-growing', world);

    stepSimulationBy(world, stageStart(world, 3) - world.tick);
    expectFrame('05-mature', world);

    harvestCrop(world, TILE);
    expectFrame('06-harvested', world);
  });

  it('never draws the same frame twice across the loop', () => {
    // The failure this whole file exists for: every step LOOKING identical
    // while the simulation advances correctly underneath.
    const world = freshFarm();
    const frames: string[] = [];
    const capture = (): void => {
      frames.push(Buffer.from(encodePng(composeFrame(world, TILE))).toString('base64'));
    };

    capture(); // empty
    tillTile(world, TILE);
    capture(); // tilled
    plantCrop(world, TILE, CORE_TURNIP);
    capture(); // seed
    for (const stage of [1, 2, 3]) {
      stepSimulationBy(world, stageStart(world, stage) - world.tick);
      capture();
    }

    expect(new Set(frames).size).toBe(frames.length);
  });

  it('returns to bare ground after a harvest, not to the tilled frame (07.9)', () => {
    // Harvesting takes the crop AND the tilling: the tile goes back to the
    // ground it started as, and it has to LOOK that way or the player plants
    // into soil that is no longer there and the game rejects it.
    const world = freshFarm();
    const bare = Buffer.from(encodePng(composeFrame(world, TILE)));

    tillTile(world, TILE);
    const tilled = Buffer.from(encodePng(composeFrame(world, TILE)));

    plantCrop(world, TILE, CORE_TURNIP);
    stepSimulationBy(world, stageStart(world, 3));
    harvestCrop(world, TILE);

    const harvested = Buffer.from(encodePng(composeFrame(world, TILE)));
    expect(harvested.equals(bare)).toBe(true);
    expect(harvested.equals(tilled)).toBe(false);
  });
});
