/**
 * Generates the PRODUCTION world art set. Phase-05.6a (vertical slice).
 *
 * Terrain tiles, ground props, and the two small buildings, painted strictly
 * from the creative canon:
 *   - colours only from COLOR_PALETTE.md (imported by name — STYLE_LOCK R-08)
 *   - tiles 32×32, flat top-down, NO outline, seamless (PIXEL_GUIDE §2, §5, §6)
 *   - props/buildings outlined 1 px #3A3640, lit upper-left, stepped ramp
 *     shading, flat contact shadow (PIXEL_GUIDE §5–§7, STYLE_LOCK R-02..R-06)
 *   - shapes rounded — safe and present (VISUAL_REFERENCE §4)
 *
 * Deterministic: seeded PRNG only, so re-runs are byte-identical and any art
 * change is an intentional git diff (ADR-006 §2). The script is the editable
 * source for this art; provenance lives in assets/src/GENERATION.md
 * (TECHNICAL_ASSET_SPEC §3).
 *
 * Run: `node scripts/generate-world-art.mjs`, then `npm run assets` to pack.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  CARROT_ORANGE,
  GRASS_BASE,
  GRASS_LIGHT,
  GRASS_SHADOW,
  LEAF_HIGHLIGHT,
  GOLD_HIGHLIGHT,
  PARCHMENT,
  REWARD_GOLD,
  PUMPKIN,
  SOFT_INK,
  SOIL_DARK,
  STONE_BASE,
  STONE_DARK,
  STONE_LIGHT,
  STRAW,
  TILLED_SOIL,
  WATER_BASE,
  WATER_DEEP,
  WATER_LIGHT,
  WOOD_BASE,
  WOOD_LIGHT,
  alphaAt,
  contactShadow,
  createCanvas,
  ellipse,
  fill,
  outlineSilhouette,
  prng,
  rect,
  set,
  writePng,
} from './lib/pixel-art.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');
const TILE = 32;

// ── Tiles (32×32, no outline, seamless) ──────────────────────────────────────

/** Paints wrapped speckles so the pattern tiles seamlessly at every edge.
 * @param {import('./lib/pixel-art.mjs').Canvas} canvas
 * @param {() => number} rng
 * @param {number} count
 * @param {(x: number, y: number) => void} paint receives a wrapped origin
 */
function scatter(canvas, rng, count, paint) {
  for (let i = 0; i < count; i += 1) {
    paint(Math.floor(rng() * canvas.width), Math.floor(rng() * canvas.height));
  }
}

/** Terrain is the bottom of the attention hierarchy (VISUAL_REFERENCE §3):
 * low-contrast texture only, nothing that competes with crops or workers. */
function grassTile() {
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => GRASS_BASE);
  const rng = prng(1201);
  // Short blade pairs: mostly light, some shade, a rare rim highlight.
  scatter(canvas, rng, 24, (x, y) => {
    const roll = rng();
    const colour = roll < 0.55 ? GRASS_LIGHT : roll < 0.85 ? GRASS_SHADOW : LEAF_HIGHLIGHT;
    set(canvas, x, y, colour);
    set(canvas, x, (y + 1) % TILE, colour);
  });
  return canvas;
}

/** The tilled-soil state (GAME_DESIGN §2.2): horizontal furrows, spacing that
 * continues across tile edges (period 4 rows), lit ridge above each groove. */
function tilledTile() {
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => TILLED_SOIL);
  const rng = prng(1202);
  for (let y = 2; y < TILE; y += 4) {
    for (let x = 0; x < TILE; x += 1) {
      set(canvas, x, y, SOIL_DARK);
      // Light from the upper-left: a broken highlight on the ridge above.
      if (rng() < 0.28) set(canvas, x, y - 1, WOOD_BASE);
    }
  }
  scatter(canvas, rng, 10, (x, y) => set(canvas, x, y, SOIL_DARK));
  return canvas;
}

/** Decorative still water (`core:water`); the animated shimmer is a v0.2 spec
 * (ANIMATION_GUIDE §3 — the chunk renderer bakes static terrain today). */
function waterTile() {
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => WATER_BASE);
  const rng = prng(1203);
  // Deeper patches first, then calm horizontal light ripples over them.
  scatter(canvas, rng, 5, (x, y) => {
    for (let dx = 0; dx < 4; dx += 1) {
      set(canvas, (x + dx) % TILE, y, WATER_DEEP);
      if (dx > 0 && dx < 3) set(canvas, (x + dx) % TILE, (y + 1) % TILE, WATER_DEEP);
    }
  });
  scatter(canvas, rng, 8, (x, y) => {
    for (let dx = 0; dx < 3; dx += 1) set(canvas, (x + dx) % TILE, y, WATER_LIGHT);
  });
  return canvas;
}

