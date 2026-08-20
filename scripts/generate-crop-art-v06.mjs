/**
 * The eight v0.6 crops, all four growth stages each, plus their produce icons
 * and seed pouches. Phase-55 — ADR-046 R-01/R-02, ADR-041.
 *
 * Four crops could not fill four seasons: spring and winter offered two
 * plantable each. These eight bring every season to five or six, and their
 * numbers sit on `GAME_DESIGN.md` §3.2's existing curve rather than beside it
 * — the derivation is in `plugins/core/content.ts`, not here.
 *
 * **Why a second generator rather than a longer first one.** `CODE_STYLE.md`
 * caps a file at 800 lines and `generate-crop-art.mjs` is already 696 for four
 * crops. The shared vocabulary moved to `lib/crop-craft.mjs` so both draw with
 * the same hand — a crop drawn in a different vocabulary reads as a different
 * game, which is the finding ADR-041 opens with.
 *
 * **Silhouette first** (ADR-041 §Density). Twelve crops share one 32×32 canvas
 * and a player reads them at 1× out of the corner of an eye, so each mature
 * stage commits to a shape no other crop has: pea climbs a twig trellis, leek
 * is a narrow vertical column, corn is the tallest thing on the farm with a
 * tassel, cabbage is one tight sphere, squash lies sideways where pumpkin
 * stands up. Colour is the second read, never the first.
 *
 * Canon, unchanged: 32×32 crop canvas, bottom-centre pivot, grows upward
 * (PIXEL_GUIDE.md §2); 1 px #3A3640 outline (§5); four stages per
 * GAME_DESIGN.md §3.3. Reward Gold stays reserved for coins (STYLE_LOCK R-09),
 * so corn is Straw and Warning Amber.
 *
 * Deterministic: no RNG at all here, so re-runs are byte-identical (ADR-006 §2).
 * Run: `node scripts/generate-crop-art-v06.mjs`, then `npm run assets`.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { blade, cane, frond, itemSeedPouch, lobes, sownMound } from './lib/crop-craft.mjs';
import {
  BLOOM_BLUE,
  BLOOM_ROSE,
  CARROT_ORANGE,
  CREAM,
  CREAM_SHADE,
  GRASS_BASE,
  GRASS_LIGHT,
  GRASS_SHADOW,
  LEAF_HIGHLIGHT,
  PUMPKIN,
  SOFT_INK,
  STRAW,
  WARNING_AMBER,
  WOOD_BASE,
  WOOD_LIGHT,
  contactShadow,
  createCanvas,
  ellipse,
  outlineSilhouette,
  set,
  writePng,
} from './lib/pixel-art.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */

// ── Stage scaffolding ────────────────────────────────────────────────────────

/**
 * Stages 0 and 1 are the same for every crop but the accent and the leaf pair,
 * because a seed in soil is a seed in soil (`generate-crop-art.mjs` says the
 * same thing about the v0.1 four). Factoring them here is what keeps each new
 * crop down to the three stages that actually differ.
 * @param {number[]} accent
 * @returns {Canvas}
 */
function seedStage(accent) {
  const canvas = createCanvas(32, 32);
  sownMound(canvas, 9, 29, 2.6, accent);
  sownMound(canvas, 16, 29, 3, accent);
  sownMound(canvas, 23, 29, 2.6, accent);
  outlineSilhouette(canvas);
  return canvas;
}

/**
 * Stage 1 — the mounds, plus a pair of cotyledons whose ANGLE is the crop's
 * first hint: flat for a root, upright for a climber, narrow for a leek.
 * @param {number[]} accent
 * @param {'flat' | 'upright' | 'narrow'} habit
 * @returns {Canvas}
 */
