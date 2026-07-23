/**
 * Generates the golden crop — wheat, all four growth stages — and the
 * production item icons. Phase-05.6b (vertical slice).
 *
 * Wheat fills the `crops:wheat_0..3` keys `src/sim/content/crops.ts` already
 * declares with no art behind them; the icons replace the phase-05d
 * placeholder discs file-for-file (ASSETS.md §7.3 — zero code change).
 *
 * Canon: 32×32 crop canvas, bottom-center pivot, grows upward
 * (PIXEL_GUIDE.md §2); full 1 px #3A3640 outline — crops are standing
 * objects (PIXEL_GUIDE.md §5); stages per GAME_DESIGN.md §3.3
 * (seed → sprout → growing → mature). Mature wheat is Straw — the light end
 * of the soil/wood ramp (COLOR_PALETTE.md §3.2); Reward Gold stays reserved
 * for coins (STYLE_LOCK.md R-09). Icons per ICON_GUIDE.md: one subject,
 * centred, silhouette-first, 16×16 with a 1 px safe margin.
 *
 * Deterministic (seeded PRNG only): re-runs are byte-identical.
 * Run: `node scripts/generate-crop-art.mjs`, then `npm run assets`.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  CARROT_ORANGE,
  GRASS_BASE,
  GRASS_LIGHT,
  GRASS_SHADOW,
  LEAF_HIGHLIGHT,
  PARCHMENT,
  PUMPKIN,
  SOFT_INK,
  SOIL_DARK,
  STONE_LIGHT,
  STRAW,
  WOOD_BASE,
  WOOD_LIGHT,
  alphaAt,
  contactShadow,
  createCanvas,
  ellipse,
  outlineSilhouette,
  prng,
  set,
  writePng,
} from './lib/pixel-art.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

// ── Shared shape language ────────────────────────────────────────────────────

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */
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
function lobes(canvas, list, colour, dx = 0, dy = 0, shrink = 1) {
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
 */
function sownMound(canvas, cx, groundY, rx) {
  ellipse(canvas, cx, groundY - 0.5, rx, 1.9, SOIL_DARK, 0.2);
  ellipse(canvas, cx - 0.5, groundY - 1, rx - 0.6, 1.2, WOOD_BASE, 0.2);
  // Seed specks catch the upper-left light.
  set(canvas, cx - 1, groundY - 2, STRAW);
  set(canvas, cx, groundY - 2, STRAW);
  set(canvas, cx + 1, groundY - 1, WOOD_LIGHT);
}

// ── Wheat growth stages (GAME_DESIGN.md §3.3) ────────────────────────────────

/** Stage 0 — seed: three sown mounds, nothing showing yet. @returns {Canvas} */
function wheatSeed() {
  const canvas = createCanvas(32, 32);
  sownMound(canvas, 8, 29, 2.5);
  sownMound(canvas, 16, 29, 3);
  sownMound(canvas, 24, 29, 2.5);
  outlineSilhouette(canvas);
  return canvas;
}

/** Stage 1 — sprout: young shoots break the mounds. @returns {Canvas} */
function wheatSprout() {
  const canvas = createCanvas(32, 32);
  sownMound(canvas, 8, 29, 2.5);
  sownMound(canvas, 16, 29, 3);
  sownMound(canvas, 24, 29, 2.5);
  // Shoots rise FROM the mounds — 2 px at each crown, 1 px stragglers — new
  // growth in Leaf Highlight (its documented role, COLOR_PALETTE.md §3.1),
  // lit column on the left.
  /** @type {[number, number, boolean][]} x, height, wide */
  const shoots = [
    [7, 6, true],
    [10, 3, false],
    [13, 4, false],
    [15, 8, true],
    [24, 5, true],
  ];
  for (const [x, height, wide] of shoots) {
    for (let i = 0; i < height; i += 1) {
      const y = 28 - i;
      const tip = i >= height - 2;
      set(canvas, x, y, tip ? LEAF_HIGHLIGHT : GRASS_LIGHT);
      if (wide) set(canvas, x + 1, y, tip ? GRASS_LIGHT : GRASS_BASE);
    }
    // One tiny side blade on the wide shoots.
    if (wide) set(canvas, x - 1, 28 - height + 3, GRASS_LIGHT);
  }
  outlineSilhouette(canvas);
  return canvas;
}

/**
 * Draws one grass blade: a vertical stroke that leans outward as it rises,
 * 2 px thick at the base thinning to a 1 px tip. Blades share edges near the
 * base so the outline wraps one clump, not a picket fence.
 * @param {Canvas} canvas
 * @param {number} baseX
 * @param {number} baseY
 * @param {number} height
 * @param {number} lean total x drift at the tip (signed)
 * @param {number[]} body
 * @param {number[]} tip
 */
function blade(canvas, baseX, baseY, height, lean, body, tip) {
  for (let i = 0; i < height; i += 1) {
    const x = baseX + Math.round((lean * i) / height);
    const y = baseY - i;
    const isTip = i >= height - 2;
    set(canvas, x, y, isTip ? tip : body);
    // Thick lower half.
    if (i < height / 2) set(canvas, x + 1, y, body);
  }
}

/** Stage 2 — growing: a waist-high fan of blades, first straw at the tips. @returns {Canvas} */
function wheatGrowing() {
  const canvas = createCanvas(32, 32);
  // Outer blades sit in shade, the crown catches the upper-left light —
  // drawn back-to-front so lit blades overlap shaded ones.
  blade(canvas, 8, 28, 9, -3, GRASS_SHADOW, GRASS_BASE);
  blade(canvas, 21, 28, 10, 3, GRASS_SHADOW, GRASS_BASE);
  blade(canvas, 10, 28, 12, -2, GRASS_BASE, GRASS_LIGHT);
  blade(canvas, 19, 28, 13, 2, GRASS_BASE, GRASS_LIGHT);
  blade(canvas, 12, 28, 15, -1, GRASS_LIGHT, LEAF_HIGHLIGHT);
  blade(canvas, 17, 28, 16, 1, GRASS_LIGHT, LEAF_HIGHLIGHT);
  blade(canvas, 15, 28, 14, 0, GRASS_BASE, LEAF_HIGHLIGHT);
  // Rooted: darken the clump's base row into the soil.
  for (let x = 9; x <= 22; x += 1) set(canvas, x, 28, GRASS_SHADOW);
  // The first hint of ripening on two tall tips.
  set(canvas, 17, 13, STRAW);
  set(canvas, 12, 15, STRAW);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29.5, 9, 1.6);
  return canvas;
}