/** Decorative rock face (`core:stone`): cobble seams, facets lit upper-left. */
function stoneTile() {
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => STONE_BASE);
  const rng = prng(1204);
  // Short seam lines, each with a lit edge above-left.
  scatter(canvas, rng, 7, (x, y) => {
    const len = 3 + Math.floor(rng() * 3);
    const vertical = rng() < 0.35;
    for (let d = 0; d < len; d += 1) {
      const sx = vertical ? x : (x + d) % TILE;
      const sy = vertical ? (y + d) % TILE : y;
      set(canvas, sx, sy, STONE_DARK);
    }
    set(canvas, (x + TILE - 1) % TILE, (y + TILE - 1) % TILE, STONE_LIGHT);
  });
  scatter(canvas, rng, 6, (x, y) => set(canvas, x, y, STONE_LIGHT));
  return canvas;
}

/** Player-placed path (`core:path`, GAME_DESIGN §2.2): sun-worn packed earth,
 * clearly warmer/brighter than grass and tilled soil so routes read at a glance. */
function pathTile() {
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => WOOD_LIGHT);
  const rng = prng(1205);
  scatter(canvas, rng, 14, (x, y) => {
    set(canvas, x, y, WOOD_BASE);
    if (rng() < 0.5) set(canvas, (x + 1) % TILE, y, WOOD_BASE);
  });
  scatter(canvas, rng, 5, (x, y) => set(canvas, x, y, TILLED_SOIL));
  scatter(canvas, rng, 4, (x, y) => set(canvas, x, y, STRAW));
  return canvas;
}

// ── Props (outlined, lit upper-left, contact shadow) ─────────────────────────

/** Stepped foliage: shadow mass, then the lit body offset toward the light,
 * then a smaller highlight — hard ramp steps, never a gradient (R-02).
 * @param {import('./lib/pixel-art.mjs').Canvas} canvas
 * @param {Array<[number, number, number, number]>} lobes cx, cy, rx, ry
 */
function foliage(canvas, lobes) {
  for (const [cx, cy, rx, ry] of lobes) ellipse(canvas, cx, cy, rx, ry, GRASS_SHADOW, 0.15);
  for (const [cx, cy, rx, ry] of lobes) {
    ellipse(canvas, cx - 2, cy - 2, rx - 1, ry - 1, GRASS_BASE, 0.15);
  }
  for (const [cx, cy, rx, ry] of lobes) {
    ellipse(canvas, cx - 4, cy - 5, Math.max(2, rx * 0.55), Math.max(2, ry * 0.55), GRASS_LIGHT, 0.15);
  }
}

/** Tree, 64×96: 1-tile footprint, canopy overhangs (PIXEL_GUIDE §2). */
function tree() {
  const canvas = createCanvas(64, 96);
  // Trunk with a root flare; left edge lit, right edge shaded.
  rect(canvas, 28, 52, 35, 91, WOOD_BASE);
  rect(canvas, 26, 88, 37, 93, WOOD_BASE);
  rect(canvas, 28, 52, 29, 91, WOOD_LIGHT);
  rect(canvas, 34, 52, 35, 91, SOIL_DARK);
  rect(canvas, 26, 88, 27, 93, WOOD_LIGHT);
  rect(canvas, 36, 88, 37, 93, SOIL_DARK);
  // A rounded three-lobe canopy — the safe, present silhouette (VISUAL_REFERENCE §4).
  foliage(canvas, [
    [32, 30, 22, 18],
    [17, 40, 12, 10],
    [47, 38, 12, 10],
  ]);
  // Sparse leaf texture; rim highlights only in the lit upper-left quadrant.
  const rng = prng(1301);
  for (let i = 0; i < 26; i += 1) {
    const x = 10 + Math.floor(rng() * 44);
    const y = 14 + Math.floor(rng() * 36);
    const dx = (x - 32) / 22;
    const dy = (y - 30) / 18;
    if (dx * dx + dy * dy > 1) continue;
    if (x < 32 && y < 32 && rng() < 0.45) set(canvas, x, y, LEAF_HIGHLIGHT);
    else set(canvas, x, y, rng() < 0.5 ? GRASS_SHADOW : GRASS_LIGHT);
  }
  outlineSilhouette(canvas);
  contactShadow(canvas, 32, 92, 15, 2.5);
  return canvas;
}