function sproutStage(accent, habit) {
  const canvas = createCanvas(32, 32);
  sownMound(canvas, 9, 29, 2.6, accent);
  sownMound(canvas, 16, 29, 3, accent);
  sownMound(canvas, 23, 29, 2.6, accent);

  if (habit === 'flat') {
    ellipse(canvas, 13.5, 25.5, 2.6, 1.3, GRASS_LIGHT, 0.2);
    ellipse(canvas, 18.5, 25.5, 2.6, 1.3, GRASS_BASE, 0.2);
  } else if (habit === 'upright') {
    blade(canvas, 14, 27, 4, -1, GRASS_BASE, GRASS_LIGHT);
    blade(canvas, 18, 27, 5, 1, GRASS_LIGHT, LEAF_HIGHLIGHT);
  } else {
    blade(canvas, 15, 27, 5, 0, GRASS_BASE, GRASS_LIGHT);
    blade(canvas, 17, 27, 4, 0, GRASS_SHADOW, GRASS_BASE);
  }

  ellipse(canvas, 16, 24, 1.4, 1.1, LEAF_HIGHLIGHT, 0.2);
  outlineSilhouette(canvas);
  return canvas;
}

/**
 * Finishes a stage-2 or stage-3 canvas: outline, then the contact shadow that
 * seats it on the tile (PIXEL_GUIDE.md §2).
 * @param {Canvas} canvas
 * @param {number} width
 * @returns {Canvas}
 */
function seated(canvas, width) {
  outlineSilhouette(canvas);
  contactShadow(canvas, 16, 29.5, width, 1.6);
  return canvas;
}

// ── Pea — climbs a twig trellis; round pods (spring) ─────────────────────────

/** @returns {Canvas} */
function peaGrowing() {
  const canvas = createCanvas(32, 32);
  cane(canvas, 11, 28, 9);
  cane(canvas, 21, 28, 9);
  // Tendrils curling between the two canes — the read that says "climbing".
  for (const [x, y] of [
    [13, 22],
    [14, 21],
    [17, 21],
    [19, 22],
    [15, 20],
    [18, 20],
  ]) {
    set(canvas, x, y, GRASS_LIGHT);
  }
  blade(canvas, 12, 27, 6, 2, GRASS_BASE, GRASS_LIGHT);
  blade(canvas, 19, 27, 6, -2, GRASS_BASE, GRASS_LIGHT);
  return seated(canvas, 9);
}

/** @returns {Canvas} */
function peaMature() {
  const canvas = createCanvas(32, 32);
  // FOLIAGE FIRST, CANES SECOND. The first pass drew the canes underneath and
  // the leaf mass swallowed them, which left a green blob indistinguishable
  // from the cabbage — caught on the contact sheet, which is what that gate is
  // for. The canes now overdraw, and they stand ABOVE the leaves, so the
  // silhouette is a trellis with a plant on it rather than a plant.
  lobes(
    canvas,
    [
      [16, 22, 5, 4],
      [12, 25, 3.4, 3],
      [20, 25, 3.4, 3],
    ],
    GRASS_BASE,
  );
  lobes(
    canvas,
    [
      [15, 21, 3.4, 2.8],
      [11.6, 24.4, 2.2, 2],
    ],
    GRASS_LIGHT,
  );

  cane(canvas, 10, 28, 18);
  cane(canvas, 22, 28, 18);
  // The cross-tie at the top — two sticks are a pair, two sticks and a tie are
  // a structure somebody built.
  for (let x = 10; x <= 22; x += 1) set(canvas, x, 11, WOOD_BASE);
  set(canvas, 16, 10, WOOD_LIGHT);

  // Tendrils reaching up the canes, above the leaf mass.
  for (const [x, y] of [
    [11, 16],
    [12, 15],
    [21, 16],
    [20, 14],
    [13, 13],
    [19, 12],
  ]) {
    set(canvas, x, y, GRASS_LIGHT);
  }

  // Pods hanging OUTSIDE the leaf mass, against the canes, where nothing
  // overdraws them.
  for (const [px, py] of [
    [12, 20],
    [20, 21],
    [16, 27],
  ]) {
    ellipse(canvas, px, py, 1.3, 2.4, LEAF_HIGHLIGHT, 0.2);
    set(canvas, px, py - 2, CREAM);
    set(canvas, px, py + 2, GRASS_SHADOW);
  }
  return seated(canvas, 13);
}

// ── Strawberry — low trefoil leaves, berries at the rim (spring, summer) ─────

