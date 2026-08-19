/**
 * Composes a SCENE from the shipped art, at the size the player actually sees.
 *
 * The contact sheet (`generate-contact-sheet.mjs`) answers "is this asset any
 * good", one asset at a time, at 4×. It cannot answer the two questions the
 * cozy pass is actually judged on, because both are about assets TOGETHER:
 *
 *   - **Tier separation** (`ART_DIRECTION.md` §9.1). A density pass fails when
 *     a worker or a crop is lost inside the ground texture. You cannot see that
 *     by looking at the ground texture; you have to put a worker on it.
 *   - **Overlay-scale readability** (the brief, §14). The game sits in a small
 *     corner of somebody's desktop while they work. Art reviewed at 4× and
 *     shipped at 1× is art reviewed at a size nobody plays at.
 *
 * So this lays real terrain — with the same variant selection the renderer
 * uses, so the field looks like the field — stands real props and characters on
 * it, and emits the result at 1× and at 2× side by side. The 1× half is the
 * one that decides.
 *
 * Deterministic: the layout is seeded, so re-running produces the same scene
 * and two sheets can be compared as an actual before/after (ADR-006 §2).
 *
 * Run: `node scripts/generate-scene-sheet.mjs <out.png> [seed] [--seasons]`
 *      (`--seasons` stacks the scene under all four season tints instead)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  PARCHMENT,
  blitScaled,
  createCanvas,
  decodePng,
  fill,
  prng,
  writePng,
} from './lib/pixel-art.mjs';

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */

const SRC = join(import.meta.dirname, '..', 'assets', 'src');
const TILE = 32;

/** Tiles across and down. Roughly the visible area of a small overlay window. */
const COLS = 14;
const ROWS = 9;

/** @param {string} name @returns {string} */
const terrain = (name) => join(SRC, 'terrain{tps}', `${name}.png`);
/** @param {string} name @returns {string} */
const building = (name) => join(SRC, 'buildings{tps}', `${name}.png`);
/** @param {string} name @returns {string} */
const entity = (name) => join(SRC, 'entities{tps}', `${name}.png`);
/** @param {string} name @returns {string} */
const crop = (name) => join(SRC, 'crops{tps}', `${name}.png`);

/**
 * The renderer's variant hash, duplicated on purpose.
 *
 * `src/renderer/render/tile-variants.ts` is TypeScript inside the app's module
 * graph and this is a build-time script with no bundler. Copying six lines is
 * cheaper than either building the renderer to draw a review image or moving
 * shared code into a package for one caller. If they ever disagree the scene
 * sheet lies about the game, so the constants are named the same and the test
 * `tile-variants.test.ts` pins the behaviour both sides depend on.
 */
/** @param {number} value @returns {number} */
function mixIndex(value) {
  let hash = value | 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x21f0aaad);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x735a2d97);
  hash ^= hash >>> 15;
  return hash >>> 0;
}

const GRASS_VARIANTS = ['grass', 'grass_b', 'grass', 'grass_c'];
const TILLED_VARIANTS = ['tilled', 'tilled_b', 'tilled', 'tilled_c'];

/** Draws one sprite with its BOTTOM edge on a tile, the way the world does.
 * @param {Canvas} canvas
 * @param {Canvas} sprite
 * @param {number} col
 * @param {number} row
 * @returns {void}
 */
function stand(canvas, sprite, col, row) {
  const x = col * TILE + Math.floor((TILE - sprite.width) / 2);
  const y = (row + 1) * TILE - sprite.height;
  blitScaled(canvas, sprite, x, y, 1);
}

/** @param {number} seed @returns {Canvas} */
function buildScene(seed) {
  const canvas = createCanvas(COLS * TILE, ROWS * TILE);
  const rng = prng(seed);

  // ── Ground ────────────────────────────────────────────────────────────────
  // A farm on the left, a path down the middle, the wilds on the right — the
  // three regions the brief asks to be distinguishable at a glance (§8).
  /** @type {Map<string, Canvas>} */
  const tiles = new Map();
  for (const name of [
    ...new Set([...GRASS_VARIANTS, ...TILLED_VARIANTS]),
    'wild',
    'wild_b',
    'path',
  ]) {
    if (existsSync(terrain(name))) tiles.set(name, decodePng(terrain(name)));
  }

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const index = row * 112 + col; // the world's real row stride
      let name;
      if (col === 6) name = 'path';
      else if (col > 8) name = mixIndex(index) % 2 === 0 ? 'wild' : 'wild_b';
      else if (col < 5 && row > 2 && row < 7)
        name = TILLED_VARIANTS[mixIndex(index) % TILLED_VARIANTS.length];
      else name = GRASS_VARIANTS[mixIndex(index) % GRASS_VARIANTS.length];

      const tile = tiles.get(name);
      if (tile !== undefined) blitScaled(canvas, tile, col * TILE, row * TILE, 1);
    }
  }

  // ── Tier 2: structure ─────────────────────────────────────────────────────
  /** @type {Array<[string, number, number]>} */
  const structures = [
    ['cottage', 1, 1],
    ['mill', 7, 1],
    ['kitchen', 7, 7],
    ['well', 3, 8],
  ];
  for (const [name, col, row] of structures) {
    if (existsSync(building(name))) stand(canvas, decodePng(building(name)), col, row);
  }

  // ── Tier 3: atmosphere ────────────────────────────────────────────────────
  /** @type {Array<[string, number]>} */
  const props = [
    ['tree', 5],
    ['bush', 4],
    ['rock', 3],
    ['flower', 4],
  ];
  for (const [name, count] of props) {
    if (!existsSync(building(name))) continue;
    const sprite = decodePng(building(name));
    for (let i = 0; i < count; i += 1) {
      // Kept out of the farm block, so the props decorate rather than obscure.
      const col = 9 + Math.floor(rng() * (COLS - 9));
      const row = Math.floor(rng() * ROWS);
      stand(canvas, sprite, col, row);
    }
  }

  // ── Tier 1: the things that must never be lost ────────────────────────────
  // Crops on the tilled block, and workers walking the farm. If these do not
  // pop out of the scene at 1×, the ground texture is too loud and the fix is
  // LESS ground, not bigger workers (`ART_DIRECTION.md` §9.1).
  const cropNames = ['turnip_3', 'turnip_2', 'wheat_3', 'pumpkin_3'].filter((name) =>
    existsSync(crop(name)),
  );
  for (let row = 3; row < 7; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const name = cropNames[(row + col) % Math.max(1, cropNames.length)];
      if (name !== undefined) stand(canvas, decodePng(crop(name)), col, row);
    }
  }

  /** @type {Array<[string, number, number]>} */
  const people = [
    ['worker_idle_s', 2, 7],
    ['player_idle_s', 5, 2],
    ['villager_a_idle_s', 10, 4],
  ];
  for (const [name, col, row] of people) {
    if (existsSync(entity(name))) stand(canvas, decodePng(entity(name)), col, row);
  }

  return canvas;
}

