/**
 * The three v0.6 buildings. Phases 56–57 — ADR-046 R-04/R-05, ADR-041, ADR-042.
 *
 * Before v0.6 exactly one purchasable building cost more than the Market Stall,
 * which is stage 4's unlock. That is the shape of a game that ends: the arc's
 * last rung was the last thing to buy. These three go above it and relieve
 * different bottlenecks — two more factories would have been the same rung at
 * two more prices.
 *
 * | Building        | Footprint | Canvas  | Relieves            |
 * | --------------- | --------- | ------- | ------------------- |
 * | Preserving Shed | 2×2       | 64×72   | one cooker          |
 * | Loom            | 3×2       | 96×88   | chain depth         |
 * | Granary         | 3×3       | 96×120  | storage at scale    |
 *
 * **Silhouette first, and against a crowded field.** Ten buildings already
 * stand on this farm, so each of these commits to a shape none of them has:
 * the shed is open-fronted with SHELVES OF JARS, the loom shows the warp frame
 * itself through a wide opening, and the granary is the only structure in the
 * game RAISED OFF THE GROUND on staddle stones. The granary needed that
 * because it shares a 3×3 footprint with the mill, which is the one collision
 * a 96×120 canvas makes easy to walk into.
 *
 * Canvas sizes follow the existing convention in `generate-world-art.mjs`:
 * 32 px per tile of width, with head-room above the footprint for roofs.
 *
 * Deterministic (seeded PRNG only): re-runs are byte-identical (ADR-006 §2).
 * Run: `node scripts/generate-building-art-v06.mjs`, then `npm run assets`.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  BIRCH_PALE,
  BLOOM_ROSE,
  CREAM,
  CREAM_SHADE,
  GRASS_BASE,
  GRASS_LIGHT,
  ROOF_CLAY,
  ROOF_MOSS,
  ROOF_SLATE,
  ROOF_SLATE_DEEP,
  ROOF_SLATE_LIGHT,
  ROOF_TERRACOTTA,
  SOFT_INK,
  SOIL_DARK,
  STONE_WARM,
  STONE_WARM_DARK,
  STONE_WARM_LIGHT,
  STRAW,
  TIMBER_DARK,
  TIMBER_WARM,
  WARNING_AMBER,
  WOOD_BASE,
  WOOD_LIGHT,
  contactShadow,
  createCanvas,
  ellipse,
  outlineSilhouette,
  prng,
  rect,
  set,
  writePng,
} from './lib/pixel-art.mjs';
import { ditherBand, line, material, polygon } from './lib/pixel-craft.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */

/**
 * A pitched roof as two ramped faces meeting at a ridge.
 * @param {Canvas} canvas
 * @param {number} x0 left eave
 * @param {number} x1 right eave
 * @param {number} eaveY
 * @param {number} ridgeY
 * @param {number[]} base
 * @param {number[]} dark
 * @param {number[]} light
 */
function pitchedRoof(canvas, x0, x1, eaveY, ridgeY, base, dark, light) {
  const mid = Math.floor((x0 + x1) / 2);
  polygon(
    canvas,
    [
      [x0, eaveY],
      [mid, ridgeY],
      [x1, eaveY],
    ],
    base,
  );
  // The lit face is the left one — the light is upper-left throughout
  // (PIXEL_GUIDE.md §7).
  polygon(
    canvas,
    [
      [x0 + 1, eaveY - 1],
      [mid, ridgeY + 1],
      [mid, eaveY - 1],
    ],
    light,
  );
  material.shingles(canvas, x0, ridgeY, x1, eaveY, base, dark, light);
  // Ridge cap and eave line, which is what stops a roof reading as a triangle.
  line(canvas, mid - 1, ridgeY, mid + 1, ridgeY, light);
  line(canvas, x0, eaveY, x1, eaveY, dark);
}

// ── Preserving Shed — open-fronted, shelves of jars (2×2) ────────────────────