/** Boulder, 32×32 ground prop. */
function rock() {
  const canvas = createCanvas(TILE, TILE);
  ellipse(canvas, 16, 21, 11, 8, STONE_DARK, 0.15);
  ellipse(canvas, 15, 20, 10, 7, STONE_BASE, 0.15);
  ellipse(canvas, 13, 18, 6, 4, STONE_LIGHT, 0.15);
  // One interior seam — Soft Ink, sparingly (PIXEL_GUIDE §5).
  set(canvas, 19, 19, SOFT_INK);
  set(canvas, 20, 20, SOFT_INK);
  set(canvas, 20, 21, SOFT_INK);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 28, 11, 2);
  return canvas;
}

/** Low shrub, 32×32 ground prop. */
function bush() {
  const canvas = createCanvas(TILE, TILE);
  foliage(canvas, [
    [12, 21, 9, 7],
    [20, 19, 9, 7],
  ]);
  const rng = prng(1302);
  for (let i = 0; i < 8; i += 1) {
    const x = 6 + Math.floor(rng() * 20);
    const y = 13 + Math.floor(rng() * 12);
    set(canvas, x, y, rng() < 0.5 ? GRASS_SHADOW : GRASS_LIGHT);
  }
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 27, 11, 2);
  return canvas;
}

/** Meadow flower, 32×32 ground prop. Petals are Parchment with a Straw heart —
 * the palette reserves every brighter accent for meaning (R-09), and it has no
 * dedicated flower colour; that gap is recorded for the validation report. */
function flower() {
  const canvas = createCanvas(TILE, TILE);
  // Stem and two leaves.
  rect(canvas, 16, 18, 16, 27, GRASS_SHADOW);
  rect(canvas, 14, 23, 15, 24, GRASS_BASE);
  rect(canvas, 17, 21, 18, 22, GRASS_BASE);
  // Petals in a plus, diagonals as single pixels, Straw centre.
  rect(canvas, 15, 11, 16, 12, PARCHMENT);
  rect(canvas, 15, 17, 16, 18, PARCHMENT);
  rect(canvas, 12, 14, 13, 15, PARCHMENT);
  rect(canvas, 18, 14, 19, 15, PARCHMENT);
  set(canvas, 13, 12, PARCHMENT);
  set(canvas, 18, 12, PARCHMENT);
  set(canvas, 13, 17, PARCHMENT);
  set(canvas, 18, 17, PARCHMENT);
  rect(canvas, 15, 14, 16, 15, STRAW);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 28, 4, 1.5);
  return canvas;
}

// ── Buildings (32×32, 1×1 footprint, top-left grid-aligned) ──────────────────

/** Thatch texture: broken darker strands through a Straw roof. Paints only
 * where the roof is already opaque — a speck outside the silhouette would be
 * wrapped by the outline pass into a floating artifact.
 * @param {import('./lib/pixel-art.mjs').Canvas} canvas
 * @param {() => number} rng
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number[]} [colour]
 * @param {number} [density]
 */
function thatch(canvas, rng, x0, y0, x1, y1, colour = WOOD_LIGHT, density = 0.3) {
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 1) {
      if (rng() < density && alphaAt(canvas, x, y) === 255) set(canvas, x, y, colour);
    }
  }
}

/** Production storage shed (`buildings:storage_shed`, GAME_DESIGN §5): a wide
 * working gable — thatch roof, plank walls, a big honest door. Replaces the
 * phase-05d placeholder file-for-file (ASSETS.md §7.3). */
function storageShed() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1401);
  // Walls first (the roof eave overhangs them).
  rect(canvas, 4, 12, 27, 28, WOOD_BASE);
  rect(canvas, 4, 12, 5, 28, WOOD_LIGHT); // lit left edge
  for (const x of [10, 16, 22]) rect(canvas, x, 13, x, 28, SOIL_DARK); // plank seams
  // Door: wide enough for sacks and crates.
  rect(canvas, 12, 19, 19, 28, SOIL_DARK);
  rect(canvas, 13, 20, 18, 28, TILLED_SOIL);
  rect(canvas, 13, 23, 18, 23, SOIL_DARK); // cross-board
  // Gable roof: ridge to overhanging eaves, straw over a dark eave line.
  for (let y = 2; y <= 11; y += 1) {
    const spread = Math.floor(((y - 2) * 12) / 9);
    rect(canvas, 15 - spread - 1, y, 16 + spread + 1, y, STRAW);
  }
  thatch(canvas, rng, 3, 4, 28, 11);
  rect(canvas, 14, 2, 17, 2, WOOD_LIGHT); // ridge cap
  rect(canvas, 3, 11, 28, 11, WOOD_LIGHT); // eave edge, 1 px past the walls
  rect(canvas, 3, 12, 28, 12, SOIL_DARK); // eave underside shadow
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 13, 1.8);
  return canvas;
}

/** Rest hut (`core:rest_hut`, GAME_DESIGN §5 — phase-06 content, art pre-wired):
 * the cozy counterpart — a rounded thatch dome, a warm lit window. Rounded =
 * safe and present (VISUAL_REFERENCE §4); its silhouette must never be
 * confused with the shed's gable at a glance. */