/** Stage 3 — mature: the full golden sheaf, heads nodding, ready. @returns {Canvas} */
function wheatMature() {
  const canvas = createCanvas(32, 32);
  const rng = prng(1401);
  /** @type {Lobe[]} */
  const mass = [
    // Narrow at the ground, widest at the heads — stalks below, grain above.
    [16, 26.5, 4.5, 3],
    [16, 19, 8, 5.5],
    [16, 13, 7, 4.5],
    // The crown is five head bumps, not one blob — a sheaf, not a bush.
    [8.5, 12, 2.2, 3],
    [12, 9.5, 2.2, 3.2],
    [16, 8.5, 2.3, 3.4],
    [20, 9.5, 2.2, 3.2],
    [23.5, 12, 2.2, 3],
  ];
  lobes(canvas, mass, WOOD_LIGHT);
  lobes(canvas, mass, STRAW, -1, -1.5, 0.9);
  // Kernel texture across the head zone: the shade step speckled back in so
  // the crown reads as grain, not flat gold.
  for (let i = 0; i < 46; i += 1) {
    const x = 6 + Math.floor(rng() * 20);
    const y = 7 + Math.floor(rng() * 10);
    const dx = (x - 16) / 10.5;
    const dy = (y - 11) / 5.5;
    if (dx * dx + dy * dy <= 1) set(canvas, x, y, WOOD_LIGHT);
  }
  // Stem lines through the body: dry stalks in the sheaf's own shade steps,
  // running to the ground so the base reads as bound stalks, not a blob.
  // Painted only inside the mass (the 05.6a floating-speck lesson).
  /** @type {[number, number, number, number[]][]} x, y0, y1, colour */
  const stems = [
    [12, 17, 28, WOOD_BASE],
    [16, 17, 28, WOOD_LIGHT],
    [20, 17, 28, WOOD_BASE],
    [9, 20, 27, WOOD_LIGHT],
    [23, 20, 27, WOOD_LIGHT],
  ];
  for (const [x, y0, y1, colour] of stems) {
    for (let y = y0; y <= y1; y += 1) {
      if (alphaAt(canvas, x, y) === 255) set(canvas, x, y, colour);
    }
  }
  // Awns: short ticks off the crown, attached so the outline stays one line.
  set(canvas, 12, 6, STRAW);
  set(canvas, 16, 5, STRAW);
  set(canvas, 17, 5, STRAW);
  set(canvas, 20, 6, STRAW);
  set(canvas, 9, 9, STRAW);
  set(canvas, 24, 9, STRAW);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29.5, 10, 1.7);
  return canvas;
}