/**
 * The four season tints from `plugins/core/content.ts`, applied the way the
 * renderer applies them: MULTIPLIED over the finished scene, so white means
 * "leave it alone". Duplicated here for the same reason `mixIndex` is.
 */
/** @type {Array<[string, number]>} */
const SEASONS = [
  ['spring', 0xf2fff4],
  ['summer', 0xffffff],
  ['autumn', 0xffcb80],
  ['winter', 0xc8d8f5],
];

/**
 * `core:rain`'s ground tint, multiplied over the season's the way
 * `world-view.ts` composes them. Rain was audible and invisible until
 * phase-33, so "what does rain look like" needs an answer you can look at.
 */
const RAIN_TINT = 0xc6d2e0;

/** @param {number} a @param {number} b @returns {number} */
const compose = (a, b) =>
  ((Math.round((((a >> 16) & 0xff) * ((b >> 16) & 0xff)) / 255) << 16) |
    (Math.round((((a >> 8) & 0xff) * ((b >> 8) & 0xff)) / 255) << 8) |
    Math.round(((a & 0xff) * (b & 0xff)) / 255)) >>>
  0;

/** @param {Canvas} scene @param {number} colour @returns {Canvas} */
function tinted(scene, colour) {
  const out = createCanvas(scene.width, scene.height);
  const tr = (colour >> 16) & 0xff;
  const tg = (colour >> 8) & 0xff;
  const tb = colour & 0xff;
  for (let i = 0; i < scene.px.length; i += 4) {
    out.px[i] = Math.round((scene.px[i] * tr) / 255);
    out.px[i + 1] = Math.round((scene.px[i + 1] * tg) / 255);
    out.px[i + 2] = Math.round((scene.px[i + 2] * tb) / 255);
    out.px[i + 3] = scene.px[i + 3];
  }
  return out;
}

function main() {
  const [out, seedArg] = globalThis.process.argv.slice(2);
  if (out === undefined) {
    globalThis.console.error('usage: generate-scene-sheet.mjs <out.png> [seed]');
    globalThis.process.exitCode = 1;
    return;
  }

  const scene = buildScene(Number(seedArg ?? 7) || 7);
  const pad = 10;

  // `--seasons`: the same scene four times, so the question "can a player tell
  // what month it is" has an answer instead of an intention. The brief (§12)
  // asks for seasons that feel like something; the tints are deliberately close
  // to white because this window sits beside real work for hours, and those two
  // pressures need to be looked at together rather than argued about.
  if (globalThis.process.argv.includes('--seasons')) {
    // Dry on the left, RAINING on the right — the same season, so the only
    // difference in a row is the weather.
    const wet = globalThis.process.argv.includes('--dry') ? 1 : 2;
    const sheet = createCanvas(
      scene.width * wet + pad * (wet + 1),
      (scene.height + pad) * SEASONS.length + pad,
    );
    fill(sheet, () => PARCHMENT);
    SEASONS.forEach(([, colour], index) => {
      const top = pad + index * (scene.height + pad);
      blitScaled(sheet, tinted(scene, colour), pad, top, 1);
      if (wet === 2) {
        blitScaled(sheet, tinted(scene, compose(colour, RAIN_TINT)), pad * 2 + scene.width, top, 1);
      }
    });
    writePng(out, sheet);
    globalThis.console.log(`season sheet: ${out} (${SEASONS.map(([n]) => n).join(', ')})`);
    return;
  }

  // 1× and 2×, side by side. The 1× is the review; the 2× is only there to
  // make individual pixels arguable when the 1× says something is wrong.
  const sheet = createCanvas(scene.width * 3 + pad * 3, scene.height * 2 + pad * 2);
  fill(sheet, () => PARCHMENT);
  blitScaled(sheet, scene, pad, pad, 1);
  blitScaled(sheet, scene, pad * 2 + scene.width, pad, 2);

  writePng(out, sheet);
  globalThis.console.log(
    `scene sheet: ${out} (${String(COLS)}x${String(ROWS)} tiles at 1x and 2x)`,
  );
}

main();