function restHut() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1402);
  // Low walls under the dome.
  rect(canvas, 6, 17, 25, 28, WOOD_BASE);
  rect(canvas, 6, 17, 7, 28, WOOD_LIGHT);
  // Rounded thatch dome, overhanging the walls.
  ellipse(canvas, 16, 13, 13, 9, STRAW, 0.1);
  thatch(canvas, rng, 4, 8, 28, 21);
  thatch(canvas, rng, 7, 6, 17, 12, PARCHMENT, 0.35); // dithered sun, lit slope
  // Round-topped door.
  rect(canvas, 13, 21, 18, 28, SOIL_DARK);
  rect(canvas, 14, 22, 17, 28, TILLED_SOIL);
  set(canvas, 14, 21, SOIL_DARK);
  set(canvas, 17, 21, SOIL_DARK);
  // A warm window — Straw glow, dark frame: someone could be resting inside.
  rect(canvas, 8, 21, 10, 23, SOIL_DARK);
  rect(canvas, 9, 22, 9, 22, STRAW);
  rect(canvas, 21, 21, 23, 23, SOIL_DARK);
  rect(canvas, 22, 22, 22, 22, STRAW);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 12, 1.8);
  return canvas;
}

/** Seed bin (`core:seed_bin`, GAME_DESIGN §5, 06c): a LOW open-topped hopper
 * heaped with seed — the third silhouette class: the shed is tall-gabled, the
 * hut is domed, the bin is low and open. Its function (a container of
 * plantable stock) is its shape. */
function seedBin() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1403);
  // Crate body: low and wide, lit left edge, plank seams.
  rect(canvas, 5, 17, 26, 28, WOOD_BASE);
  rect(canvas, 5, 17, 6, 28, WOOD_LIGHT);
  for (const x of [11, 17, 23]) rect(canvas, x, 18, x, 28, SOIL_DARK);
  // Front cross-board, the crate read.
  rect(canvas, 5, 22, 26, 23, WOOD_LIGHT);
  rect(canvas, 5, 24, 26, 24, SOIL_DARK);
  // The heap of seed above the rim — Straw, mounded, speckled.
  ellipse(canvas, 15.5, 15.5, 10, 3.4, STRAW, 0.15);
  for (let i = 0; i < 14; i += 1) {
    const x = 7 + Math.floor(rng() * 18);
    const y = 13 + Math.floor(rng() * 3);
    if (alphaAt(canvas, x, y) === 255) set(canvas, x, y, WOOD_LIGHT);
  }
  // Rim in front of the heap.
  rect(canvas, 5, 17, 26, 17, WOOD_LIGHT);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 12, 1.8);
  return canvas;
}

/** Market stall (`core:market_stall`, GAME_DESIGN §5, 06c): the tallest
 * silhouette — a striped cloth canopy on posts over a goods counter. Cloth
 * and produce say "market" with no sign needed; the stripes are Parchment
 * and Straw, both already load-bearing canvas colours. */
function marketStall() {
  const canvas = createCanvas(TILE, TILE);
  // Posts, lit on their left edge.
  rect(canvas, 5, 10, 6, 28, WOOD_BASE);
  rect(canvas, 5, 10, 5, 28, WOOD_LIGHT);
  rect(canvas, 25, 10, 26, 28, WOOD_BASE);
  set(canvas, 25, 10, WOOD_LIGHT);
  // Counter with a lit top and a plank seam.
  rect(canvas, 4, 21, 27, 27, WOOD_BASE);
  rect(canvas, 4, 21, 27, 21, WOOD_LIGHT);
  rect(canvas, 4, 24, 27, 24, SOIL_DARK);
  // Goods on the counter: produce hints in the warm accents.
  rect(canvas, 8, 19, 10, 20, CARROT_ORANGE);
  set(canvas, 9, 18, GRASS_BASE); // frond tuft
  rect(canvas, 14, 18, 17, 20, PUMPKIN);
  set(canvas, 15, 17, WOOD_BASE); // stem
  rect(canvas, 21, 19, 23, 20, PARCHMENT);
  // Striped canopy: gentle slope, scalloped hem, alternating cloth stripes.
  for (let y = 3; y <= 9; y += 1) {
    const inset = y <= 4 ? 2 : 0; // rounded crown rows
    rect(canvas, 3 + inset, y, 28 - inset, y, PARCHMENT);
  }
  for (let x = 3; x <= 28; x += 1) {
    if (Math.floor((x - 3) / 4) % 2 === 1) {
      for (let y = 3; y <= 9; y += 1) {
        if (alphaAt(canvas, x, y) === 255) set(canvas, x, y, STRAW);
      }
    }
    // Scalloped hem: every other pair of columns drops one pixel.
    if (Math.floor((x - 3) / 2) % 2 === 0 && alphaAt(canvas, x, 9) === 255) {
      set(canvas, x, 10, Math.floor((x - 3) / 4) % 2 === 1 ? STRAW : PARCHMENT);
    }
  }
  rect(canvas, 5, 3, 26, 3, WOOD_LIGHT); // ridge pole peeking over the crown
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 13, 1.8);
  return canvas;
}

