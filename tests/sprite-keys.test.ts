/**
 * Every declared sprite key resolves to a real frame. Phase-25.
 *
 * ## The bug this exists to prevent, which already happened once
 *
 * `world-view.ts` resolves a sprite key to a texture like this:
 *
 *     sheets[atlas]?.textures[`${frame}.png`] ?? Texture.EMPTY
 *
 * A key naming art that does not exist therefore does not throw, does not warn,
 * and does not fail any test. It draws NOTHING. Phase-25 introduced
 * `core:mill` and `core:kitchen` pointing at `mill.png` and `kitchen.png`,
 * neither of which is in the atlas, and the entire unit suite stayed green —
 * because sprite keys are a renderer concern and no unit test had ever read
 * one. The mistake surfaced only because a live screenshot pass happened to be
 * taken (`ASSET_CATALOG.md` §2.1).
 *
 * A wrong-looking building is a bug a player reports. An invisible one is a bug
 * nobody can describe, and this is the gate that stops the second kind reaching
 * a player again.
 *
 * ## Why this is a content test rather than a render test
 *
 * The atlas JSON is data on disk and the definitions are data in registries —
 * both readable with no DOM, no Pixi and no Electron, so this runs in the plain
 * unit environment where it costs milliseconds. Putting it behind the E2E suite
 * would make the cheapest possible check the most expensive one to run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createInstalledRegistries } from '../src/sim/content/installed';
import { TILLED_SPRITE, WILD_SPRITE } from '../src/sim/content/tile-kinds';

const ATLAS_DIR = join(__dirname, '..', 'assets', 'dist');

/** Frame names an atlas sheet declares, without the `.png` suffix. */
function framesOf(atlas: string): ReadonlySet<string> {
  const sheet = JSON.parse(readFileSync(join(ATLAS_DIR, `${atlas}.json`), 'utf8')) as {
    frames?: Record<string, unknown>;
  };
  return new Set(Object.keys(sheet.frames ?? {}).map((frame) => frame.replace(/\.png$/, '')));
}

/**
 * Resolves a `atlas:frame` key exactly as `world-view.ts` does — a key with no
 * colon falls back to the terrain sheet.
 */
function resolves(spriteKey: string): boolean {
  const [atlas, frame] = spriteKey.includes(':')
    ? (spriteKey.split(':') as [string, string])
    : (['terrain', spriteKey] as [string, string]);
  try {
    return framesOf(atlas).has(frame);
  } catch {
    return false; // no such atlas
  }
}

describe('every declared sprite key names art that exists', () => {
  const registries = createInstalledRegistries();

  it('for every building', () => {
    const missing = registries.buildings
      .all()
      .filter((building) => !resolves(building.sprite))
      .map((building) => `${building.id} → ${building.sprite}`);

    expect(missing, 'these buildings would draw nothing at all').toEqual([]);
  });

  it('for every crop, at every growth stage', () => {
    const missing = registries.crops
      .all()
      .flatMap((crop) =>
        crop.stageSprites
          .filter((sprite) => !resolves(sprite))
          .map((sprite) => `${crop.id} → ${sprite}`),
      );

    expect(missing, 'these crop stages would draw nothing at all').toEqual([]);
  });

  it('for every tile kind', () => {
    const missing = registries.tileKinds
      .all()
      .filter((kind) => kind.sprite !== undefined && !resolves(kind.sprite))
      .map((kind) => `${kind.id} → ${String(kind.sprite)}`);

    expect(missing, 'these tiles would draw nothing at all').toEqual([]);
  });

  it('for every resource node in the wilds', () => {
    // Same trap, one phase later and worse: a node whose sprite is missing is
    // a gatherable thing drawn as nothing, so a worker would walk to an empty
    // tile, stand there, and come back carrying wood.
    const missing = registries.resourceNodes
      .all()
      .filter((node) => !resolves(node.sprite))
      .map((node) => `${node.id} → ${node.sprite}`);

    expect(missing, 'these nodes would draw nothing at all').toEqual([]);
  });

  it('for the two sprites that belong to no definition at all', () => {
    // TILLED SOIL and WILD GROUND are render-time OVERRIDES, not tile kinds
    // (`terrain-tiles.ts`), so no registry names them and every loop above
    // misses them. Tilled soil has already been shipped invisible once — the
    // atlas held the art and no code path reached it (CHANGELOG, phase-07.7).
    const missing = [TILLED_SPRITE, WILD_SPRITE].filter((sprite) => !resolves(sprite));

    expect(missing, 'these overrides would draw nothing at all').toEqual([]);
  });

  it('catches a key naming art that does not exist', () => {
    // The check has to be able to fail, or it is decoration. This is the exact
    // shape of the phase-25 mistake.
    expect(resolves('buildings:definitely_not_real')).toBe(false);
    expect(resolves('nosuchatlas:anything')).toBe(false);
  });
});