/** @returns {Canvas} */
function strawberryGrowing() {
  const canvas = createCanvas(32, 32);
  lobes(
    canvas,
    [
      [11, 26, 4, 2.6],
      [21, 26, 4, 2.6],
      [16, 24.5, 4.6, 3],
    ],
    GRASS_BASE,
  );
  lobes(
    canvas,
    [
      [10.4, 25.2, 2.6, 1.7],
      [15.4, 23.6, 3, 2],
    ],
    GRASS_LIGHT,
  );
  // Leaf veins, sparingly — a trefoil reads by its notches.
  for (const x of [11, 16, 21]) set(canvas, x, 26, GRASS_SHADOW);
  return seated(canvas, 12);
}

/** @returns {Canvas} */
function strawberryMature() {
  const canvas = createCanvas(32, 32);
  lobes(
    canvas,
    [
      [10, 25, 4.4, 3],
      [22, 25, 4.4, 3],
      [16, 23, 5, 3.4],
    ],
    GRASS_BASE,
  );
  lobes(
    canvas,
    [
      [9.4, 24.2, 2.8, 1.9],
      [15.4, 22.2, 3.2, 2.2],
    ],
    GRASS_LIGHT,
  );
  // Berries hang BELOW the leaf mass at the rim, which is what stops this
  // reading as a bush: the fruit is under the canopy, not on top of it.
  for (const [bx, by] of [
    [8, 27],
    [16, 28],
    [23, 27],
  ]) {
    ellipse(canvas, bx, by, 2, 2.2, BLOOM_ROSE, 0.2);
    set(canvas, bx - 1, by - 1, CREAM);
    set(canvas, bx, by + 2, BLOOM_ROSE);
  }
  return seated(canvas, 14);
}

// ── Leek — a narrow vertical column, pale at the foot (spring, winter) ───────

/** @returns {Canvas} */
function leekGrowing() {
  const canvas = createCanvas(32, 32);
  for (const [x, h, body] of [
    [14, 8, GRASS_SHADOW],
    [16, 10, GRASS_BASE],
    [18, 8, GRASS_SHADOW],
  ]) {
    blade(canvas, x, 28, h, 0, body, GRASS_LIGHT);
  }
  // The pale shank, which is the leek's whole identity.
  for (let y = 26; y <= 28; y += 1) {
    set(canvas, 15, y, CREAM_SHADE);
    set(canvas, 16, y, CREAM);
    set(canvas, 17, y, CREAM_SHADE);
  }
  return seated(canvas, 6);
}

/** @returns {Canvas} */
function leekMature() {
  const canvas = createCanvas(32, 32);
  // Straps splay only at the very top — the silhouette stays a column, which
  // is the one narrow shape in a field of round ones.
  for (const [x, h, lean, body] of [
    [13, 13, -3, GRASS_SHADOW],
    [15, 17, -1, GRASS_BASE],
    [17, 18, 1, GRASS_LIGHT],
    [19, 13, 3, GRASS_SHADOW],
  ]) {
    blade(canvas, x, 25, h, lean, body, LEAF_HIGHLIGHT);
  }
  for (let y = 22; y <= 28; y += 1) {
    set(canvas, 14, y, CREAM_SHADE);
    set(canvas, 15, y, CREAM);
    set(canvas, 16, y, CREAM);
    set(canvas, 17, y, CREAM_SHADE);
  }
  // Roots at the foot.
  for (const x of [14, 16, 18]) set(canvas, x, 29, CREAM_SHADE);
  return seated(canvas, 7);
}

// ── Flax — wispy stems, small blue flowers (spring, autumn) ──────────────────

/** @returns {Canvas} */
function flaxGrowing() {
  const canvas = createCanvas(32, 32);
  for (const [x, h, lean] of [
    [10, 8, -1],
    [13, 10, 0],
    [16, 11, 0],
    [19, 10, 0],
    [22, 8, 1],
  ]) {
    frond(canvas, x, 28, h, lean, GRASS_BASE, GRASS_LIGHT);
  }
  return seated(canvas, 12);
}

