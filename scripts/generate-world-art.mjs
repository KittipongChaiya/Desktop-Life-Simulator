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
  GRASS_BASE,
  GRASS_LIGHT,
  GRASS_SHADOW,
  LEAF_HIGHLIGHT,
  PARCHMENT,
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
    [buildingsDir, 'bush.png', bush],
    [buildingsDir, 'flower.png', flower],
    [buildingsDir, 'storage_shed.png', storageShed],
    [buildingsDir, 'rest_hut.png', restHut],
  ];

  for (const [dir, name, paint] of assets) writePng(join(dir, name), paint());
  globalThis.console.log(`generated ${assets.length} world assets (terrain + props + buildings)`);
}

main();