/** @returns {Canvas} */
function preservingShed() {
  const canvas = createCanvas(64, 72);
  const rng = prng(1601);
  const groundY = 71;

  // A low stone footing under a timber frame — the shed is squat and wide.
  material.masonry(
    canvas,
    8,
    groundY - 12,
    56,
    groundY,
    STONE_WARM,
    STONE_WARM_DARK,
    STONE_WARM_LIGHT,
    17,
  );
  material.planks(canvas, 8, 26, 56, groundY - 12, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 19);
  pitchedRoof(canvas, 4, 60, 26, 10, ROOF_CLAY, ROOF_TERRACOTTA, ROOF_MOSS);

  // THE OPEN FRONT. The shed's whole identity is that you can see into it, so
  // the dark interior is cut out first and everything below is lit against it.
  rect(canvas, 14, 34, 50, groundY - 13, SOIL_DARK);
  ditherBand(canvas, 14, 34, 50, 42, TIMBER_DARK, SOIL_DARK);

  // Two shelves of jars. Three colours of preserve so the shelf reads as
  // CONTENTS rather than as texture — this is the one thing no other building
  // on the farm shows.
  /** @type {[number, number[][]][]} shelfY, the preserves along it */
  const SHELVES = [
    [44, [BLOOM_ROSE, WARNING_AMBER, BLOOM_ROSE, STRAW]],
    [54, [WARNING_AMBER, STRAW, BLOOM_ROSE, WARNING_AMBER]],
  ];
  for (const [shelfY, colours] of SHELVES) {
    line(canvas, 15, shelfY + 1, 49, shelfY + 1, WOOD_BASE);
    line(canvas, 15, shelfY + 2, 49, shelfY + 2, TIMBER_DARK);
    colours.forEach((colour, index) => {
      const jarX = 20 + index * 9;
      // Body, lit shoulder, then the pale lid every jar shares.
      rect(canvas, jarX - 3, shelfY - 6, jarX + 2, shelfY, colour);
      rect(canvas, jarX - 3, shelfY - 6, jarX - 2, shelfY - 1, CREAM_SHADE);
      rect(canvas, jarX - 3, shelfY - 8, jarX + 2, shelfY - 7, CREAM);
      set(canvas, jarX + 2, shelfY - 5, SOFT_INK);
    });
  }

  // A barrel outside the door, and a crate — the working clutter that says the
  // building is used rather than placed.
  ellipse(canvas, 56, groundY - 6, 5, 6, WOOD_BASE, 0.15);
  ellipse(canvas, 55, groundY - 7, 3.4, 4.4, WOOD_LIGHT, 0.15);
  for (const y of [groundY - 9, groundY - 4]) line(canvas, 51, y, 61, y, TIMBER_DARK);
  rect(canvas, 2, groundY - 8, 12, groundY - 1, WOOD_BASE);
  rect(canvas, 2, groundY - 8, 12, groundY - 7, WOOD_LIGHT);
  line(canvas, 2, groundY - 5, 12, groundY - 5, TIMBER_DARK);

  // A few sprigs of herbs hung to dry under the eave.
  for (const x of [18, 24, 44]) {
    line(canvas, x, 30, x, 34, GRASS_BASE);
    set(canvas, x - 1, 34, GRASS_LIGHT);
    set(canvas, x + 1, 33, GRASS_LIGHT);
  }
  void rng;

  outlineSilhouette(canvas);
  contactShadow(canvas, 32, groundY + 0.5, 30, 3);
  return canvas;
}

// ── Loom — a workshop showing its warp frame (3×2) ───────────────────────────

/** @returns {Canvas} */
function loom() {
  const canvas = createCanvas(96, 88);
  const groundY = 87;

  material.masonry(
    canvas,
    10,
    groundY - 8,
    86,
    groundY,
    STONE_WARM,
    STONE_WARM_DARK,
    STONE_WARM_LIGHT,
    23,
  );
  material.boards(canvas, 10, 30, 86, groundY - 8, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 29);
  pitchedRoof(canvas, 6, 90, 30, 8, ROOF_SLATE, ROOF_SLATE_DEEP, ROOF_SLATE_LIGHT);

  // THE WIDE OPENING, and the loom standing in it. A player must be able to see
  // the machine — a weaving shed that reads as a shed is a shed.
  rect(canvas, 22, 40, 74, groundY - 9, SOIL_DARK);

  // The frame: two uprights and two crossbeams, pale against the dark interior.
  for (const x of [28, 68]) rect(canvas, x, 42, x + 2, groundY - 10, WOOD_LIGHT);
  for (const y of [44, groundY - 22]) rect(canvas, 28, y, 70, y + 2, WOOD_BASE);

  // The WARP: vertical threads across the frame. Spaced three apart so they
  // read as threads at 1x instead of blurring into a panel.
  for (let x = 32; x <= 66; x += 3) {
    line(canvas, x, 46, x, groundY - 23, CREAM_SHADE);
    set(canvas, x, 47, CREAM);
  }
  // Woven cloth gathering at the bottom of the frame — the output, visible.
  rect(canvas, 30, groundY - 22, 68, groundY - 16, CREAM);
  rect(canvas, 30, groundY - 22, 68, groundY - 21, CREAM_SHADE);
  for (let x = 32; x <= 66; x += 6) set(canvas, x, groundY - 19, CREAM_SHADE);

  // CLOTH HUNG OUT TO AIR, breaking the outline.
  //
  // Without this the loom is a rectangle under a pitched roof, which is the
  // storage shed's silhouette at a different size — and a player reads the
  // OUTLINE first (ADR-041). Three lengths of cloth on a rail past the left
  // eave push the shape asymmetric and put the building's product on the
  // outside, where it can be seen without looking into the doorway.
  rect(canvas, 0, 34, 20, 36, WOOD_BASE);
  rect(canvas, 0, 34, 20, 35, WOOD_LIGHT);
  const HANGING = [
    [2, 30, CREAM, CREAM_SHADE],
    [9, 24, BLOOM_ROSE, CREAM_SHADE],
    [15, 27, CREAM_SHADE, CREAM],
  ];
  for (const [hx, length, body, shade] of HANGING) {
    const x = Number(hx);
    const drop = 36 + Number(length);
    rect(canvas, x, 36, x + 4, drop, /** @type {number[]} */ (body));
    rect(canvas, x, 36, x + 1, drop, /** @type {number[]} */ (shade));
    // A ragged hem, so the cloth hangs rather than sits.
    set(canvas, x + 1, drop + 1, /** @type {number[]} */ (body));
    set(canvas, x + 3, drop + 1, /** @type {number[]} */ (shade));
  }

  // A bolt of finished cloth leaning outside, and a basket of thread.
  rect(canvas, 78, groundY - 20, 86, groundY - 1, CREAM);
  rect(canvas, 78, groundY - 20, 80, groundY - 1, CREAM_SHADE);
  line(canvas, 78, groundY - 12, 86, groundY - 12, BLOOM_ROSE);
  ellipse(canvas, 24, groundY - 5, 6, 4, WOOD_BASE, 0.15);
  for (const [tx, ty] of [
    [21, groundY - 8],
    [26, groundY - 9],
    [24, groundY - 7],
  ]) {
    ellipse(canvas, tx, ty, 2.2, 2, CREAM, 0.2);
  }

  outlineSilhouette(canvas);
  contactShadow(canvas, 48, groundY + 0.5, 46, 3);
  return canvas;
}

