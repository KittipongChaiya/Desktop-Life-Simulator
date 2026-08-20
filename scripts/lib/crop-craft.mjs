/**
 * The crop drawing vocabulary. Phase-55 — ADR-041, ADR-046 §1.
 *
 * These four helpers were written for the four v0.1 crops and lived inside
 * `generate-crop-art.mjs`. v0.6 authors eight more (ADR-046 R-01), and a second
 * generator needs the same hand — a crop drawn with a different vocabulary
 * reads as a different game, which is the finding ADR-041 opens with.
 *
 * **They are moved, not rewritten.** Every body below is the committed one,
 * character for character, so the four existing crops regenerate byte-identical
 * (ADR-006 §2) — and `art-regeneration.test.ts` is what proves that rather than
 * this sentence.
 *
 * The reason for a second generator rather than a longer first one is
 * `CODE_STYLE.md`'s 800-line ceiling: `generate-crop-art.mjs` is already 696
 * lines for four crops, and eight more would put it near a thousand.
 */

import {
  GRASS_BASE,
  SOIL_DARK,
  STRAW,
  WOOD_BASE,
  WOOD_LIGHT,
  createCanvas,
  ellipse,
  outlineSilhouette,
  set,
} from './pixel-art.mjs';

/** @typedef {import('./pixel-art.mjs').Canvas} Canvas */
/** @typedef {[number, number, number, number]} Lobe cx, cy, rx, ry */

/**
 * Paints a list of overlapping ellipse lobes — the same massed-silhouette
 * technique the 05.6a tree canopy and bush use, so the crop tuft reads as the
 * same hand. `dx/dy/shrink` let one lobe list be re-painted offset toward the
 * upper-left light for stepped shading (PIXEL_GUIDE.md §7).
 * @param {Canvas} canvas
 * @param {Lobe[]} list
 * @param {number[]} colour
 * @param {number} [dx]
 * @param {number} [dy]
 * @param {number} [shrink] multiplier on each lobe's radii
 */
export function lobes(canvas, list, colour, dx = 0, dy = 0, shrink = 1) {
  for (const [cx, cy, rx, ry] of list) {
    ellipse(canvas, cx + dx, cy + dy, rx * shrink, ry * shrink, colour, 0.15);
  }
}

/**
 * A small sown mound of freshly turned earth — the "planted here" read shared
 * by stages 0 and 1. Fresh-turned soil catches the light (Wood Base top over
 * a Soil Dark footing) so the mound separates from the tilled tile beneath it,
 * with straw seed specks on the lit side.
 * @param {Canvas} canvas
 * @param {number} cx
 * @param {number} groundY
 * @param {number} rx
 * @param {number[]} [accent]
 */
export function sownMound(canvas, cx, groundY, rx, accent = STRAW) {
  ellipse(canvas, cx, groundY - 0.5, rx, 1.9, SOIL_DARK, 0.2);
  ellipse(canvas, cx - 0.5, groundY - 1, rx - 0.6, 1.2, WOOD_BASE, 0.2);
  // Seed specks catch the upper-left light. The accent names the crop at the
  // one stage where nothing else can — a seed in soil is a seed in soil.
  // Defaulted to Straw so wheat's committed art stays byte-identical.
  set(canvas, cx - 1, groundY - 2, accent);
  set(canvas, cx, groundY - 2, accent);
  set(canvas, cx + 1, groundY - 1, WOOD_LIGHT);
}

/**
 * A leaf blade: a thick 1–2 px stroke that leans and tapers to a tip colour.
 * @param {Canvas} canvas
 * @param {number} baseX
 * @param {number} baseY
 * @param {number} height
 * @param {number} lean total x drift at the tip (signed)
 * @param {number[]} body
 * @param {number[]} tip
 */
export function blade(canvas, baseX, baseY, height, lean, body, tip) {
  for (let i = 0; i < height; i += 1) {
    const x = baseX + Math.round((lean * i) / height);
    const y = baseY - i;
    const isTip = i >= height - 2;
    set(canvas, x, y, isTip ? tip : body);
    // Thick lower half.
    if (i < height / 2) set(canvas, x + 1, y, body);
  }
}

/**
 * A feathery frond: a 1 px stroke that leans and tapers, with side ticks that
 * alternate as it rises. Thin where wheat is thick, which is what keeps the two
 * apart at 1x even before either shows colour.
 * @param {Canvas} canvas
 * @param {number} baseX
 * @param {number} baseY
 * @param {number} height
 * @param {number} lean total x drift at the tip (signed)
 * @param {number[]} body
 * @param {number[]} tip
 */
export function frond(canvas, baseX, baseY, height, lean, body, tip) {
  for (let i = 0; i < height; i += 1) {
    const x = baseX + Math.round((lean * i) / height);
    const y = baseY - i;
    set(canvas, x, y, i >= height - 2 ? tip : body);
    // Side ticks on alternating flanks — the feathered read.
    if (i >= 2 && i % 2 === 0) set(canvas, x + (i % 4 === 0 ? 1 : -1), y, body);
  }
}

/**
 * A bare upright stem — the support a climbing crop is trained up.
 *
 * New in v0.6 and the one addition to the vocabulary, because two of the eight
 * new crops climb and nothing in the v0.1 set does. A cane is what separates a
 * tomato from every round-fruited thing in the game at 1×, before colour.
 * @param {Canvas} canvas
 * @param {number} x
 * @param {number} baseY
 * @param {number} height
 * @param {number[]} [colour]
 */
export function cane(canvas, x, baseY, height, colour = WOOD_BASE) {
  for (let i = 0; i < height; i += 1) {
    set(canvas, x, baseY - i, i % 3 === 2 ? GRASS_BASE : colour);
  }
}

/**
 * A burlap seed pouch, cinched at the neck, with the crop's signature colour
 * as the seeds spilling on its shaded face (phase-06b: seeds became
 * purchasable, consumable items).
 *
 * Moved here in phase-55 unchanged: twelve crops need twelve pouches, and
 * every one of them is this function called with a different accent. Burlap in
 * the wood ramp; the accent dots sit on the Wood Base side so every crop's
 * colour reads against it.
 * @param {number[]} accent the crop's signature colour
 * @returns {Canvas}
 */
export function itemSeedPouch(accent) {
  const canvas = createCanvas(16, 16);
  // Gathered cloth above the tie, splayed like a cut sheaf.
  set(canvas, 6, 2, WOOD_LIGHT);
  set(canvas, 8, 1, WOOD_LIGHT);
  set(canvas, 8, 2, WOOD_BASE);
  set(canvas, 10, 2, WOOD_BASE);
  set(canvas, 7, 3, WOOD_BASE);
  set(canvas, 8, 3, WOOD_BASE);
  set(canvas, 9, 3, WOOD_BASE);
  // The drawstring cinch.
  for (let x = 6; x <= 10; x += 1) set(canvas, x, 4, SOIL_DARK);
  // Body: base sack, then the lit face toward the upper-left light (R-06).
  ellipse(canvas, 8, 9.5, 4.8, 4.4, WOOD_BASE, 0.15);
  ellipse(canvas, 7, 8.6, 3, 2.8, WOOD_LIGHT, 0.15);
  // Seeds on the shaded face — three dots, paired pixels so they read at 1x.
  set(canvas, 10, 8, accent);
  set(canvas, 11, 8, accent);
  set(canvas, 9, 10, accent);
  set(canvas, 10, 11, accent);
  set(canvas, 11, 11, accent);
  set(canvas, 7, 12, accent);
  outlineSilhouette(canvas);
  return canvas;
}