/** @returns {Canvas} */
function flaxMature() {
  const canvas = createCanvas(32, 32);
  for (const [x, h, lean] of [
    [9, 12, -2],
    [12, 15, -1],
    [16, 17, 0],
    [20, 15, 1],
    [23, 12, 2],
  ]) {
    frond(canvas, x, 28, h, lean, GRASS_BASE, GRASS_LIGHT);
    // A four-pixel flower at each tip. Blue is the only cool accent in the
    // crop set, so flax is unmistakable even where the stems are too thin
    // to read.
    const tx = x + Math.round(lean);
    const ty = 28 - h;
    set(canvas, tx, ty, BLOOM_BLUE);
    set(canvas, tx - 1, ty, BLOOM_BLUE);
    set(canvas, tx, ty - 1, BLOOM_BLUE);
    set(canvas, tx - 1, ty + 1, CREAM);
  }
  return seated(canvas, 14);
}

// ── Tomato — a staked vine, round fruit (summer) ─────────────────────────────

/** @returns {Canvas} */
function tomatoGrowing() {
  const canvas = createCanvas(32, 32);
  cane(canvas, 16, 28, 12);
  lobes(
    canvas,
    [
      [12, 24, 3.4, 2.4],
      [20, 23, 3.4, 2.4],
      [16, 21, 3, 2.2],
    ],
    GRASS_BASE,
  );
  lobes(canvas, [[11.4, 23.2, 2, 1.5]], GRASS_LIGHT);
  return seated(canvas, 10);
}

/** @returns {Canvas} */
function tomatoMature() {
  const canvas = createCanvas(32, 32);
  // TALL, STAKED, FRUIT AT HEIGHT. The first pass hung the fruit at soil level
  // under a low leaf mass, which is the strawberry's exact silhouette in the
  // same colour — the contact sheet showed two crops a player could not tell
  // apart. A tomato is now the second-tallest thing on the farm after the corn,
  // its stake clears the foliage, and its fruit sits at mid-height where a
  // strawberry never has any.
  lobes(
    canvas,
    [
      [11, 20, 3.6, 2.8],
      [21, 17, 3.6, 2.8],
      [12, 13, 3.2, 2.4],
      [20, 24, 3.2, 2.4],
    ],
    GRASS_BASE,
  );
  lobes(
    canvas,
    [
      [10.4, 19.2, 2.2, 1.7],
      [11.4, 12.2, 2, 1.5],
    ],
    GRASS_LIGHT,
  );

  cane(canvas, 16, 28, 22);
  set(canvas, 16, 5, WOOD_LIGHT);
  // Two ties lashing the vine to its stake.
  for (const y of [14, 21]) {
    set(canvas, 15, y, GRASS_SHADOW);
    set(canvas, 17, y, GRASS_SHADOW);
  }

  // Trusses at two heights, both well clear of the ground.
  for (const [fx, fy] of [
    [12, 17],
    [20, 20],
    [13, 23],
  ]) {
    ellipse(canvas, fx, fy, 2.4, 2.2, BLOOM_ROSE, 0.2);
    set(canvas, fx - 1, fy - 1, CREAM);
    set(canvas, fx, fy - 3, GRASS_SHADOW);
  }
  return seated(canvas, 13);
}

// ── Corn — the tallest thing on the farm, tasselled (summer, autumn) ─────────

/** @returns {Canvas} */
function cornGrowing() {
  const canvas = createCanvas(32, 32);
  for (let y = 16; y <= 28; y += 1) set(canvas, 16, y, GRASS_BASE);
  blade(canvas, 12, 26, 8, -3, GRASS_SHADOW, GRASS_BASE);
  blade(canvas, 20, 25, 8, 3, GRASS_BASE, GRASS_LIGHT);
  blade(canvas, 13, 22, 7, -3, GRASS_BASE, GRASS_LIGHT);
  return seated(canvas, 9);
}