// ── Granary — the only building raised off the ground (3×3) ──────────────────

/** @returns {Canvas} */
function granary() {
  const canvas = createCanvas(96, 120);
  const groundY = 119;

  // STADDLE STONES. Four mushroom-shaped piers lifting the whole store clear of
  // the ground — historically to keep rats out, and here because the mill also
  // occupies a 3x3 footprint and a tall timber box beside a tall stone tower
  // would be two silhouettes a player has to squint at.
  for (const x of [20, 40, 58, 76]) {
    rect(canvas, x - 3, groundY - 14, x + 3, groundY - 2, STONE_WARM);
    rect(canvas, x - 3, groundY - 14, x - 1, groundY - 2, STONE_WARM_LIGHT);
    ellipse(canvas, x, groundY - 15, 6.5, 3.4, STONE_WARM, 0.15);
    ellipse(canvas, x - 1, groundY - 16, 4.4, 2.2, STONE_WARM_LIGHT, 0.15);
    line(canvas, x - 6, groundY - 13, x + 6, groundY - 13, STONE_WARM_DARK);
  }

  // The store itself: a tall boarded box, wider at the top than the piers.
  material.boards(canvas, 12, 40, 84, groundY - 16, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 31);
  // A band of lighter board at the eave, which stops 60 px of one material
  // reading as a wall.
  material.planks(canvas, 12, 40, 84, 52, BIRCH_PALE, TIMBER_WARM, CREAM, 37);
  pitchedRoof(canvas, 6, 90, 40, 6, ROOF_SLATE, ROOF_SLATE_DEEP, ROOF_SLATE_LIGHT);

  // The loading door, high up where a granary's door actually is, with the
  // ladder to reach it. The ladder is the second read after the piers.
  rect(canvas, 38, 62, 58, 92, TIMBER_DARK);
  rect(canvas, 38, 62, 58, 64, WOOD_LIGHT);
  for (let y = 66; y <= 90; y += 4) line(canvas, 39, y, 57, y, SOIL_DARK);
  set(canvas, 55, 78, WARNING_AMBER);

  for (const x of [62, 70]) line(canvas, x, 92, x, groundY - 2, WOOD_BASE);
  for (let y = 96; y <= groundY - 6; y += 6) line(canvas, 62, y, 70, y, WOOD_LIGHT);

  // A hoist beam out of the gable, which is how the sacks get up there.
  rect(canvas, 44, 22, 52, 25, WOOD_BASE);
  rect(canvas, 40, 22, 44, 24, WOOD_LIGHT);
  line(canvas, 42, 25, 42, 34, SOFT_INK);
  ellipse(canvas, 42, 37, 4, 3.6, STRAW, 0.15);
  ellipse(canvas, 41, 36, 2.4, 2.2, CREAM, 0.15);

  // Spilled grain at the foot, catching the light.
  for (const [gx, gy] of [
    [30, groundY - 2],
    [33, groundY - 1],
    [50, groundY - 2],
    [66, groundY - 1],
  ]) {
    set(canvas, gx, gy, STRAW);
    set(canvas, gx + 1, gy, WARNING_AMBER);
  }

  outlineSilhouette(canvas);
  contactShadow(canvas, 48, groundY + 0.5, 44, 3);
  return canvas;
}

function main() {
  const dir = join(SRC, 'buildings{tps}');
  mkdirSync(dir, { recursive: true });
  writePng(join(dir, 'preserving_shed.png'), preservingShed());
  writePng(join(dir, 'loom.png'), loom());
  writePng(join(dir, 'granary.png'), granary());
  globalThis.console.log('buildings(v0.6): 3 sprites');
}

main();
