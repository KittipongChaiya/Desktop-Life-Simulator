/**
 * Icons for the three v0.6 expedition destinations. Phase-59 — ADR-046 R-07/R-08.
 *
 * Three destinations could not make the map a decision: ordering them by travel
 * time gave exactly the ordering by yield value, so "how far can I afford to
 * send someone" had one answer. These three break that — and the map panel
 * shows them as 16×16 icons, so each has to say what it is at that size.
 *
 * The convention is `generate-icon-art.mjs`'s: a HORIZON across the base is what
 * makes an icon read as a place rather than as an object, and one vertical
 * element stops the shape being a bar. Each of these keeps both and differs in
 * the middle.
 *
 * Deterministic: no RNG. Run: `node scripts/generate-place-art-v06.mjs`, then
 * `npm run assets`.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  CREAM,
  GRASS_BASE,
  GRASS_LIGHT,
  GRASS_SHADOW,
  SOFT_INK,
  SOIL_DARK,
  STONE_BASE,
  STONE_DARK,
  STONE_LIGHT,
  TIMBER_DARK,
  WARNING_AMBER,
  WATER_BASE,
  WATER_DEEP,
  WATER_LIGHT,
  WOOD_BASE,
  WOOD_LIGHT,
  createCanvas,
  outlineSilhouette,
  rect,
  set,
  writePng,
} from './lib/pixel-art.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */

/** Dense trunks under a closed canopy — the near, cheap, timber trip. @returns {Canvas} */
function placeThornwood() {
  const canvas = createCanvas(16, 16);
  // Forest floor.
  rect(canvas, 1, 12, 14, 14, SOIL_DARK);
  rect(canvas, 1, 12, 14, 12, WOOD_BASE);

  // Trunks, THREE of them and close together — the read is density, which is
  // what separates this from a single tree standing in a field.
  for (const [x, top] of [
    [3, 6],
    [7, 4],
    [11, 7],
  ]) {
    rect(canvas, Number(x), Number(top), Number(x) + 1, 12, TIMBER_DARK);
    set(canvas, Number(x), Number(top) + 1, WOOD_BASE);
  }

  // One closed canopy across the top, not three separate blobs: a wood is a
  // roof of leaves with legs.
  rect(canvas, 1, 1, 14, 5, GRASS_SHADOW);
  rect(canvas, 2, 1, 13, 3, GRASS_BASE);
  rect(canvas, 3, 1, 9, 2, GRASS_LIGHT);
  for (const [gx, gy] of [
    [5, 5],
    [9, 5],
    [12, 4],
  ]) {
    set(canvas, gx, gy, GRASS_SHADOW);
  }
  // A thorn or two, which is the name.
  set(canvas, 2, 9, SOFT_INK);
  set(canvas, 13, 10, SOFT_INK);
  outlineSilhouette(canvas);
  return canvas;
}

/** Drowned walls standing in water — the long trip for cut stone. @returns {Canvas} */
function placeSunkenCoast() {
  const canvas = createCanvas(16, 16);
  // A high waterline: this place is mostly sea, which is the read that says
  // "far" before the tooltip does.
  rect(canvas, 1, 8, 14, 14, WATER_BASE);
  rect(canvas, 1, 8, 14, 8, WATER_LIGHT);
  rect(canvas, 1, 12, 14, 14, WATER_DEEP);
  for (const [wx, wy] of [
    [3, 10],
    [8, 9],
    [11, 11],
    [6, 13],
  ]) {
    set(canvas, wx, wy, WATER_LIGHT);
  }

  // Ruined walls breaking the surface — cut stone, half-standing, at three
  // different heights so it reads as a village rather than as rocks.
  for (const [x, top, w] of [
    [2, 4, 2],
    [6, 2, 3],
    [11, 5, 2],
  ]) {
    rect(canvas, Number(x), Number(top), Number(x) + Number(w), 11, STONE_BASE);
    rect(canvas, Number(x), Number(top), Number(x), 11, STONE_LIGHT);
    rect(canvas, Number(x), Number(top), Number(x) + Number(w), Number(top), STONE_LIGHT);
    // A course line, so the stone is cut rather than natural.
    rect(canvas, Number(x), Number(top) + 3, Number(x) + Number(w), Number(top) + 3, STONE_DARK);
  }
  // An empty window in the tallest wall — the detail that says somebody lived
  // here, which is the whole flavour of the place.
  rect(canvas, 7, 4, 8, 5, SOIL_DARK);
  outlineSilhouette(canvas);
  return canvas;
}

/** A cinder slope with an ember at its foot — short, rich, gated. @returns {Canvas} */
function placeAshfell() {
  const canvas = createCanvas(16, 16);
  rect(canvas, 1, 11, 14, 14, STONE_DARK);
  rect(canvas, 1, 11, 14, 11, STONE_BASE);

  // A steep scree slope falling left to right — the only diagonal in the set.
  for (let i = 0; i < 12; i += 1) {
    const x = 2 + i;
    const top = 9 - Math.floor(i * 0.55);
    rect(canvas, x, top, x, 11, STONE_BASE);
    set(canvas, x, top, STONE_LIGHT);
  }
  // Ash speckle over the slope.
  for (const [ax, ay] of [
    [4, 7],
    [7, 6],
    [9, 5],
    [11, 6],
    [6, 9],
  ]) {
    set(canvas, ax, ay, CREAM);
  }

  // The ember at the foot, which is the one warm mark and the reason the
  // description says the ground is still warm.
  rect(canvas, 3, 12, 5, 13, WARNING_AMBER);
  set(canvas, 4, 11, WARNING_AMBER);
  set(canvas, 3, 12, CREAM);
  // A cut adit into the slope — ore comes from somewhere.
  rect(canvas, 11, 8, 13, 10, SOIL_DARK);
  rect(canvas, 11, 8, 13, 8, WOOD_BASE);
  set(canvas, 11, 8, WOOD_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

function main() {
  const dir = join(SRC, 'ui-world{tps}');
  mkdirSync(dir, { recursive: true });
  writePng(join(dir, 'place_thornwood.png'), placeThornwood());
  writePng(join(dir, 'place_coast.png'), placeSunkenCoast());
  writePng(join(dir, 'place_ashfell.png'), placeAshfell());
  globalThis.console.log('places(v0.6): 3 icons');
}

main();