// ── v0.4 factories (phase-26; ADR-035) ───────────────────────────────────────
//
// The brief these two answer is legibility, not decoration. Phase-25 shipped
// them borrowing `storage_shed` and `cottage`, and the live pass found the two
// indistinguishable on the plot — a player could not tell which building made
// flour and which made bread. So the SILHOUETTES are designed to differ first
// and the detail second, the same rule `restHut` follows against `storageShed`:
// a mill is tall and narrow with a wheel breaking its outline; a kitchen is
// low and wide with a chimney and a lit window.

/** Mill (`buildings:mill`, ADR-035): a tall stone tower with an external
 * water wheel. Reads as INDUSTRY — vertical, hard-edged, asymmetric — against
 * every other farm building, which are wide and soft. The wheel is what makes
 * the silhouette unmistakable at a glance and at a distance. */
function mill() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1408);

  // Stone tower: narrow, tall, slightly tapered so it reads as built rather
  // than extruded. Left edge lit (upper-left key light, ASSETS.md §2).
  rect(canvas, 10, 6, 24, 28, STONE_BASE);
  rect(canvas, 10, 6, 12, 28, STONE_LIGHT);
  rect(canvas, 23, 7, 24, 28, STONE_DARK);
  // Coursed stonework — staggered, never a grid, or it reads as tile.
  for (let y = 9; y <= 27; y += 3) {
    for (let x = 11; x <= 23; x += 1) {
      if (rng() < 0.22) set(canvas, x, y, STONE_DARK);
    }
  }

  // Conical cap in straw, so it belongs to the same village as the shed.
  for (let y = 1; y <= 6; y += 1) {
    const spread = Math.floor(((y - 1) * 8) / 5);
    rect(canvas, 17 - spread, y, 17 + spread, y, STRAW);
  }
  thatch(canvas, rng, 10, 3, 25, 6);
  rect(canvas, 9, 6, 26, 6, WOOD_LIGHT); // eave, overhanging the tower

  // Door and a single small window: a working tower, not a home.
  rect(canvas, 15, 21, 19, 28, SOIL_DARK);
  rect(canvas, 16, 22, 18, 28, TILLED_SOIL);
  rect(canvas, 15, 12, 18, 15, SOFT_INK);
  rect(canvas, 16, 13, 17, 14, STRAW); // lit from within

  // THE WATER WHEEL — the silhouette break. Outside the tower on the left, so
  // the outline is asymmetric and unlike anything else in the atlas.
  ellipse(canvas, 6, 20, 5, 5, WOOD_BASE);
  ellipse(canvas, 6, 20, 3, 3, GRASS_SHADOW);
  for (const [dx, dy] of [
    [0, -5],
    [0, 5],
    [-5, 0],
    [5, 0],
    [-3, -3],
    [3, 3],
    [-3, 3],
    [3, -3],
  ]) {
    set(canvas, 6 + dx, 20 + dy, WOOD_LIGHT);
  }
  rect(canvas, 6, 19, 10, 21, WOOD_BASE); // axle into the tower

  outlineSilhouette(canvas);
  contactShadow(canvas, 17, 29, 12, 1.8);
  return canvas;
}

/** Kitchen (`buildings:kitchen`, ADR-035): a low wide bakehouse — a brick
 * oven bulge, a smoking chimney, a warmly lit window. Reads as DOMESTIC and
 * horizontal, the deliberate opposite of the mill's vertical tower, so the two
 * are told apart by shape before colour. */
