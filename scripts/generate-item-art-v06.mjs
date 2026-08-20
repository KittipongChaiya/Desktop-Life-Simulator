/**
 * Icons for the seven v0.6 processed goods. Phase-56 — ADR-046 R-03/R-04.
 *
 * `generate-icon-art.mjs` holds the v0.1–v0.4 icons and is already 585 lines;
 * these live beside it rather than in it, on the same reasoning that split the
 * crop generators (`CODE_STYLE.md`'s 800-line ceiling).
 *
 * **These exist because a test demanded them.** `sprite-keys.test.ts` failed
 * the moment the recipes landed, naming all seven — which is precisely what it
 * was written for after phase 25 shipped a mill and a kitchen pointing at art
 * that did not exist and drew nothing, silently, through a whole green suite.
 *
 * **The chain has to be legible as a chain.** Three of these are rungs of the
 * linen chain — fibre, thread, cloth — and a player looking at a Loom's queue
 * must be able to tell which rung they are short of. They share a family
 * (pale, fibrous, cream) and separate by FORM: a loose hank, a wound spool, a
 * folded bolt. Colour alone would have made three cream smudges.
 *
 * Canon: 16×16, one subject, centred, silhouette-first, 1 px safe margin
 * (ICON_GUIDE.md). Reward Gold stays reserved for coins (STYLE_LOCK R-09).
 *
 * Deterministic: no RNG. Run: `node scripts/generate-item-art-v06.mjs`, then
 * `npm run assets`.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  BLOOM_ROSE,
  CARROT_ORANGE,
  CREAM,
  CREAM_SHADE,
  GRASS_BASE,
  GRASS_LIGHT,
  GRASS_SHADOW,
  SOFT_INK,
  SOIL_DARK,
  STONE_LIGHT,
  STRAW,
  WARNING_AMBER,
  WOOD_BASE,
  WOOD_LIGHT,
  createCanvas,
  ellipse,
  outlineSilhouette,
  rect,
  set,
  writePng,
} from './lib/pixel-art.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */

/**
 * A stoppered preserve jar — the shared body for jam and sauce, which differ
 * only in what is inside. A player tells them apart by colour here because the
 * FORM is the honest one: they are the same jar.
 * @param {number[]} contents
 * @param {number[]} highlight
 * @returns {Canvas}
 */
function preserveJar(contents, highlight) {
  const canvas = createCanvas(16, 16);
  // Lid, then the glass shoulder, then the body.
  rect(canvas, 4, 2, 11, 4, WOOD_BASE);
  rect(canvas, 4, 2, 5, 4, WOOD_LIGHT);
  rect(canvas, 5, 5, 10, 5, CREAM_SHADE);
  rect(canvas, 3, 6, 12, 13, contents);
  rect(canvas, 3, 6, 4, 13, highlight);
  rect(canvas, 3, 13, 12, 13, SOIL_DARK);
  // The glass catches the light at the top-left, which is what makes it a jar
  // rather than a block of colour.
  set(canvas, 4, 7, CREAM);
  set(canvas, 5, 7, CREAM);
  set(canvas, 4, 8, CREAM);
  set(canvas, 11, 11, SOFT_INK);
  outlineSilhouette(canvas);
  return canvas;
}

/** @returns {Canvas} */
function itemJam() {
  return preserveJar(BLOOM_ROSE, CREAM_SHADE);
}

/** @returns {Canvas} */
function itemSauce() {
  return preserveJar(CARROT_ORANGE, WARNING_AMBER);
}

/** Coarse meal in an open bowl — flour is a tied sack, so this is not. @returns {Canvas} */
function itemCornmeal() {
  const canvas = createCanvas(16, 16);
  // Heaped meal first, so the bowl rim draws in front of it.
  ellipse(canvas, 8, 7.5, 4.6, 2.6, WARNING_AMBER, 0.15);
  ellipse(canvas, 7, 7, 3, 1.8, STRAW, 0.15);
  // Grains standing proud of the heap.
  for (const [gx, gy] of [
    [5, 6],
    [8, 5],
    [10, 6],
    [7, 6],
  ]) {
    set(canvas, gx, gy, STRAW);
  }
  // The bowl: a shallow arc, wider than the heap.
  ellipse(canvas, 8, 10, 6, 3.4, WOOD_BASE, 0.15);
  ellipse(canvas, 7, 9.4, 4.4, 2.2, WOOD_LIGHT, 0.15);
  rect(canvas, 2, 8, 13, 9, WOOD_LIGHT);
  rect(canvas, 4, 12, 11, 12, SOIL_DARK);
  outlineSilhouette(canvas);
  return canvas;
}