/** @returns {Canvas} */
function cornMature() {
  const canvas = createCanvas(32, 32);
  // The stalk runs almost the full canvas — corn is the only crop that does,
  // and that alone identifies it at a glance across the whole farm.
  for (let y = 6; y <= 28; y += 1) {
    set(canvas, 16, y, y > 20 ? GRASS_BASE : GRASS_LIGHT);
    if (y > 22) set(canvas, 17, y, GRASS_SHADOW);
  }
  for (const [x, by, h, lean, body] of [
    [12, 27, 10, -4, GRASS_SHADOW],
    [20, 26, 10, 4, GRASS_BASE],
    [12, 22, 9, -4, GRASS_BASE],
    [20, 20, 9, 4, GRASS_LIGHT],
    [13, 16, 8, -3, GRASS_BASE],
  ]) {
    blade(canvas, x, by, h, lean, body, LEAF_HIGHLIGHT);
  }
  // Two ears in their husks. Straw and Warning Amber — Reward Gold is reserved
  // for coins (STYLE_LOCK R-09).
  for (const [ex, ey] of [
    [14, 21],
    [18, 24],
  ]) {
    ellipse(canvas, ex, ey, 1.8, 3, STRAW, 0.2);
    ellipse(canvas, ex - 0.4, ey - 0.6, 1.1, 2, WARNING_AMBER, 0.2);
    set(canvas, ex, ey - 3, GRASS_LIGHT);
  }
  // The tassel.
  for (const [tx, ty] of [
    [15, 5],
    [16, 4],
    [17, 5],
    [14, 6],
    [18, 6],
  ]) {
    set(canvas, tx, ty, STRAW);
  }
  return seated(canvas, 10);
}

// ── Cabbage — one tight sphere, wide and low (autumn, winter) ────────────────

/** @returns {Canvas} */
function cabbageGrowing() {
  const canvas = createCanvas(32, 32);
  lobes(
    canvas,
    [
      [9, 26, 4.4, 2.8],
      [23, 26, 4.4, 2.8],
      [16, 25, 5.4, 3.4],
    ],
    GRASS_BASE,
  );
  lobes(canvas, [[15.2, 24, 3.4, 2.2]], GRASS_LIGHT);
  return seated(canvas, 14);
}

/** @returns {Canvas} */
function cabbageMature() {
  const canvas = createCanvas(32, 32);
  // A HEAD SITTING ON A SKIRT. The first pass was a plain green dome, and the
  // contact sheet put it beside the pea's leaf mass looking like the same
  // object. The outer leaves now spread wide and DARK at the soil, well past
  // the head's own width, so the read is one tight ball resting in a ring of
  // flat leaves — a shape nothing else in the set has.
  lobes(
    canvas,
    [
      [5, 28, 5, 2.2],
      [27, 28, 5, 2.2],
      [10, 29, 6, 2],
      [22, 29, 6, 2],
      [16, 29, 9, 2],
    ],
    GRASS_SHADOW,
  );
  lobes(
    canvas,
    [
      [7, 27, 3.6, 1.6],
      [25, 27, 3.6, 1.6],
    ],
    GRASS_BASE,
  );
  // Leaf ribs radiating out across the skirt.
  for (const [rx, ry] of [
    [6, 27],
    [9, 28],
    [23, 28],
    [26, 27],
    [16, 30],
  ]) {
    set(canvas, rx, ry, GRASS_LIGHT);
  }

  // The head: tight, high, and narrower than the skirt beneath it.
  ellipse(canvas, 16, 22, 6.4, 5.8, GRASS_BASE, 0.15);
  ellipse(canvas, 14.9, 20.9, 4.6, 4.1, GRASS_LIGHT, 0.15);
  ellipse(canvas, 14.2, 20.2, 2.4, 2, LEAF_HIGHLIGHT, 0.15);
  // Curled seams wrapping the ball, which is what says "layers".
  for (const [sx, sy] of [
    [19, 18],
    [21, 20],
    [21, 23],
    [19, 25],
    [12, 26],
  ]) {
    set(canvas, sx, sy, GRASS_SHADOW);
  }
  return seated(canvas, 19);
}

// ── Squash — sprawls sideways where pumpkin stands up (winter) ───────────────

/** @returns {Canvas} */
function squashGrowing() {
  const canvas = createCanvas(32, 32);
  // A trailing vine along the ground, which no other crop has.
  for (const [x, y] of [
    [7, 28],
    [9, 27],
    [12, 27],
    [15, 28],
    [18, 27],
    [21, 27],
    [24, 28],
  ]) {
    set(canvas, x, y, GRASS_BASE);
  }
  lobes(
    canvas,
    [
      [11, 24, 4, 2.8],
      [20, 24, 4, 2.8],
    ],
    GRASS_BASE,
  );
  lobes(canvas, [[10.4, 23.2, 2.4, 1.7]], GRASS_LIGHT);
  return seated(canvas, 15);
}