function kitchen() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1409);

  // Wide low walls.
  rect(canvas, 2, 15, 29, 28, WOOD_BASE);
  rect(canvas, 2, 15, 3, 28, WOOD_LIGHT);
  for (const x of [9, 15, 21]) rect(canvas, x, 16, x, 28, SOIL_DARK);

  // Brick oven bulge on the right — the feature that says "bread" and the
  // second silhouette break after the chimney.
  ellipse(canvas, 24, 22, 6, 6, CARROT_ORANGE);
  ellipse(canvas, 24, 22, 4, 4, PUMPKIN);
  rect(canvas, 22, 21, 26, 24, SOIL_DARK); // oven mouth
  rect(canvas, 23, 22, 25, 23, STRAW); // fire inside, glowing

  // Shallow roof — deliberately much flatter than the shed's gable.
  for (let y = 9; y <= 14; y += 1) {
    const spread = Math.floor(((y - 9) * 14) / 5);
    rect(canvas, 15 - spread, y, 16 + spread, y, STRAW);
  }
  thatch(canvas, rng, 3, 10, 28, 14);
  rect(canvas, 1, 14, 30, 14, WOOD_LIGHT);
  rect(canvas, 1, 15, 30, 15, SOIL_DARK);

  // Chimney with smoke — the tall element, kept THIN so the mass still reads
  // horizontal.
  rect(canvas, 6, 3, 9, 13, STONE_BASE);
  rect(canvas, 6, 3, 6, 13, STONE_LIGHT);
  rect(canvas, 5, 2, 10, 3, STONE_DARK);
  for (const [x, y] of [
    [7, 1],
    [8, 0],
  ]) {
    set(canvas, x, y, PARCHMENT);
  }

  // A warmly lit window: somebody is baking.
  rect(canvas, 11, 18, 16, 23, SOFT_INK);
  rect(canvas, 12, 19, 15, 22, STRAW);
  rect(canvas, 13, 19, 13, 22, SOIL_DARK); // mullion

  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 15, 1.8);
  return canvas;
}

/** Ore vein (`buildings:ore_vein`, ADR-037): angular crystal shards breaking
 * upward out of a low base, banded with metal.
 *
 * SILHOUETTE-FIRST, and the second attempt. The first was `rock`'s rounded
 * boulder with gold flecks scattered on it, and at gameplay scale it read as a
 * plain grey rock — the flecks disappear, and a player cannot tell stone from
 * ore. That is precisely the mistake phase-25 made with the mill and the
 * kitchen, repeated one phase later on surface detail instead of shape.
 *
 * Shards point up and outward, so the outline is jagged where `rock`'s is
 * smooth. The two are now different at a glance, before any colour is read.
 */
function oreVein() {
  const canvas = createCanvas(TILE, TILE);

  // Low base the shards grow out of — keeps it planted rather than floating.
  ellipse(canvas, 16, 25, 9, 4, STONE_DARK, 0.15);
  ellipse(canvas, 15, 24, 8, 3, STONE_BASE, 0.15);

  /**
   * One angular shard: a triangle from a base width up to an apex.
   *
   * @param {number} apexX
   * @param {number} apexY
   * @param {number} baseY
   * @param {number} halfWidth
   * @param {number[]} body
   * @param {number[]} lit
   * @returns {void}
   */
  const shard = (apexX, apexY, baseY, halfWidth, body, lit) => {
    const height = baseY - apexY;
    for (let y = apexY; y <= baseY; y += 1) {
      const t = (y - apexY) / height;
      const half = Math.max(0, Math.round(halfWidth * t));
      rect(canvas, apexX - half, y, apexX + half, y, body);
      // Lit left face — one column, so the facet reads as flat, not round.
      set(canvas, apexX - half, y, lit);
    }
  };

  // Three shards of different heights: a cluster, never a row.
  shard(11, 14, 25, 4, STONE_BASE, STONE_LIGHT);
  shard(21, 12, 25, 4, STONE_BASE, STONE_LIGHT);
  shard(16, 7, 25, 5, STONE_BASE, STONE_LIGHT);

  // Metal banding, following each shard's face rather than scattered over it —
  // scattered flecks are what vanished at size.
  for (const [x, y] of [
    [16, 12],
    [16, 13],
    [17, 14],
    [15, 15],
    [11, 19],
    [12, 20],
    [21, 17],
    [20, 18],
  ]) {
    set(canvas, x, y, REWARD_GOLD);
  }
  set(canvas, 16, 11, GOLD_HIGHLIGHT);
  set(canvas, 21, 16, GOLD_HIGHLIGHT);

  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 27, 10, 2);
  return canvas;
}

// ── Town buildings (phase-18, ADR-030 §4; village canon WORLD_BIBLE §Village) ─

/** Cottage (`core:cottage`): a home, not a workshop — the fifth silhouette
 * class. Steeper and narrower than the shed's working gable, and broken by a
 * stone chimney; two warm Straw windows say somebody lives here. */