/** A bowl with a spoon standing in it — the only icon with cutlery. @returns {Canvas} */
function itemPorridge() {
  const canvas = createCanvas(16, 16);
  // The spoon, drawn first so the bowl overlaps its handle.
  rect(canvas, 10, 1, 11, 8, WOOD_BASE);
  rect(canvas, 10, 1, 10, 8, WOOD_LIGHT);
  ellipse(canvas, 11, 2, 2, 1.6, WOOD_LIGHT, 0.2);

  ellipse(canvas, 8, 8.5, 5, 2.4, CREAM, 0.15);
  ellipse(canvas, 7, 8, 3.4, 1.6, CREAM_SHADE, 0.15);
  // A swirl of leek through it, which is what the recipe actually puts in.
  for (const [sx, sy] of [
    [6, 8],
    [8, 9],
    [10, 8],
  ]) {
    set(canvas, sx, sy, GRASS_BASE);
  }
  ellipse(canvas, 8, 10.5, 6, 3.4, STONE_LIGHT, 0.15);
  ellipse(canvas, 7, 10, 4.4, 2.2, CREAM, 0.15);
  rect(canvas, 2, 9, 13, 10, STONE_LIGHT);
  rect(canvas, 4, 13, 11, 13, SOIL_DARK);
  outlineSilhouette(canvas);
  return canvas;
}

/** A loose hank, tied once — the roughest rung of the linen chain. @returns {Canvas} */
function itemLinenFibre() {
  const canvas = createCanvas(16, 16);
  // Splayed strands top and bottom, gathered at a tie in the middle. The
  // silhouette is an hourglass, which neither of the other two rungs has.
  for (const [x, top, bottom] of [
    [3, 2, 13],
    [5, 1, 14],
    [8, 1, 14],
    [11, 2, 13],
    [13, 3, 12],
  ]) {
    for (let y = Number(top); y <= Number(bottom); y += 1) {
      const pinch = Math.abs(y - 8) < 3 ? Math.sign(8 - Number(x)) : 0;
      set(canvas, Number(x) + pinch, y, y % 3 === 0 ? CREAM : CREAM_SHADE);
    }
  }
  // The tie.
  rect(canvas, 5, 7, 10, 9, WOOD_BASE);
  rect(canvas, 5, 7, 10, 7, WOOD_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

/** A wound spool — cylinder on an axle, nothing else in the set is round. @returns {Canvas} */
function itemThread() {
  const canvas = createCanvas(16, 16);
  // End caps, then the wound body between them.
  rect(canvas, 2, 3, 4, 12, WOOD_BASE);
  rect(canvas, 2, 3, 2, 12, WOOD_LIGHT);
  rect(canvas, 11, 3, 13, 12, WOOD_BASE);
  rect(canvas, 5, 4, 10, 11, CREAM);
  rect(canvas, 5, 4, 6, 11, CREAM_SHADE);
  // Winding lines, which is what says thread rather than a block.
  for (let y = 5; y <= 10; y += 2) {
    for (let x = 5; x <= 10; x += 1) set(canvas, x, y, CREAM_SHADE);
  }
  // A loose end trailing off, so it reads as wound rather than moulded.
  set(canvas, 11, 12, CREAM);
  set(canvas, 12, 13, CREAM_SHADE);
  set(canvas, 13, 14, CREAM);
  outlineSilhouette(canvas);
  return canvas;
}

/** A folded bolt — the finished rung, and the most valuable item in the game. @returns {Canvas} */
function itemCloth() {
  const canvas = createCanvas(16, 16);
  // Three stacked folds, each offset, so the edge steps like folded cloth.
  const FOLDS = [
    [1, 5, 13, 8],
    [2, 8, 14, 11],
    [1, 11, 13, 14],
  ];
  FOLDS.forEach(([x0, y0, x1, y1], index) => {
    const body = index === 1 ? CREAM_SHADE : CREAM;
    rect(canvas, Number(x0), Number(y0), Number(x1), Number(y1), body);
    rect(canvas, Number(x0), Number(y0), Number(x1), Number(y0), CREAM);
    rect(canvas, Number(x0), Number(y1), Number(x1), Number(y1), GRASS_SHADOW);
  });
  // A woven check, sparingly — the one mark that says this is cloth and not
  // paper, and the rose thread ties it to the loom's own hanging cloth.
  for (let x = 3; x <= 12; x += 3) {
    set(canvas, x, 6, BLOOM_ROSE);
    set(canvas, x, 12, BLOOM_ROSE);
  }
  for (let y = 6; y <= 13; y += 3) set(canvas, 7, y, GRASS_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

function main() {
  const dir = join(SRC, 'ui-world{tps}');
  mkdirSync(dir, { recursive: true });

  /** @type {[string, () => Canvas][]} */
  const ICONS = [
    ['item_cornmeal', itemCornmeal],
    ['item_porridge', itemPorridge],
    ['item_jam', itemJam],
    ['item_sauce', itemSauce],
    ['item_linen_fibre', itemLinenFibre],
    ['item_thread', itemThread],
    ['item_cloth', itemCloth],
  ];
  for (const [name, draw] of ICONS) writePng(join(dir, `${name}.png`), draw());

  globalThis.console.log(`items(v0.6): ${String(ICONS.length)} icons`);
}

main();