// ── Item icons (16×16, ICON_GUIDE.md) ────────────────────────────────────────

/** A tied sheaf — the harvest read, silhouette distinct from every other item. @returns {Canvas} */
function itemWheat() {
  const canvas = createCanvas(16, 16);
  // Three grain heads fanning above a tie, a clear gap between each so the
  // internal outline separates them (they merged when adjacent); kernels
  // alternate base/shade.
  /** @type {[number, number, number][]} cx, topY, height */
  const heads = [
    [4, 4, 6],
    [8, 3, 7],
    [12, 4, 6],
  ];
  for (const [cx, topY, height] of heads) {
    for (let i = 0; i < height; i += 1) {
      const y = topY + i;
      set(canvas, cx - 1, y, i % 2 === 0 ? STRAW : WOOD_LIGHT);
      set(canvas, cx, y, STRAW);
      set(canvas, cx + 1, y, i % 2 === 0 ? WOOD_LIGHT : STRAW);
    }
    set(canvas, cx, topY - 1, STRAW); // awn tick
  }
  // The tie band gathers all three, then the cut stalks flare below it.
  for (let x = 5; x <= 10; x += 1) {
    set(canvas, x, 10, WOOD_BASE);
    set(canvas, x, 11, WOOD_BASE);
  }
  set(canvas, 4, 10, STRAW);
  set(canvas, 11, 10, WOOD_LIGHT);
  set(canvas, 5, 12, STRAW);
  set(canvas, 4, 13, STRAW);
  set(canvas, 8, 12, WOOD_LIGHT);
  set(canvas, 8, 13, WOOD_LIGHT);
  set(canvas, 10, 12, WOOD_LIGHT);
  set(canvas, 11, 13, WOOD_BASE);
  outlineSilhouette(canvas);
  return canvas;
}

/** A pale round root with a leafy crown — Parchment-bodied (see GENERATION.md
 * note: the palette has no turnip blush; recorded for the validation report).
 * @returns {Canvas} */