function cottage() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1404);
  // Walls: narrower than the shed's, lit left edge.
  rect(canvas, 6, 14, 25, 28, WOOD_BASE);
  rect(canvas, 6, 14, 7, 28, WOOD_LIGHT);
  rect(canvas, 12, 15, 12, 28, SOIL_DARK); // one plank seam
  rect(canvas, 19, 15, 19, 28, SOIL_DARK);
  // Steep gable: ridge high, eaves just past the walls.
  for (let y = 3; y <= 13; y += 1) {
    const spread = Math.floor(((y - 3) * 11) / 10);
    rect(canvas, 15 - spread, y, 16 + spread, y, STRAW);
  }
  thatch(canvas, rng, 5, 5, 26, 13);
  rect(canvas, 15, 3, 16, 3, WOOD_LIGHT); // ridge cap
  rect(canvas, 5, 13, 26, 13, WOOD_LIGHT); // eave edge
  rect(canvas, 5, 14, 26, 14, SOIL_DARK); // eave shadow
  // Stone chimney breaking the roof line on the shaded side.
  rect(canvas, 21, 4, 24, 10, STONE_BASE);
  rect(canvas, 21, 4, 21, 10, STONE_LIGHT);
  rect(canvas, 21, 4, 24, 4, STONE_LIGHT);
  set(canvas, 23, 9, STONE_DARK);
  // Door, round-topped like the hut's — homes share the cozy read.
  rect(canvas, 14, 22, 18, 28, SOIL_DARK);
  rect(canvas, 15, 23, 17, 28, TILLED_SOIL);
  // Two warm windows.
  rect(canvas, 8, 18, 10, 20, SOIL_DARK);
  set(canvas, 9, 19, STRAW);
  rect(canvas, 21, 18, 23, 20, SOIL_DARK);
  set(canvas, 22, 19, STRAW);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 12, 1.8);
  return canvas;
}

/** Town well (`core:well`): the plaza's centre. A LOW round stone ring — the
 * only circular building silhouette — under a little A-frame with a rope. */
function well() {
  const canvas = createCanvas(TILE, TILE);
  // Posts and their crossbar first; the roof overhangs them.
  rect(canvas, 8, 8, 9, 20, WOOD_BASE);
  rect(canvas, 8, 8, 8, 20, WOOD_LIGHT);
  rect(canvas, 22, 8, 23, 20, WOOD_BASE);
  set(canvas, 22, 8, WOOD_LIGHT);
  // Little gable roof over the shaft.
  for (let y = 3; y <= 7; y += 1) {
    const spread = Math.floor(((y - 3) * 10) / 4);
    rect(canvas, 15 - spread, y, 16 + spread, y, STRAW);
  }
  rect(canvas, 15, 3, 16, 3, WOOD_LIGHT);
  rect(canvas, 5, 7, 26, 7, WOOD_LIGHT);
  // Rope down to the bucket.
  rect(canvas, 15, 8, 15, 15, PARCHMENT);
  rect(canvas, 14, 15, 16, 17, WOOD_BASE);
  rect(canvas, 14, 15, 14, 17, WOOD_LIGHT);
  // The stone ring: an ellipse with a dark water mouth.
  ellipse(canvas, 16, 23, 10, 5, STONE_BASE, 0.15);
  ellipse(canvas, 16, 22, 7, 3, WATER_DEEP, 0.15);
  ellipse(canvas, 14, 21, 2, 1, WATER_LIGHT, 0.15); // a glint, lit upper-left
  rect(canvas, 7, 23, 8, 25, STONE_LIGHT); // lit stones on the left rim
  set(canvas, 10, 26, STONE_LIGHT);
  set(canvas, 22, 26, STONE_DARK);
  set(canvas, 24, 24, STONE_DARK);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 11, 1.8);
  return canvas;
}

/** Notice board (`core:notice_board`): where phase-20's contracts will hang.
 * Two posts, a plank board, and pinned Parchment notes — readable as "paper
 * on wood" at a glance, which is the whole message. */
function noticeBoard() {
  const canvas = createCanvas(TILE, TILE);
  // Posts.
  rect(canvas, 6, 8, 7, 28, WOOD_BASE);
  rect(canvas, 6, 8, 6, 28, WOOD_LIGHT);
  rect(canvas, 24, 8, 25, 28, WOOD_BASE);
  set(canvas, 24, 8, WOOD_LIGHT);
  // Little rain cap.
  rect(canvas, 4, 6, 27, 7, STRAW);
  rect(canvas, 4, 6, 27, 6, WOOD_LIGHT);
  // The board: planks with a lit top edge.
  rect(canvas, 5, 9, 26, 22, WOOD_BASE);
  rect(canvas, 5, 9, 26, 9, WOOD_LIGHT);
  rect(canvas, 5, 15, 26, 15, SOIL_DARK); // plank seam
  // Pinned notes: Parchment sheets, one Straw seal, one corner curled dark.
  rect(canvas, 8, 11, 12, 16, PARCHMENT);
  set(canvas, 8, 16, SOIL_DARK);
  rect(canvas, 15, 12, 18, 18, PARCHMENT);
  set(canvas, 16, 14, STRAW);
  rect(canvas, 20, 11, 23, 14, PARCHMENT);
  set(canvas, 10, 11, SOIL_DARK); // pins
  set(canvas, 16, 12, SOIL_DARK);
  set(canvas, 21, 11, SOIL_DARK);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 11, 1.6);
  return canvas;
}