/** @returns {Canvas} */
function squashMature() {
  const canvas = createCanvas(32, 32);
  // The trailing vine, drawn first so the fruit sits on top of it.
  for (const [x, y] of [
    [5, 28],
    [7, 27],
    [10, 28],
    [24, 27],
    [27, 28],
  ]) {
    set(canvas, x, y, GRASS_BASE);
  }
  lobes(
    canvas,
    [
      [8, 23, 4.4, 3],
      [24, 23, 4.4, 3],
    ],
    GRASS_BASE,
  );
  lobes(canvas, [[7.4, 22.2, 2.6, 1.9]], GRASS_LIGHT);

  // The fruit LIES DOWN. Pumpkin is a tall ribbed sphere sitting upright;
  // this is a wide low oblong with its stem out to one side, and that
  // difference is the whole reason both can be orange without colliding.
  ellipse(canvas, 16, 26, 8.2, 4, PUMPKIN, 0.15);
  ellipse(canvas, 14.4, 25, 5.6, 2.8, CARROT_ORANGE, 0.15);
  // Two lengthwise seams, following the long axis rather than the short one.
  for (let x = 10; x <= 22; x += 1) {
    if (x % 2 === 0) set(canvas, x, 24, SOFT_INK);
    if (x % 3 === 0) set(canvas, x, 28, SOFT_INK);
  }
  // Stem out the side, not the top.
  set(canvas, 24, 25, WOOD_BASE);
  set(canvas, 25, 24, WOOD_LIGHT);
  set(canvas, 25, 25, WOOD_BASE);
  return seated(canvas, 19);
}

// ── Produce icons (16×16, ICON_GUIDE.md: one subject, centred, silhouette) ───

/** @returns {Canvas} */
function itemPea() {
  const canvas = createCanvas(16, 16);
  // An open pod showing three peas — a shape nothing else in the set has.
  ellipse(canvas, 8, 9, 6, 3, GRASS_BASE, 0.15);
  ellipse(canvas, 7.4, 8.2, 4.6, 1.9, GRASS_LIGHT, 0.15);
  for (const cx of [5, 8, 11]) {
    ellipse(canvas, cx, 9, 1.5, 1.5, LEAF_HIGHLIGHT, 0.2);
    set(canvas, cx - 1, 8, CREAM);
  }
  set(canvas, 13, 7, GRASS_SHADOW);
  set(canvas, 14, 6, GRASS_BASE);
  outlineSilhouette(canvas);
  return canvas;
}