function itemTurnip() {
  const canvas = createCanvas(16, 16);
  // Leafy crown, lit sprig on the left.
  set(canvas, 5, 2, GRASS_LIGHT);
  set(canvas, 5, 3, GRASS_BASE);
  set(canvas, 6, 4, GRASS_BASE);
  set(canvas, 7, 1, GRASS_LIGHT);
  set(canvas, 7, 2, GRASS_LIGHT);
  set(canvas, 7, 3, GRASS_BASE);
  set(canvas, 8, 4, GRASS_BASE);
  set(canvas, 10, 2, GRASS_BASE);
  set(canvas, 10, 3, GRASS_BASE);
  set(canvas, 9, 4, GRASS_SHADOW);
  // Bulb: shade layer then the lit body offset toward the light.
  ellipse(canvas, 7.5, 8.7, 4.6, 3.9, STONE_LIGHT, 0.15);
  ellipse(canvas, 7, 8.2, 4, 3.4, PARCHMENT, 0.15);
  // Root tip.
  set(canvas, 7, 12, STONE_LIGHT);
  set(canvas, 7, 13, STONE_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

/** The classic taper, fronds up top — Carrot Orange with Pumpkin as its
 * in-family shade step. @returns {Canvas} */
function itemCarrot() {
  const canvas = createCanvas(16, 16);
  // Fronds.
  set(canvas, 5, 2, GRASS_BASE);
  set(canvas, 5, 3, GRASS_BASE);
  set(canvas, 7, 1, GRASS_LIGHT);
  set(canvas, 7, 2, GRASS_LIGHT);
  set(canvas, 7, 3, GRASS_BASE);
  set(canvas, 9, 2, GRASS_BASE);
  set(canvas, 9, 3, GRASS_SHADOW);
  // Tapering body: per-row [x0, x1] spans, top to tip.
  /** @type {[number, number][]} */
  const rows = [
    [5, 9],
    [5, 9],
    [5, 9],
    [6, 9],
    [6, 8],
    [6, 8],
    [6, 7],
    [7, 7],
    [7, 7],
  ];
  for (let i = 0; i < rows.length; i += 1) {
    const [x0, x1] = rows[i] ?? [0, 0];
    const y = 4 + i;
    for (let x = x0; x <= x1; x += 1) {
      // Right edge and the tip sit in shade.
      const shaded = x === x1 || i >= rows.length - 2;
      set(canvas, x, y, shaded ? PUMPKIN : CARROT_ORANGE);
    }
  }
  // Ridge nicks.
  set(canvas, 6, 6, PUMPKIN);
  set(canvas, 7, 6, PUMPKIN);
  set(canvas, 6, 9, PUMPKIN);
  outlineSilhouette(canvas);
  return canvas;
}

/** Squat, ribbed, stemmed — nothing else shares this silhouette. @returns {Canvas} */
function itemPumpkin() {
  const canvas = createCanvas(16, 16);
  // Body: deep base with the lit front lobe toward the upper-left.
  ellipse(canvas, 7.5, 9.5, 5.6, 4, PUMPKIN, 0.15);
  ellipse(canvas, 6.8, 8.8, 3.6, 2.9, CARROT_ORANGE, 0.15);
  // Rib seams: Soft Ink, sparingly (PIXEL_GUIDE.md §5 interior lines).
  for (let y = 7; y <= 11; y += 1) {
    set(canvas, 4, y, SOFT_INK);
    set(canvas, 11, y, SOFT_INK);
  }
  // Stem and a single leaf curl.
  set(canvas, 7, 4, WOOD_BASE);
  set(canvas, 8, 4, WOOD_BASE);
  set(canvas, 7, 5, WOOD_BASE);
  set(canvas, 8, 5, WOOD_BASE);
  set(canvas, 9, 4, GRASS_BASE);
  outlineSilhouette(canvas);
  return canvas;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const cropsDir = join(SRC, 'crops{tps}');
  const uiDir = join(SRC, 'ui-world{tps}');
  mkdirSync(cropsDir, { recursive: true });

  writePng(join(cropsDir, 'wheat_0.png'), wheatSeed());
  writePng(join(cropsDir, 'wheat_1.png'), wheatSprout());
  writePng(join(cropsDir, 'wheat_2.png'), wheatGrowing());
  writePng(join(cropsDir, 'wheat_3.png'), wheatMature());

  writePng(join(uiDir, 'item_wheat.png'), itemWheat());
  writePng(join(uiDir, 'item_turnip.png'), itemTurnip());
  writePng(join(uiDir, 'item_carrot.png'), itemCarrot());
  writePng(join(uiDir, 'item_pumpkin.png'), itemPumpkin());

  globalThis.console.log('generated wheat_0..3 + 4 item icons');
}

main();