/** Castle (`core:castle`): the village's landmark keep, asked for by the
 * owner (2026-08-15). Stone where everything else is wood — but rounded and
 * warm per the canon's "nothing threatens home" (WORLD_BIBLE §Philosophy):
 * two round towers, a lit gate, Straw windows glowing, and a little pennant.
 * The tallest stone silhouette in the game; never a fortress of menace. */
function castle() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1405);
  // Central keep body.
  rect(canvas, 9, 12, 22, 28, STONE_BASE);
  rect(canvas, 9, 12, 10, 28, STONE_LIGHT); // lit left face
  // Two round-ish corner towers, slightly taller than the keep.
  rect(canvas, 4, 10, 8, 28, STONE_BASE);
  rect(canvas, 4, 10, 4, 28, STONE_LIGHT);
  rect(canvas, 23, 10, 27, 28, STONE_BASE);
  rect(canvas, 27, 11, 27, 28, STONE_DARK);
  // Crenellations: alternating merlons on keep and towers.
  for (const x of [4, 6, 8]) rect(canvas, x, 8, x, 9, STONE_BASE);
  for (const x of [23, 25, 27]) rect(canvas, x, 8, x, 9, STONE_BASE);
  for (const x of [11, 13, 15, 17, 19, 21]) rect(canvas, x, 10, x, 11, STONE_BASE);
  set(canvas, 4, 8, STONE_LIGHT);
  set(canvas, 11, 10, STONE_LIGHT);
  // Stone seams, sparse, with a lit fleck in the upper-left quadrant.
  for (let i = 0; i < 12; i += 1) {
    const x = 5 + Math.floor(rng() * 22);
    const y = 13 + Math.floor(rng() * 14);
    if (alphaAt(canvas, x, y) === 255) set(canvas, x, y, rng() < 0.35 ? STONE_LIGHT : STONE_DARK);
  }
  // Round-topped gate, warm inside — the door is open, and that is the point.
  rect(canvas, 13, 21, 18, 28, SOIL_DARK);
  rect(canvas, 14, 22, 17, 28, STRAW);
  set(canvas, 14, 21, SOIL_DARK);
  set(canvas, 17, 21, SOIL_DARK);
  // Two lit tower windows.
  rect(canvas, 5, 14, 6, 16, SOIL_DARK);
  set(canvas, 6, 15, STRAW);
  rect(canvas, 24, 14, 25, 16, SOIL_DARK);
  set(canvas, 24, 15, STRAW);
  // A pennant on the keep: one pole pixel-wide, a small Parchment flag.
  rect(canvas, 15, 4, 15, 9, WOOD_BASE);
  rect(canvas, 16, 4, 19, 5, PARCHMENT);
  set(canvas, 19, 4, STRAW);
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29, 13, 1.8);
  return canvas;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const terrainDir = join(SRC, 'terrain{tps}');
  const buildingsDir = join(SRC, 'buildings{tps}');
  mkdirSync(terrainDir, { recursive: true });
  mkdirSync(buildingsDir, { recursive: true });

  /** @type {[string, string, () => import('./lib/pixel-art.mjs').Canvas][]} */
  const assets = [
    [terrainDir, 'grass.png', grassTile],
    [terrainDir, 'tilled.png', tilledTile],
    [terrainDir, 'water.png', waterTile],
    [terrainDir, 'stone.png', stoneTile],
    [terrainDir, 'path.png', pathTile],
    [buildingsDir, 'tree.png', tree],
    [buildingsDir, 'rock.png', rock],
    [buildingsDir, 'ore_vein.png', oreVein],
    [buildingsDir, 'bush.png', bush],
    [buildingsDir, 'flower.png', flower],
    [buildingsDir, 'storage_shed.png', storageShed],
    [buildingsDir, 'rest_hut.png', restHut],
    [buildingsDir, 'seed_bin.png', seedBin],
    [buildingsDir, 'market_stall.png', marketStall],
    [buildingsDir, 'mill.png', mill],
    [buildingsDir, 'kitchen.png', kitchen],
    [buildingsDir, 'cottage.png', cottage],
    [buildingsDir, 'well.png', well],
    [buildingsDir, 'notice_board.png', noticeBoard],
    [buildingsDir, 'castle.png', castle],
  ];

  for (const [dir, name, paint] of assets) writePng(join(dir, name), paint());
  globalThis.console.log(`generated ${assets.length} world assets (terrain + props + buildings)`);
}

main();