/** @returns {Canvas} */
function itemStrawberry() {
  const canvas = createCanvas(16, 16);
  // ONE fruit, tapering to a point — read against the tomato's truss of two.
  // The taper is exaggerated past life so the outline alone carries it at 1x.
  ellipse(canvas, 8, 8, 4.4, 3.6, BLOOM_ROSE, 0.15);
  for (const [w, y] of [
    [3, 11],
    [2, 12],
    [1, 13],
    [0, 14],
  ]) {
    for (let x = 8 - w; x <= 8 + w; x += 1) set(canvas, x, y, BLOOM_ROSE);
  }
  ellipse(canvas, 6.8, 7.2, 2.2, 1.9, CREAM, 0.15);
  ellipse(canvas, 6.9, 7.4, 1.4, 1.2, BLOOM_ROSE, 0.15);
  // Seeds: single cream pixels off the lit face.
  for (const [sx, sy] of [
    [10, 7],
    [9, 10],
    [6, 11],
    [11, 9],
    [8, 12],
  ]) {
    set(canvas, sx, sy, CREAM);
  }
  // Calyx: a spray of sepals wider than the fruit's shoulder.
  for (const [cx, cy] of [
    [4, 4],
    [5, 5],
    [8, 3],
    [11, 5],
    [12, 4],
    [6, 4],
    [10, 4],
    [8, 4],
    [7, 4],
    [9, 4],
  ]) {
    set(canvas, cx, cy, GRASS_BASE);
  }
  set(canvas, 8, 2, GRASS_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

/** @returns {Canvas} */
function itemLeek() {
  const canvas = createCanvas(16, 16);
  // Laid diagonally so a long thin subject fills a square frame.
  for (let i = 0; i < 7; i += 1) {
    set(canvas, 3 + i, 12 - i, CREAM);
    set(canvas, 4 + i, 12 - i, CREAM_SHADE);
  }
  for (let i = 0; i < 5; i += 1) {
    set(canvas, 9 + i, 5 - Math.floor(i / 2), GRASS_BASE);
    set(canvas, 9 + i, 6 - Math.floor(i / 2), GRASS_LIGHT);
    set(canvas, 8 + i, 4 - Math.floor(i / 2), GRASS_SHADOW);
  }
  for (const x of [2, 3]) set(canvas, x, 13, CREAM_SHADE);
  outlineSilhouette(canvas);
  return canvas;
}

/** @returns {Canvas} */
function itemFlax() {
  const canvas = createCanvas(16, 16);
  // A tied bundle of stems with blue flowers at the top — the only cool
  // accent among the produce icons.
  for (const [x, top] of [
    [5, 3],
    [8, 2],
    [11, 4],
  ]) {
    for (let y = top; y <= 11; y += 1) set(canvas, x, y, GRASS_BASE);
    set(canvas, x, top, BLOOM_BLUE);
    set(canvas, x - 1, top + 1, BLOOM_BLUE);
    set(canvas, x + 1, top + 1, BLOOM_BLUE);
    set(canvas, x, top + 1, CREAM);
  }
  for (let x = 4; x <= 12; x += 1) set(canvas, x, 12, WOOD_BASE);
  set(canvas, 6, 13, WOOD_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

/** @returns {Canvas} */
function itemTomato() {
  const canvas = createCanvas(16, 16);
  // A TRUSS OF TWO, not one fruit. A single round red fruit under a green
  // calyx is the strawberry icon at this size — the contact sheet showed two
  // items a player would have to read the tooltip to tell apart. Two fruits
  // sharing a stem is a silhouette nothing else in the catalogue has, and it
  // matches how the crop is drawn in the field.
  for (let y = 2; y <= 6; y += 1) set(canvas, 8, y, GRASS_BASE);
  set(canvas, 8, 1, GRASS_LIGHT);
  set(canvas, 6, 4, GRASS_BASE);
  set(canvas, 10, 4, GRASS_BASE);
  set(canvas, 5, 5, GRASS_SHADOW);
  set(canvas, 11, 5, GRASS_SHADOW);

  for (const [cx, cy] of [
    [5, 9],
    [11, 10],
  ]) {
    ellipse(canvas, cx, cy, 3.4, 3.1, BLOOM_ROSE, 0.15);
    ellipse(canvas, cx - 0.9, cy - 0.8, 1.9, 1.6, CREAM, 0.15);
    ellipse(canvas, cx - 0.8, cy - 0.7, 1.3, 1.1, BLOOM_ROSE, 0.15);
    set(canvas, cx, cy - 4, GRASS_SHADOW);
  }
  outlineSilhouette(canvas);
  return canvas;
}

/** @returns {Canvas} */
function itemCorn() {
  const canvas = createCanvas(16, 16);
  // A husked ear, peeled part-way — kernels in rows so it reads as grain.
  ellipse(canvas, 8, 8.5, 3.4, 6, STRAW, 0.15);
  ellipse(canvas, 7.2, 7.4, 2.2, 4.4, WARNING_AMBER, 0.15);
  for (let y = 4; y <= 12; y += 2) {
    for (let x = 6; x <= 10; x += 2) set(canvas, x, y, STRAW);
  }
  // Husk leaves peeling back on the left.
  for (let i = 0; i < 6; i += 1) {
    set(canvas, 4, 8 + i, GRASS_BASE);
    set(canvas, 3 + Math.floor(i / 3), 9 + i, GRASS_SHADOW);
  }
  set(canvas, 12, 10, GRASS_BASE);
  set(canvas, 12, 11, GRASS_SHADOW);
  set(canvas, 8, 2, GRASS_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

/** @returns {Canvas} */
function itemCabbage() {
  const canvas = createCanvas(16, 16);
  // One closed sphere with curled seams — no leaves fanning out, which is
  // what separates it from the turnip icon.
  ellipse(canvas, 8, 9, 6, 5.4, GRASS_BASE, 0.15);
  ellipse(canvas, 6.8, 7.8, 4, 3.4, GRASS_LIGHT, 0.15);
  ellipse(canvas, 6.4, 7.4, 2, 1.7, LEAF_HIGHLIGHT, 0.15);
  for (const [sx, sy] of [
    [11, 7],
    [12, 9],
    [11, 11],
    [9, 13],
    [5, 12],
  ]) {
    set(canvas, sx, sy, GRASS_SHADOW);
  }
  outlineSilhouette(canvas);
  return canvas;
}

/** @returns {Canvas} */
function itemSquash() {
  const canvas = createCanvas(16, 16);
  // Lying down, stem to the side — the pumpkin icon stands up with its stem
  // on top, and at 16×16 that is the only difference a player can see.
  ellipse(canvas, 7.5, 9.5, 6, 3.4, PUMPKIN, 0.15);
  ellipse(canvas, 6.2, 8.6, 4, 2.2, CARROT_ORANGE, 0.15);
  for (let x = 3; x <= 11; x += 2) set(canvas, x, 8, SOFT_INK);
  set(canvas, 13, 8, WOOD_BASE);
  set(canvas, 14, 7, WOOD_LIGHT);
  set(canvas, 13, 9, WOOD_BASE);
  outlineSilhouette(canvas);
  return canvas;
}

// ── The table ────────────────────────────────────────────────────────────────

/**
 * @typedef {object} CropArt
 * @property {string} name
 * @property {number[]} accent signature colour: seed specks and the seed pouch
 * @property {'flat' | 'upright' | 'narrow'} habit how the cotyledons open
 * @property {() => Canvas} growing
 * @property {() => Canvas} mature
 * @property {() => Canvas} icon
 */

/** @type {CropArt[]} */
const CROPS = [
  {
    name: 'pea',
    accent: LEAF_HIGHLIGHT,
    habit: 'upright',
    growing: peaGrowing,
    mature: peaMature,
    icon: itemPea,
  },
  {
    name: 'strawberry',
    accent: BLOOM_ROSE,
    habit: 'flat',
    growing: strawberryGrowing,
    mature: strawberryMature,
    icon: itemStrawberry,
  },
  {
    name: 'leek',
    accent: CREAM,
    habit: 'narrow',
    growing: leekGrowing,
    mature: leekMature,
    icon: itemLeek,
  },
  {
    name: 'flax',
    accent: BLOOM_BLUE,
    habit: 'narrow',
    growing: flaxGrowing,
    mature: flaxMature,
    icon: itemFlax,
  },
  {
    name: 'tomato',
    accent: BLOOM_ROSE,
    habit: 'upright',
    growing: tomatoGrowing,
    mature: tomatoMature,
    icon: itemTomato,
  },
  {
    name: 'corn',
    accent: STRAW,
    habit: 'upright',
    growing: cornGrowing,
    mature: cornMature,
    icon: itemCorn,
  },
  {
    name: 'cabbage',
    accent: GRASS_LIGHT,
    habit: 'flat',
    growing: cabbageGrowing,
    mature: cabbageMature,
    icon: itemCabbage,
  },
  {
    name: 'squash',
    accent: CARROT_ORANGE,
    habit: 'flat',
    growing: squashGrowing,
    mature: squashMature,
    icon: itemSquash,
  },
];

function main() {
  const cropsDir = join(SRC, 'crops{tps}');
  const iconsDir = join(SRC, 'ui-world{tps}');
  mkdirSync(cropsDir, { recursive: true });
  mkdirSync(iconsDir, { recursive: true });

  for (const crop of CROPS) {
    writePng(join(cropsDir, `${crop.name}_0.png`), seedStage(crop.accent));
    writePng(join(cropsDir, `${crop.name}_1.png`), sproutStage(crop.accent, crop.habit));
    writePng(join(cropsDir, `${crop.name}_2.png`), crop.growing());
    writePng(join(cropsDir, `${crop.name}_3.png`), crop.mature());
    writePng(join(iconsDir, `item_${crop.name}.png`), crop.icon());
    writePng(join(iconsDir, `item_${crop.name}_seed.png`), itemSeedPouch(crop.accent));
  }

  globalThis.console.log(`crops(v0.6): ${String(CROPS.length * 6)} sprites`);
}

main();
