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
  BLOOM_BLUE,
  BLOOM_ROSE,
  CARROT_ORANGE,
  CREAM,
  CREAM_SHADE,
  GRASS_BASE,
  GRASS_LIGHT,
  GRASS_SHADOW,
  LEAF_HIGHLIGHT,
  GOLD_HIGHLIGHT,
  PARCHMENT,
  REWARD_GOLD,
  PUMPKIN,
  SOFT_INK,
  ROOF_CLAY,
  ROOF_MOSS,
  ROOF_SLATE,
  ROOF_SLATE_DEEP,
  ROOF_SLATE_LIGHT,
  ROOF_TERRACOTTA,
  SOIL_DARK,
  SOIL_RICH,
  STONE_BASE,
  STONE_DARK,
  STONE_LIGHT,
  STONE_WARM,
  STONE_WARM_DARK,
  STONE_WARM_LIGHT,
  STRAW,
  TIMBER_DARK,
  TIMBER_WARM,
  BIRCH_PALE,
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
import {
  blob,
  ditherBand,
  ditherRect,
  line,
  material,
  outlineSelective,
  polygon,
} from './lib/pixel-craft.mjs';

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

/**
 * Ground texture: hand-placed CLUSTERS, wrapped so the tile stays seamless.
 *
 * `ART_DIRECTION.md` §9.2 is binding here and cost three prototype iterations
 * to learn: a 32 px tile cannot carry an ordered dither (a 4×4 matrix repeats
 * eight times across it and resolves into a visible cross-hatch), and solid
 * tonal blobs read as polka dots. Small marks in a low-contrast tone are what
 * the eye reads as ground rather than as a pattern.
 *
 * @param {import('./lib/pixel-art.mjs').Canvas} canvas
 * @param {() => number} rng
 * @param {number} count how many marks
 * @param {number[]} colour
 * @param {number} length blades per mark; 2 is turf, 3 is tussock
 * @param {number} [lean] 0 upright, 1 leaning right — a whole field leaning the
 *   same way is what makes grass look combed rather than grown
 * @returns {void}
 */
function blades(canvas, rng, count, colour, length, lean = 0) {
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(rng() * canvas.width);
    const y = Math.floor(rng() * canvas.height);
    for (let d = 0; d < length; d += 1) {
      const dx = d > 0 && rng() < lean ? 1 : 0;
      set(canvas, (x + dx) % canvas.width, (y + d) % canvas.height, colour);
    }
  }
}

/**
 * Tended grass — the most-repeated pixel in the game, and therefore the one
 * every other asset is judged against.
 *
 * TIER 3 (`ART_DIRECTION.md` §9.1). It must lose to everything standing on it,
 * which is why the contrast between the marks and the base is deliberately
 * small: a lively tile that a worker gets lost in has failed, however pretty.
 *
 * @param {number} [seed]
 * @param {{ blooms?: number, tufts?: number }} [character] what makes this
 *   VARIANT differ from its siblings. One tile repeated across a field is the
 *   flat look the cozy pass exists to fix, and variation BETWEEN tiles is the
 *   honest way to remove it — not more texture inside one tile.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function grassTile(seed = 1201, character = {}) {
  const { blooms = 0, tufts = 6, bare = 0 } = character;
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => GRASS_BASE);
  const rng = prng(seed);

  // Turf: the low-contrast mass that reads as ground.
  blades(canvas, rng, 26, GRASS_SHADOW, 2, 0.3);
  blades(canvas, rng, 22, GRASS_LIGHT, 2, 0.3);
  // Tussocks: a few taller marks, so the surface is not uniformly short.
  blades(canvas, rng, tufts, GRASS_LIGHT, 3, 0.5);
  // The rim highlight stays RARE. It is the brightest green in the palette and
  // at any density it starts competing with crops, which are Tier 1.
  blades(canvas, rng, 3, LEAF_HIGHLIGHT, 1);

  // WORN EARTH: a patch where the turf has thinned (phase-44). The single
  // largest reason the world still read as a grid after the buildings grew is
  // that most of the screen is grass and every square of it was the same green.
  // Another face on the same tile is the cheapest possible variation — no extra
  // sprite, no extra draw call.
  //
  // CLUSTERED MARKS, NOT A DITHERED BLOB, and this is the third time the same
  // lesson has been learned in this repository: `ART_DIRECTION.md` §9.2 says a
  // 32 px tile cannot carry an ordered dither because a 4x4 Bayer matrix
  // repeats eight times across it and resolves into a visible cross-hatch. The
  // first attempt here dithered soil over grass and produced exactly that — a
  // woven diamond — in a rule this file's own header points at.
  //
  // Soil marks scattered around a centre, densest in the middle, thinning at
  // the edge. Which is also what a worn patch actually looks like.
  for (let i = 0; i < bare; i += 1) {
    const cx = rng() * TILE;
    const cy = rng() * TILE;
    for (let n = 0; n < 26; n += 1) {
      // Square root of a uniform draw clusters points toward the centre.
      const radius = Math.sqrt(rng()) * 8;
      const angle = rng() * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * radius);
      const y = Math.round(cy + Math.sin(angle) * radius * 0.7);
      set(canvas, ((x % TILE) + TILE) % TILE, ((y % TILE) + TILE) % TILE,
        rng() < 0.3 ? SOIL_RICH : TILLED_SOIL);
    }
  }

  // Blooms: two pixels, and only on the variants that carry them. A flower on
  // every tile is a meadow, and the farm is not supposed to read as a meadow.
  for (let i = 0; i < blooms; i += 1) {
    const x = Math.floor(rng() * TILE);
    const y = Math.floor(rng() * TILE);
    const petal = rng() < 0.5 ? BLOOM_ROSE : rng() < 0.6 ? BLOOM_BLUE : CREAM;
    set(canvas, x, y, petal);
    if (rng() < 0.45) set(canvas, (x + 1) % TILE, y, petal);
    set(canvas, x, (y + 1) % TILE, GRASS_SHADOW);
  }
  return canvas;
}

/** The tilled-soil state (GAME_DESIGN §2.2): horizontal furrows, spacing that
 * continues across tile edges (period 4 rows), lit ridge above each groove.
 *
 * The ridge is SOIL_RICH now rather than a wood colour — freshly-turned earth
 * catching the light. Wood on soil was the old palette having nothing else.
 * @returns {import('./lib/pixel-art.mjs').Canvas} */
function tilledTile(seed = 1202, character = {}) {
  const { stones = 0, weeds = 0 } = character;
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => TILLED_SOIL);
  const rng = prng(seed);

  // FULL-WIDTH furrows, period 4, and IDENTICAL in every variant. The first
  // attempt broke the groove into scattered pixels and the reviewed scene
  // showed the result: at 1x a whole field averaged into one flat brown slab,
  // because a texture that survives 4x inspection can vanish at the size the
  // game is played at. Corduroy is what a ploughed field looks like from
  // above, and it gives the crops standing on it a direction to sit against.
  for (let y = 2; y < TILE; y += 4) {
    for (let x = 0; x < TILE; x += 1) {
      // The groove: two rows dark, so the shadow has width at 1x.
      set(canvas, x, y, SOIL_DARK);
      if (rng() < 0.75) set(canvas, x, (y + 1) % TILE, SOIL_DARK);
      // The ridge above it, lit from the upper-left. Broken, not ruled — an
      // unbroken line reads as a drawn grid rather than as turned earth.
      if (rng() < 0.8) set(canvas, x, (y + TILE - 1) % TILE, SOIL_RICH);
    }
  }

  // Clods on the ridges, so the bands are not perfectly parallel.
  for (let i = 0; i < 18; i += 1) {
    const x = Math.floor(rng() * TILE);
    const y = Math.floor(rng() * TILE);
    set(canvas, x, y, rng() < 0.5 ? SOIL_RICH : SOIL_DARK);
  }

  // THE VARIANTS VARY THE DEBRIS, NEVER THE FURROWS. Phase-33 said tilled soil
  // is not varied at all, and that was half right: a field of furrows is a MADE
  // thing, and irregular furrow geometry reads as a mistake rather than as
  // nature. Stones and weeds are the opposite — they are the field being
  // worked and lived in, which is what the brief asks a farm to show, and they
  // sit ON the pattern instead of disturbing it.
  for (let i = 0; i < stones; i += 1) {
    const x = 2 + Math.floor(rng() * (TILE - 4));
    const y = 2 + Math.floor(rng() * (TILE - 4));
    set(canvas, x, y, STONE_WARM_DARK);
    set(canvas, x + 1, y, STONE_WARM_DARK);
    set(canvas, x, y - 1, STONE_WARM_LIGHT);
  }
  for (let i = 0; i < weeds; i += 1) {
    const x = 2 + Math.floor(rng() * (TILE - 4));
    const y = 4 + Math.floor(rng() * (TILE - 6));
    // Small and DULL. A bright weed competes with the crop standing beside it,
    // and the crop is Tier 1 (`ART_DIRECTION.md` §9.1).
    set(canvas, x, y, GRASS_SHADOW);
    set(canvas, x, y - 1, GRASS_SHADOW);
    set(canvas, x + 1, y - 1, GRASS_BASE);
  }
  return canvas;
}

/** Decorative still water (`core:water`); the animated shimmer is a v0.2 spec
 * (ANIMATION_GUIDE §3 — the chunk renderer bakes static terrain today).
 *
 * The one place an ordered dither belongs on a tile: it spans the deep-to-base
 * TRANSITION rather than the whole surface, which is the scale §9.2 permits.
 * @returns {import('./lib/pixel-art.mjs').Canvas} */
function waterTile() {
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => WATER_BASE);
  const rng = prng(1203);
  // Deeper water toward the bottom, blended by a dithered band rather than a
  // hard edge, so a pond has depth without a gradient (R-02).
  ditherRect(canvas, 0, 23, TILE - 1, TILE - 1, WATER_DEEP, 0.9);
  ditherBand(canvas, 0, 17, TILE - 1, 23, WATER_BASE, WATER_DEEP);
  // Calm ripples, wrapped. Short and broken; a full-width line reads as a seam.
  for (let i = 0; i < 9; i += 1) {
    const x = Math.floor(rng() * TILE);
    const y = Math.floor(rng() * TILE);
    const len = 2 + Math.floor(rng() * 3);
    for (let d = 0; d < len; d += 1) set(canvas, (x + d) % TILE, y, WATER_LIGHT);
  }
  return canvas;
}

/** Decorative rock face (`core:stone`): cobble seams, facets lit upper-left.
 *
 * Keeps the COLD stone ramp on purpose (`COLOR_PALETTE.md` §3.2c) — this is
 * ore-bearing rock, the one material the brief's "no sterile grey" does not
 * govern. The warm ramp went to paths and walls, which people touch.
 * @returns {import('./lib/pixel-art.mjs').Canvas} */
function stoneTile() {
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => STONE_BASE);
  const rng = prng(1204);
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
  // A few warm notes, so a rock face beside a warm path does not read as a
  // different game. Sparse: the material is still cold.
  scatter(canvas, rng, 4, (x, y) => set(canvas, x, y, STONE_WARM_DARK));
  return canvas;
}

/** Player-placed path (`core:path`, GAME_DESIGN §2.2): packed earth with the
 * stones trodden into it, clearly warmer and brighter than grass or soil so a
 * route reads at a glance.
 *
 * Was WOOD_LIGHT over WOOD_BASE — a path made of the plank colours, because
 * the old palette had no warm stone. It now uses the ramp that exists for it.
 * @returns {import('./lib/pixel-art.mjs').Canvas} */
function pathTile() {
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => STONE_WARM_LIGHT);
  const rng = prng(1205);
  // Worn hollows: irregular patches of the mid tone, so the surface is uneven
  // rather than speckled.
  scatter(canvas, rng, 9, (x, y) => {
    const w = 2 + Math.floor(rng() * 3);
    for (let dx = 0; dx < w; dx += 1) {
      set(canvas, (x + dx) % TILE, y, STONE_WARM);
      if (rng() < 0.55) set(canvas, (x + dx) % TILE, (y + 1) % TILE, STONE_WARM);
    }
  });
  // Pebbles pressed into the surface — a dark base with a lit crown, the
  // smallest shape that reads as an object rather than as dirt.
  scatter(canvas, rng, 7, (x, y) => {
    set(canvas, x, y, STONE_WARM_DARK);
    set(canvas, (x + 1) % TILE, y, STONE_WARM_DARK);
    set(canvas, x, (y + TILE - 1) % TILE, CREAM);
  });
  // Earth showing through, and the odd dry stalk — the warm accents that stop
  // the path reading as poured concrete.
  scatter(canvas, rng, 6, (x, y) => set(canvas, x, y, SOIL_RICH));
  scatter(canvas, rng, 3, (x, y) => set(canvas, x, y, STRAW));
  return canvas;
}

/** Untamed ground (`terrain:wild`, phase-27 — ADR-037 §1): the wilds, where
 * nothing is mown and nothing is owned. DARKER than `grass` at the base with
 * TALLER blades, so the two never read as one field at gameplay zoom — the
 * boundary between farmland and wilderness has to be legible without a fence.
 * Dry tufts and small stones are the texture that says "nobody works this".
 *
 * @param {number} [seed]
 * @param {{ stones?: number }} [character]
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function wildTile(seed = 1206, character = {}) {
  const { stones = 9 } = character;
  const canvas = createCanvas(TILE, TILE);
  fill(canvas, () => GRASS_SHADOW);
  const rng = prng(seed);
  // Tussocks: 3 px blades against grass's 2 px pairs, and they LEAN. Height and
  // disorder are the tell; a mown lawn is upright and even.
  blades(canvas, rng, 30, GRASS_BASE, 3, 0.6);
  blades(canvas, rng, 12, GRASS_LIGHT, 3, 0.6);
  // Dead growth — the one warm note, and sparse. Straw here would read as a
  // wheat field, so the dry tufts are WOOD_BASE and STRAW is a rare accent.
  // Dead growth — the one warm note, and SPARSE. The first attempt put seven
  // tufts with a straw highlight on each and the reviewed scene read as orange
  // confetti scattered over the wilds. Straw is the brightest warm colour in
  // the palette; against a dark green it is nearly a signal.
  scatter(canvas, rng, 4, (x, y) => {
    set(canvas, x, y, WOOD_BASE);
    set(canvas, x, (y + 1) % TILE, WOOD_BASE);
  });
  // Scree: suggests stony ground under the turf without competing with the
  // stone TILE, which is a solid rock face.
  scatter(canvas, rng, stones, (x, y) => set(canvas, x, y, STONE_DARK));
  return canvas;
}

// ── Props (outlined, lit upper-left, contact shadow) ─────────────────────────

/**
 * Farm props (phase-37). The things that say somebody works here.
 *
 * These exist because `decor.ts` rule 3 keeps every prop OFF owned land, so a
 * farm was the one place in the world with nothing on it — bare grass around
 * the very buildings the player had chosen to put there. The fix is not to
 * relax the rule: trees and rocks stay off the plot, because rule 4 makes them
 * mean something (a tree is timber you can work). It is a SEPARATE SET that
 * only ever lands on the farm.
 *
 * TIER 3 (`ART_DIRECTION.md` §9.1), and small. Each is under 20 px and sits
 * low, so it dresses the ground a worker walks over without competing with the
 * worker.
 */
function crate() {
  const canvas = createCanvas(18, 18);
  material.boards(canvas, 1, 5, 16, 16, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 91);
  // Lid and banding, so it reads as a box rather than as a brown square.
  rect(canvas, 1, 5, 16, 6, BIRCH_PALE);
  rect(canvas, 1, 10, 16, 10, TIMBER_DARK);
  rect(canvas, 1, 5, 1, 16, TIMBER_DARK);
  rect(canvas, 16, 5, 16, 16, TIMBER_DARK);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 9, 17, 8, 1.4);
  return canvas;
}

/** A stack of sacks by the shed — grain going somewhere. */
function sacks() {
  const canvas = createCanvas(20, 18);
  blob(canvas, 6, 12, 5, 5, CREAM_SHADE, 93, 0.18);
  blob(canvas, 5, 10, 4, 3, CREAM, 95, 0.2);
  blob(canvas, 13, 13, 5, 4, CREAM_SHADE, 97, 0.18);
  blob(canvas, 12, 11, 3, 2, CREAM, 99, 0.2);
  // Tied necks, and a spill of grain at the foot.
  rect(canvas, 5, 7, 7, 8, TIMBER_DARK);
  rect(canvas, 12, 9, 14, 10, TIMBER_DARK);
  set(canvas, 16, 16, STRAW);
  set(canvas, 17, 17, STRAW);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 10, 17, 9, 1.4);
  return canvas;
}

/** A bale of hay. The roundest thing on the farm, and the warmest. */
function hayBale() {
  const canvas = createCanvas(22, 16);
  blob(canvas, 11, 9, 10, 6, STRAW, 101, 0.1);
  blob(canvas, 9, 7, 7, 4, GOLD_HIGHLIGHT, 103, 0.15);
  // Binding twine across the middle, which is what makes it a BALE.
  rect(canvas, 5, 5, 5, 14, TIMBER_DARK);
  rect(canvas, 15, 5, 15, 14, TIMBER_DARK);
  // Loose ends, so the silhouette is not a clean oval.
  set(canvas, 1, 11, STRAW);
  set(canvas, 20, 10, STRAW);
  set(canvas, 19, 13, GOLD_HIGHLIGHT);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 11, 15, 10, 1.4);
  return canvas;
}

/** A watering can and a leaning tool — the two-object still life that says a
 * person put these down and will be back for them. */
function farmTools() {
  const canvas = createCanvas(20, 22);
  // The can: body, spout, handle.
  rect(canvas, 3, 12, 11, 20, ROOF_SLATE);
  rect(canvas, 3, 12, 4, 20, ROOF_SLATE_LIGHT);
  rect(canvas, 11, 13, 15, 14, ROOF_SLATE);
  rect(canvas, 14, 12, 16, 13, ROOF_SLATE_LIGHT);
  line(canvas, 5, 11, 9, 11, ROOF_SLATE_DEEP);
  // The tool, leaning: a handle with a head.
  line(canvas, 17, 3, 14, 20, TIMBER_WARM);
  line(canvas, 18, 3, 15, 20, TIMBER_DARK);
  rect(canvas, 15, 2, 19, 4, STONE_WARM_DARK);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 9, 21, 8, 1.4);
  return canvas;
}

/**
 * Town props (phase-37). The third region's identity.
 *
 * The world is three fixed bands — farm, town, wilds — and until now decor
 * knew about exactly one boundary: it stopped at the wilds. The town got the
 * same meadow scatter as open countryside, so the one part of the map where
 * people supposedly live looked like a field with buildings in it.
 *
 * These are the objects a settlement has and a field does not: something to
 * sit on, something to read, something that lights the way home.
 */
function bench() {
  const canvas = createCanvas(24, 18);
  // Seat and back, in planking.
  material.planks(canvas, 2, 8, 21, 11, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 141);
  rect(canvas, 2, 4, 21, 5, TIMBER_WARM);
  rect(canvas, 2, 4, 21, 4, BIRCH_PALE);
  // Uprights and legs.
  for (const x of [4, 19]) {
    rect(canvas, x, 4, x, 16, TIMBER_DARK);
  }
  rect(canvas, 2, 12, 3, 16, TIMBER_DARK);
  rect(canvas, 20, 12, 21, 16, TIMBER_DARK);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 12, 17, 11, 1.4);
  return canvas;
}

/** A street lamp. The tallest town prop, and the only warm light outdoors. */
function lamp() {
  const canvas = createCanvas(16, 34);
  // Post on a stone foot.
  rect(canvas, 7, 10, 8, 30, TIMBER_DARK);
  rect(canvas, 7, 10, 7, 30, TIMBER_WARM);
  material.masonry(canvas, 5, 29, 10, 32, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 143);
  // The lantern: a slate cap over a glowing box.
  polygon(canvas, [[3, 6], [12, 6], [10, 2], [5, 2]], ROOF_SLATE);
  polygon(canvas, [[3, 6], [7, 6], [6, 2], [5, 2]], ROOF_SLATE_LIGHT);
  rect(canvas, 4, 7, 11, 12, TIMBER_DARK);
  rect(canvas, 5, 8, 10, 11, STRAW);
  rect(canvas, 6, 9, 9, 10, GOLD_HIGHLIGHT);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 8, 33, 6, 1.3);
  return canvas;
}

/** A signpost. Two boards pointing opposite ways — the shape that says a road
 * goes somewhere, without needing letters nobody could read at this size. */
function signpost() {
  const canvas = createCanvas(22, 30);
  rect(canvas, 10, 6, 11, 27, TIMBER_DARK);
  rect(canvas, 10, 6, 10, 27, TIMBER_WARM);
  // Upper board points left, lower points right.
  polygon(canvas, [[1, 8], [14, 8], [14, 13], [1, 13], [-2, 10]], BIRCH_PALE);
  polygon(canvas, [[8, 16], [20, 16], [23, 18], [20, 21], [8, 21]], BIRCH_PALE);
  rect(canvas, 2, 10, 12, 10, TIMBER_DARK);
  rect(canvas, 9, 18, 19, 18, TIMBER_DARK);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 11, 29, 6, 1.3);
  return canvas;
}

/**
 * A cat, SITTING (phase-37 — the brief §10, "small creatures, used sparingly").
 *
 * THE ONE AMBIENT CREATURE, and it is sitting rather than flying for a reason.
 * Decor is planned once and never moves, so a butterfly or a bird placed this
 * way would be frozen mid-flight — worse than no butterfly at all. A cat
 * sitting still is something that genuinely does that. Creatures that need to
 * move belong to the motion phase, with a lease.
 *
 * SITTING, not curled. Curled was the first attempt and it read as a loaf of
 * bread: at 20 px a cat is two pointed ears over a round head, and a sleeping
 * cat has neither in silhouette. Upright gives the ears somewhere to be.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function cat() {
  const canvas = createCanvas(16, 20);
  // Body: a rounded wedge, wider at the base.
  polygon(canvas, [[5, 9], [10, 9], [13, 18], [2, 18]], TIMBER_WARM);
  blob(canvas, 7, 15, 5, 4, TIMBER_WARM, 151, 0.12);
  // Chest catching the light, upper-left as always.
  blob(canvas, 6, 14, 2, 3, BIRCH_PALE, 153, 0.2);
  // Head: a circle sitting ON the body, not merged into it.
  blob(canvas, 7, 6, 4, 4, TIMBER_WARM, 155, 0.08);
  blob(canvas, 6, 5, 2, 2, BIRCH_PALE, 157, 0.2);
  // EARS — the whole silhouette argument. Two triangles, clear of the head.
  polygon(canvas, [[3, 4], [5, 1], [6, 4]], TIMBER_WARM);
  polygon(canvas, [[8, 4], [10, 1], [11, 4]], TIMBER_WARM);
  set(canvas, 4, 3, TIMBER_DARK);
  set(canvas, 10, 3, TIMBER_DARK);
  // Face: two closed eyes and nothing else. One pixel each is the whole face.
  set(canvas, 5, 6, TIMBER_DARK);
  set(canvas, 9, 6, TIMBER_DARK);
  // Tail, curled round the feet to the right.
  line(canvas, 12, 14, 14, 17, TIMBER_DARK);
  line(canvas, 10, 18, 14, 18, TIMBER_DARK);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 8, 19, 7, 1.2);
  return canvas;
}



/**
 * A tree (`buildings:tree`, and the timber node's sprite) — 64x96 px.
 *
 * GREW AGAIN IN PHASE-43, and the round trip is the point. Phase-37 shrank it
 * from 64x96 to 48x72 because a tree stood three times the height of a cottage
 * and a Tier 3 prop was dominating Tier 2 structure. That was the right call
 * against 32 px buildings. Phase-41 gave buildings footprints and phase-42 drew
 * them at 64–96 px, so the constraint that justified the shrink is gone: a
 * tree shorter than a shed reads as a shrub.
 *
 * Now it has what §7 asks for — canopy, trunk, branches, volume and an
 * irregular silhouette — and it OVERLAPS. Since phase-40 every world object
 * shares one y-sorted layer, so a canopy may cover a worker walking behind it
 * and be covered by one walking in front. That is what turns a scatter of tree
 * icons into woodland.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function tree() {
  const canvas = createCanvas(64, 96);
  const rng = prng(1301);

  // ── Trunk: tapered, with a root flare and a lit left edge ───────────────
  polygon(canvas, [[26, 46], [38, 46], [42, 92], [22, 92]], WOOD_BASE);
  polygon(canvas, [[26, 46], [30, 46], [28, 92], [22, 92]], WOOD_LIGHT);
  polygon(canvas, [[35, 46], [38, 46], [42, 92], [37, 92]], SOIL_DARK);
  // Roots spreading into the ground.
  for (const [x0, x1] of [[16, 24], [40, 48]]) {
    blob(canvas, (x0 + x1) / 2, 90, 5, 3, WOOD_BASE, 201 + x0, 0.2);
  }
  // Bark: a few short vertical marks, never a full-height line.
  for (let i = 0; i < 7; i += 1) {
    const x = 26 + Math.floor(rng() * 12);
    const y = 52 + Math.floor(rng() * 32);
    rect(canvas, x, y, x, y + 3, SOIL_DARK);
  }

  // ── Branches reaching into the canopy, so it is not a lollipop ──────────
  line(canvas, 30, 52, 16, 40, WOOD_BASE);
  line(canvas, 31, 52, 17, 40, SOIL_DARK);
  line(canvas, 34, 50, 48, 38, WOOD_BASE);
  line(canvas, 34, 51, 48, 39, SOIL_DARK);

  // ── Canopy: three masses, three values, deliberately lopsided ───────────
  blob(canvas, 32, 30, 30, 24, GRASS_SHADOW, 211, 0.16);
  blob(canvas, 28, 26, 25, 20, GRASS_BASE, 213, 0.15);
  blob(canvas, 46, 32, 15, 12, GRASS_BASE, 215, 0.18);
  blob(canvas, 22, 18, 15, 11, GRASS_LIGHT, 217, 0.2);
  blob(canvas, 40, 20, 9, 7, GRASS_LIGHT, 219, 0.22);
  blob(canvas, 18, 13, 7, 5, LEAF_HIGHLIGHT, 221, 0.25);
  // A notch of shadow under the right lobe: depth, not a filled silhouette.
  blob(canvas, 48, 42, 10, 5, GRASS_SHADOW, 223, 0.25);
  // Gaps you can see sky through, which is what stops a canopy reading as a
  // solid blob of green.
  for (let i = 0; i < 5; i += 1) {
    const x = 14 + Math.floor(rng() * 36);
    const y = 16 + Math.floor(rng() * 26);
    blob(canvas, x, y, 2, 1, GRASS_SHADOW, 231 + i, 0.3);
  }
  // Leaf texture, densest where the light falls.
  for (let i = 0; i < 40; i += 1) {
    const x = 6 + Math.floor(rng() * 52);
    const y = 6 + Math.floor(rng() * 44);
    const dx = (x - 32) / 30;
    const dy = (y - 30) / 24;
    if (dx * dx + dy * dy > 1) continue;
    if (x < 32 && y < 30 && rng() < 0.4) set(canvas, x, y, LEAF_HIGHLIGHT);
    else set(canvas, x, y, rng() < 0.5 ? GRASS_SHADOW : GRASS_LIGHT);
  }

  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 32, 93, 16, 3);
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

/**
 * A bush (`buildings:bush`) — the second most-placed prop in the world, and
 * until phase-37 two flat ellipses with eight random pixels on them.
 *
 * Rebuilt as an ASYMMETRIC three-mass clump with real value steps and a few
 * berries. It is scenery, never a resource (decor rule 4), so it must not read
 * as something worth walking to — which is why the berries are two pixels and
 * the whole thing stays low.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function bush() {
  const canvas = createCanvas(TILE, TILE);
  // Shadow mass first, then the lit body offset toward the light, then a
  // highlight — three steps, the same modelling the tree canopy uses.
  // Three steps that SKIP a rung: shadow, base, highlight. The first attempt
  // stepped shadow-base-light-highlight and the four merged into one flat pad
  // at 32 px, because adjacent greens in the ramp are too close to separate
  // over a few pixels. Fewer, further-apart values read as a rounder mass.
  blob(canvas, 16, 23, 9, 6, GRASS_SHADOW, 111, 0.22);
  blob(canvas, 14, 21, 7, 5, GRASS_BASE, 113, 0.2);
  blob(canvas, 20, 22, 5, 3, GRASS_BASE, 115, 0.22);
  blob(canvas, 12, 19, 4, 3, LEAF_HIGHLIGHT, 117, 0.26);
  // A notch of shadow under the right lobe, so the mass has depth rather than
  // being one silhouette filled in.
  blob(canvas, 21, 26, 4, 2, GRASS_SHADOW, 121, 0.3);
  // Berries. Two pixels each and sparse — scenery, not a crop.
  set(canvas, 18, 20, BLOOM_ROSE);
  set(canvas, 10, 23, BLOOM_ROSE);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 16, 27, 11, 1.8);
  return canvas;
}


/**
 * Flowers (`buildings:flower`) — the MOST-placed prop in the world.
 *
 * Was a single tall daisy on a stem, which at gameplay scale read as a mast
 * with a dish on it rather than as a flower. A CLUMP of three short blooms is
 * what a flower actually looks like from above and from a distance, and it
 * sits in the grass instead of standing out of it.
 *
 * Three colours from §3.2d, which exist precisely so decoration never has to
 * borrow a colour that signals something (R-09).
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function flower() {
  const canvas = createCanvas(TILE, TILE);
  // A low tuft of leaves the blooms sit in.
  blob(canvas, 16, 25, 8, 4, GRASS_SHADOW, 131, 0.3);
  blob(canvas, 15, 24, 6, 3, GRASS_BASE, 133, 0.3);

  /**
   * One bloom: a short stem, a two-by-two head, a lit pixel.
   * @param {number} x
   * @param {number} y
   * @param {number[]} petal
   * @returns {void}
   */
  const bloom = (x, y, petal) => {
    set(canvas, x, y + 2, GRASS_SHADOW);
    set(canvas, x, y + 1, GRASS_BASE);
    rect(canvas, x - 1, y - 1, x, y, petal);
    set(canvas, x - 1, y - 1, CREAM);
    set(canvas, x, y, STRAW);
  };

  bloom(12, 21, BLOOM_ROSE);
  bloom(19, 19, BLOOM_BLUE);
  bloom(16, 23, CREAM);
  bloom(15, 18, BLOOM_ROSE);
  outlineSelective(canvas, { bottom: false, sides: false });
  contactShadow(canvas, 16, 27, 6, 1.3);
  return canvas;
}


// ── Buildings (32×32, 1×1 footprint, top-left grid-aligned) ──────────────────


/**
 * A pitched roof, drawn as courses rather than as a filled triangle.
 *
 * Every building in the game wore the same straw trapezoid, which ADR-041's
 * audit found is most of why five of them read as one building. A roof is the
 * largest, highest-contrast shape a 32 px structure has, so it is the cheapest
 * place to spend on telling them apart — and it was being spent on making them
 * identical.
 *
 * @param {import('./lib/pixel-art.mjs').Canvas} canvas
 * @param {number} apexY ridge row
 * @param {number} baseY eave row
 * @param {number} cx ridge centre
 * @param {number} spread half-width gained per row
 * @param {number[]} base
 * @param {number[]} dark course lines and the shaded slope
 * @param {number[]} light the lit slope, upper-left
 * @returns {void}
 */
function pitchedRoof(canvas, apexY, baseY, cx, spread, base, dark, light) {
  const rows = Math.max(1, baseY - apexY);
  for (let y = apexY; y <= baseY; y += 1) {
    const half = Math.floor(((y - apexY) * spread) / rows);
    for (let x = cx - half; x <= cx + half; x += 1) {
      // Light from the upper-left (R-06): the left slope catches it.
      set(canvas, x, y, x < cx - 1 ? light : x > cx + 1 ? dark : base);
    }
    // Shingle courses every third row, so the slope has material rather than
    // being a flat wedge of colour.
    if ((y - apexY) % 3 === 2) {
      for (let x = cx - half; x <= cx + half; x += 1) set(canvas, x, y, dark);
    }
  }
  rect(canvas, cx - 1, apexY, cx + 1, apexY, light); // ridge cap
}

/**
 * Storage shed (`core:storage_shed`) — 2x2 tiles, 64x72 px.
 *
 * Redrawn at its footprint in phase-42. Still the FLATTEST roof in the set and
 * still the only building with no windows: it is a place things go, not a place
 * anyone is, and at four times the pixels that argument only gets easier to
 * make. The barn doors are the read at a glance.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function storageShed() {
  const canvas = createCanvas(64, 72);
  const groundY = 71;

  // Board walls, wall to wall — wider than they are tall, which is the shape.
  material.boards(canvas, 3, 30, 60, 68, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 61);
  // A stone footing, so it does not look like it is floating on the grass.
  material.masonry(canvas, 3, 64, 60, 68, STONE_WARM_DARK, STONE_WARM_DARK, STONE_WARM, 63);

  // SHALLOW slate roof with a deep eave — pitch is the whole argument against
  // the cottage's steep gable.
  pitchedRoof(canvas, 8, 30, 32, 30, ROOF_SLATE, ROOF_SLATE_DEEP, ROOF_SLATE_LIGHT);
  rect(canvas, 0, 30, 63, 32, ROOF_SLATE_DEEP);
  rect(canvas, 0, 28, 63, 29, ROOF_SLATE_LIGHT);

  // Double barn doors with the X-brace that says storage at any size.
  rect(canvas, 18, 38, 46, 68, TIMBER_DARK);
  material.boards(canvas, 20, 40, 31, 67, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 65);
  material.boards(canvas, 33, 40, 44, 67, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 67);
  line(canvas, 20, 40, 31, 66, BIRCH_PALE);
  line(canvas, 31, 40, 20, 66, BIRCH_PALE);
  line(canvas, 33, 40, 44, 66, BIRCH_PALE);
  line(canvas, 44, 40, 33, 66, BIRCH_PALE);
  rect(canvas, 32, 38, 32, 68, TIMBER_DARK);
  // Iron hinges and a ring handle.
  for (const y of [44, 60]) {
    rect(canvas, 20, y, 26, y + 1, SOIL_DARK);
    rect(canvas, 38, y, 44, y + 1, SOIL_DARK);
  }
  set(canvas, 30, 53, GOLD_HIGHLIGHT);
  set(canvas, 34, 53, GOLD_HIGHLIGHT);

  // A crate and a barrel outside, because a store overflows.
  rect(canvas, 49, 55, 60, 66, TIMBER_WARM);
  rect(canvas, 49, 55, 60, 56, BIRCH_PALE);
  rect(canvas, 54, 55, 55, 66, TIMBER_DARK);
  rect(canvas, 49, 60, 60, 61, TIMBER_DARK);
  blob(canvas, 9, 61, 6, 7, TIMBER_WARM, 71, 0.1);
  rect(canvas, 4, 58, 14, 59, TIMBER_DARK);
  rect(canvas, 4, 64, 14, 65, TIMBER_DARK);

  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 32, groundY, 26, 2.5);
  return canvas;
}



/**
 * Rest hut (`core:rest_hut`) — 2x2 tiles, 64x72 px.
 *
 * Redrawn at footprint scale in phase-42. Still the roundest thing in the
 * village and the only DOMED roof: where a worker goes to stop, so it is soft
 * everywhere the shed is square. At 64 px the bench, the lantern and the open
 * doorway all fit, and it stops being a hut-shaped icon.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function restHut() {
  const canvas = createCanvas(64, 72);
  const groundY = 71;

  // Cream walls on a stone footing, low and wide.
  rect(canvas, 12, 34, 52, 68, CREAM);
  rect(canvas, 12, 34, 18, 68, CREAM_SHADE);
  rect(canvas, 46, 34, 52, 68, CREAM_SHADE);
  material.masonry(canvas, 10, 62, 54, 68, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 141);

  // A DOMED roof of old moss — the only curved roof in the game.
  blob(canvas, 32, 26, 28, 18, ROOF_MOSS, 143, 0.1);
  blob(canvas, 24, 18, 16, 9, GRASS_LIGHT, 145, 0.18);
  blob(canvas, 40, 22, 9, 5, GRASS_BASE, 147, 0.2);
  // Rafter ends poking out under the eave.
  for (let x = 8; x <= 56; x += 8) rect(canvas, x, 33, x + 2, 35, TIMBER_DARK);
  rect(canvas, 6, 35, 58, 37, TIMBER_DARK);

  // A round-topped doorway, open, with warm light inside.
  blob(canvas, 32, 48, 11, 11, TIMBER_DARK, 149, 0.03);
  rect(canvas, 21, 48, 43, 68, TIMBER_DARK);
  blob(canvas, 32, 50, 8, 8, SOIL_DARK, 151, 0.04);
  rect(canvas, 24, 50, 40, 68, SOIL_DARK);
  blob(canvas, 32, 60, 6, 5, STRAW, 153, 0.2);
  rect(canvas, 20, 68, 44, 70, STONE_WARM_LIGHT); // the step

  // The bench, which is the entire point of the building.
  rect(canvas, 2, 54, 20, 56, TIMBER_DARK);
  rect(canvas, 2, 56, 20, 60, TIMBER_WARM);
  rect(canvas, 3, 60, 5, 68, TIMBER_DARK);
  rect(canvas, 17, 60, 19, 68, TIMBER_DARK);
  rect(canvas, 2, 46, 4, 56, TIMBER_DARK); // the back rail
  rect(canvas, 18, 46, 20, 56, TIMBER_DARK);
  rect(canvas, 2, 46, 20, 48, TIMBER_WARM);

  // A lantern by the door, unlit but present.
  rect(canvas, 48, 40, 50, 46, TIMBER_DARK);
  rect(canvas, 46, 46, 52, 52, TIMBER_DARK);
  rect(canvas, 47, 47, 51, 51, STRAW);

  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 32, groundY, 26, 2.5);
  return canvas;
}



/** Seed bin (`core:seed_bin`): NOT A BUILDING, and it should not read as one.
 * A low slatted box with its lid propped open and grain spilling — no roof, no
 * door, no walls, which is the clearest possible separation from its
 * neighbours in the build menu. */
function seedBin() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1403);
  // The box: slatted, low, wide.
  material.boards(canvas, 5, 17, 26, 28, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 31);
  rect(canvas, 5, 17, 26, 17, TIMBER_DARK);
  rect(canvas, 5, 22, 26, 22, TIMBER_DARK); // an iron band
  // The lid, PROPPED OPEN toward the light — the angle is the silhouette.
  polygon(canvas, [[5, 16], [24, 8], [27, 10], [8, 18]], BIRCH_PALE);
  polygon(canvas, [[5, 16], [24, 8], [25, 9], [6, 17]], CREAM);
  line(canvas, 26, 11, 26, 17, TIMBER_DARK); // the prop
  // Grain, heaped and spilling over the front edge.
  for (let i = 0; i < 26; i += 1) {
    const x = 8 + Math.floor(rng() * 15);
    const y = 17 + Math.floor(rng() * 3);
    set(canvas, x, y, rng() < 0.5 ? STRAW : GOLD_HIGHLIGHT);
  }
  set(canvas, 9, 21, STRAW);
  set(canvas, 19, 20, STRAW);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 16, 29, 12, 1.8);
  return canvas;
}


/**
 * Market stall (`core:market_stall`) — 3x2 tiles, 96x80 px.
 *
 * Redrawn at footprint scale in phase-42. The awning is the silhouette and it
 * always was; what it lacked was room. At 96 px the stall gets what a market
 * stall actually has: a striped canopy on posts, a counter with goods ON it,
 * crates stacked underneath, and a hanging sign.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function marketStall() {
  const canvas = createCanvas(96, 80);
  const rng = prng(1503);
  const groundY = 79;

  // ── Posts, front and back, so the canopy has something to stand on ──────
  for (const x of [6, 88]) {
    rect(canvas, x, 18, x + 3, 76, TIMBER_DARK);
    rect(canvas, x, 18, x, 76, TIMBER_WARM);
  }

  // ── The canopy: cream and rose stripes, scalloped along the front ───────
  polygon(canvas, [[0, 18], [95, 18], [95, 30], [0, 30]], CREAM);
  for (let x = 0; x < 96; x += 12) {
    rect(canvas, x, 18, x + 5, 30, BLOOM_ROSE);
  }
  rect(canvas, 0, 14, 95, 18, TIMBER_DARK); // the rail it hangs from
  rect(canvas, 0, 14, 95, 15, TIMBER_WARM);
  // Scallops: a half-round on the hem of each stripe.
  for (let x = 6; x < 96; x += 12) {
    blob(canvas, x, 31, 5, 3, CREAM, 111 + x, 0.05);
    blob(canvas, x + 12, 31, 5, 3, BLOOM_ROSE, 113 + x, 0.05);
  }

  // ── The counter: a plank top on a boarded front ─────────────────────────
  material.boards(canvas, 10, 50, 86, 74, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 115);
  rect(canvas, 6, 44, 90, 50, BIRCH_PALE);
  rect(canvas, 6, 44, 90, 45, CREAM);
  rect(canvas, 6, 49, 90, 50, TIMBER_DARK);

  // ── Goods ON the counter, which is what makes it a market ──────────────
  const produce = [PUMPKIN, CARROT_ORANGE, GRASS_BASE, STRAW, BLOOM_ROSE];
  for (let i = 0; i < 9; i += 1) {
    const x = 12 + i * 9;
    const colour = produce[Math.floor(rng() * produce.length)] ?? PUMPKIN;
    blob(canvas, x, 40, 4, 4, colour, 121 + i, 0.18);
    set(canvas, x - 1, 38, LEAF_HIGHLIGHT);
  }
  // A basket at one end and a scale at the other.
  blob(canvas, 80, 40, 6, 4, TIMBER_WARM, 131, 0.15);
  rect(canvas, 76, 36, 86, 37, TIMBER_DARK);

  // ── Crates stacked under the counter ───────────────────────────────────
  for (const [x, y] of [[14, 62], [30, 62], [62, 62]]) {
    rect(canvas, x, y, x + 12, y + 12, TIMBER_WARM);
    rect(canvas, x, y, x + 12, y + 1, BIRCH_PALE);
    rect(canvas, x + 6, y, x + 6, y + 12, TIMBER_DARK);
    rect(canvas, x, y + 6, x + 12, y + 7, TIMBER_DARK);
  }

  // ── A hanging sign, because a stall is somebody's ──────────────────────
  rect(canvas, 36, 4, 60, 16, TIMBER_WARM);
  rect(canvas, 36, 4, 60, 5, BIRCH_PALE);
  rect(canvas, 40, 8, 56, 12, CREAM);
  set(canvas, 44, 10, TIMBER_DARK);
  set(canvas, 48, 10, TIMBER_DARK);
  set(canvas, 52, 10, TIMBER_DARK);

  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 48, groundY, 40, 2.5);
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

/**
 * The mill (`core:mill`) — 3x3 tiles, 96x120 px.
 *
 * PHASE-42 REDREW THIS AT ITS REAL SIZE. It was a 32 px sprite, which is why
 * the brief called the game "a grid with sprites": a working watermill drawn
 * the same size as a flowerpot. The footprint is content (ADR-042 §3); this is
 * the art that fills it.
 *
 * The canvas is TALLER than the footprint — 120 px over 96 — because the roof
 * and the hoist gable overhang the tiles the building stands on. Sprites are
 * bottom-anchored, so the extra height grows up into open sky and blocks
 * nothing (ADR-042 §10: visual footprint is not collision footprint).
 *
 * It is the tallest thing in the game that is not a tree, and the only one with
 * a wheel — the brief §6 asks the mill to communicate grain and mechanical
 * processing, and a waterwheel does that at any size, to anyone.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function mill() {
  const canvas = createCanvas(96, 120);
  const rng = prng(1501);
  const groundY = 119;

  // ── The mill race, first, so the wheel sits in it ────────────────────────
  rect(canvas, 0, 96, 30, groundY, WATER_BASE);
  ditherBand(canvas, 0, 96, 30, 103, WATER_LIGHT, WATER_BASE);
  for (let i = 0; i < 10; i += 1) {
    const x = Math.floor(rng() * 28);
    const y = 100 + Math.floor(rng() * 16);
    rect(canvas, x, y, x + 2, y, WATER_LIGHT);
  }
  // The stone channel edge that carries the water under the wheel.
  material.masonry(canvas, 0, 92, 32, 96, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 21);

  // ── The building: warm stone base, timber upper, slate roof ──────────────
  material.masonry(canvas, 30, 62, 92, 112, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 23);
  material.planks(canvas, 34, 34, 90, 62, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 27);
  // A stone quoin up each corner, which is what makes masonry read as built.
  for (const x of [30, 31, 90, 91]) {
    for (let y = 62; y <= 112; y += 6) rect(canvas, x, y, x, y + 2, STONE_WARM_LIGHT);
  }

  // Main roof, broad and slate, overhanging both walls.
  pitchedRoof(canvas, 6, 36, 62, 34, ROOF_SLATE, ROOF_SLATE_DEEP, ROOF_SLATE_LIGHT);
  rect(canvas, 26, 36, 95, 38, ROOF_SLATE_DEEP);
  rect(canvas, 26, 34, 95, 35, ROOF_SLATE_LIGHT);

  // ── The hoist gable: where sacks go up. A mill's working face ────────────
  polygon(canvas, [[46, 40], [78, 40], [78, 22], [62, 12]], TIMBER_WARM);
  polygon(canvas, [[46, 40], [62, 40], [62, 12]], BIRCH_PALE);
  rect(canvas, 52, 26, 72, 44, TIMBER_DARK);
  rect(canvas, 55, 29, 69, 42, SOIL_DARK);
  // The hoist beam and its rope, sticking out over the yard.
  rect(canvas, 40, 24, 62, 26, TIMBER_DARK);
  rect(canvas, 44, 26, 45, 40, SOIL_DARK);
  rect(canvas, 42, 40, 47, 45, TIMBER_WARM); // the sack on the rope
  rect(canvas, 42, 40, 47, 41, BIRCH_PALE);

  // ── Windows and door ─────────────────────────────────────────────────────
  for (const wx of [40, 76]) {
    rect(canvas, wx, 74, wx + 10, 88, TIMBER_DARK);
    rect(canvas, wx + 2, 76, wx + 8, 86, STRAW);
    rect(canvas, wx + 5, 76, wx + 5, 86, TIMBER_DARK);
    rect(canvas, wx - 1, 88, wx + 11, 89, BIRCH_PALE);
  }
  rect(canvas, 56, 88, 72, 112, TIMBER_DARK);
  material.boards(canvas, 58, 90, 70, 112, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 31);
  set(canvas, 68, 100, GOLD_HIGHLIGHT);
  rect(canvas, 54, 112, 74, 113, STONE_WARM_LIGHT); // the step

  // ── THE WATERWHEEL. The whole silhouette argument ────────────────────────
  const cx = 22;
  const cy = 84;
  blob(canvas, cx, cy, 22, 22, TIMBER_DARK, 41, 0.02);
  blob(canvas, cx, cy, 19, 19, TIMBER_WARM, 43, 0.02);
  blob(canvas, cx, cy, 13, 13, TIMBER_DARK, 45, 0.02);
  blob(canvas, cx, cy, 11, 11, STONE_WARM_DARK, 47, 0.03);
  blob(canvas, cx, cy, 4, 4, TIMBER_DARK, 49, 0.05);
  // Spokes and paddles, eight of each.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    line(canvas, cx, cy, Math.round(cx + dx * 18), Math.round(cy + dy * 18), BIRCH_PALE);
    const px = Math.round(cx + dx * 20);
    const py = Math.round(cy + dy * 20);
    rect(canvas, px - 2, py - 2, px + 2, py + 2, TIMBER_DARK);
  }
  // The axle reaching into the wall.
  rect(canvas, cx, cy - 2, 34, cy + 1, TIMBER_DARK);

  // ── Sacks of grain in the yard: a mill is a place goods pile up ──────────
  blob(canvas, 82, 108, 8, 6, CREAM_SHADE, 51, 0.16);
  blob(canvas, 80, 104, 6, 4, CREAM, 53, 0.2);
  rect(canvas, 79, 100, 83, 102, TIMBER_DARK);

  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 60, groundY, 34, 3);
  return canvas;
}



/**
 * The kitchen (`core:kitchen`) — 3x2 tiles, 96x88 px.
 *
 * Redrawn at footprint scale in phase-42. Its identity is a MASSIVE OVEN STACK
 * on the shaded side: a lopsided silhouette nothing else in the game has, with
 * a lit arched mouth and smoke. The brief §6 asks the kitchen to communicate
 * cooking, warmth and domestic production, and fire is the shortest way to say
 * all three.
 *
 * The canvas is taller than the footprint so the stack and its smoke overhang
 * the tiles the building stands on (ADR-042 §10).
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function kitchen() {
  const canvas = createCanvas(96, 88);
  const rng = prng(1502);
  const groundY = 87;

  // ── The building proper: cream plaster over a timber sill, set RIGHT ─────
  rect(canvas, 34, 40, 92, 84, CREAM);
  rect(canvas, 34, 40, 40, 84, CREAM_SHADE);
  material.planks(canvas, 34, 74, 92, 84, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 81);
  // Half-timbering, so it belongs to the same village as the cottage.
  rect(canvas, 34, 40, 36, 84, TIMBER_DARK);
  rect(canvas, 90, 40, 92, 84, TIMBER_DARK);
  rect(canvas, 34, 58, 92, 60, TIMBER_DARK);

  pitchedRoof(canvas, 12, 42, 64, 34, ROOF_SLATE, ROOF_SLATE_DEEP, ROOF_SLATE_LIGHT);
  rect(canvas, 28, 42, 95, 44, ROOF_SLATE_DEEP);
  rect(canvas, 28, 40, 95, 41, ROOF_SLATE_LIGHT);

  // ── Windows: wide, warm, and one of them a serving hatch ────────────────
  rect(canvas, 62, 62, 84, 74, TIMBER_DARK);
  rect(canvas, 64, 64, 82, 72, STRAW);
  rect(canvas, 72, 64, 73, 72, TIMBER_DARK);
  rect(canvas, 60, 74, 86, 76, BIRCH_PALE); // the sill, wide enough to rest a pie on
  blob(canvas, 68, 72, 4, 2, PUMPKIN, 83, 0.2); // something cooling on it
  blob(canvas, 78, 72, 3, 2, CARROT_ORANGE, 85, 0.2);

  rect(canvas, 42, 62, 56, 84, TIMBER_DARK);
  material.boards(canvas, 44, 64, 54, 84, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 87);
  set(canvas, 53, 74, GOLD_HIGHLIGHT);

  // ── THE OVEN STACK: floor to above the roofline, on the left ─────────────
  material.masonry(canvas, 2, 14, 34, 84, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 89);
  rect(canvas, 0, 10, 36, 14, STONE_WARM_LIGHT); // the crown
  rect(canvas, 0, 10, 36, 11, CREAM_SHADE);
  // Banding, so it reads as courses rather than as a slab.
  for (const y of [26, 44, 62]) rect(canvas, 2, y, 34, y + 1, STONE_WARM_DARK);

  // The oven mouth: arched, deep, and LIT. The one place the game shows fire.
  blob(canvas, 18, 56, 12, 11, SOIL_DARK, 91, 0.04);
  rect(canvas, 7, 56, 29, 80, SOIL_DARK);
  blob(canvas, 18, 66, 9, 7, ROOF_CLAY, 93, 0.12);
  blob(canvas, 18, 70, 7, 5, PUMPKIN, 95, 0.15);
  blob(canvas, 17, 73, 4, 3, REWARD_GOLD, 97, 0.2);
  set(canvas, 17, 74, GOLD_HIGHLIGHT);
  // Embers spilling onto the hearth stone.
  for (let i = 0; i < 6; i += 1) {
    set(canvas, 10 + Math.floor(rng() * 18), 78 + Math.floor(rng() * 3), PUMPKIN);
  }
  rect(canvas, 4, 80, 32, 84, STONE_WARM_DARK);

  // Smoke: three puffs that grow and drift toward the light.
  blob(canvas, 16, 7, 5, 4, STONE_WARM_LIGHT, 99, 0.3);
  blob(canvas, 11, 3, 4, 3, CREAM_SHADE, 101, 0.3);
  blob(canvas, 7, 0, 3, 2, CREAM, 103, 0.3);

  // Firewood stacked against the stack, and a water butt.
  for (let y = 74; y <= 84; y += 3) {
    for (let x = 34; x <= 40; x += 3) {
      blob(canvas, x, y, 2, 1, rng() < 0.5 ? TIMBER_WARM : TIMBER_DARK, 105 + x, 0.2);
    }
  }

  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 48, groundY, 40, 3);
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

/**
 * The cottage (`core:cottage`) — 2x2 tiles, 64x80 px.
 *
 * Redrawn at footprint scale in phase-42. A HOME, and it should be the warmest
 * thing on screen: the only half-timbered building, a steep terracotta gable,
 * a chimney with smoke, lit windows and a window box. Four of these make the
 * town, so this one asset carries most of §18's "somewhere people live".
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function cottage() {
  const canvas = createCanvas(64, 80);
  const groundY = 79;

  // Plaster walls with a timber frame — the cottage's signature.
  rect(canvas, 8, 34, 56, 76, CREAM);
  rect(canvas, 8, 34, 14, 76, CREAM_SHADE);
  material.masonry(canvas, 6, 70, 58, 76, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 161);
  rect(canvas, 8, 34, 11, 72, TIMBER_DARK);
  rect(canvas, 53, 34, 56, 72, TIMBER_DARK);
  rect(canvas, 8, 50, 56, 53, TIMBER_DARK);
  line(canvas, 12, 50, 24, 35, TIMBER_DARK);
  line(canvas, 52, 50, 40, 35, TIMBER_DARK);
  line(canvas, 13, 50, 25, 35, TIMBER_DARK);
  line(canvas, 51, 50, 39, 35, TIMBER_DARK);

  // A STEEP terracotta gable, overhanging both walls.
  pitchedRoof(canvas, 2, 34, 32, 30, ROOF_TERRACOTTA, ROOF_CLAY, ROOF_TERRACOTTA);
  rect(canvas, 1, 34, 62, 36, ROOF_CLAY);
  rect(canvas, 1, 32, 62, 33, ROOF_TERRACOTTA);

  // Chimney on the shaded side, breaking the roof line, with smoke.
  material.masonry(canvas, 42, 4, 52, 26, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 163);
  rect(canvas, 40, 1, 54, 5, STONE_WARM_LIGHT);
  blob(canvas, 44, 0, 4, 2, CREAM_SHADE, 165, 0.3);

  // Door with a step, and a lit window either side.
  rect(canvas, 26, 54, 40, 76, TIMBER_DARK);
  material.boards(canvas, 28, 56, 38, 76, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 167);
  set(canvas, 37, 66, GOLD_HIGHLIGHT);
  rect(canvas, 24, 76, 42, 78, STONE_WARM_LIGHT);
  for (const wx of [14, 44]) {
    rect(canvas, wx, 56, wx + 10, 68, TIMBER_DARK);
    rect(canvas, wx + 2, 58, wx + 8, 66, STRAW);
    rect(canvas, wx + 5, 58, wx + 5, 66, TIMBER_DARK);
    rect(canvas, wx - 1, 68, wx + 11, 70, BIRCH_PALE);
  }
  // A window box under each, because this is where somebody lives.
  /** @type {Array<[number, number[]]>} */
  const boxes = [
    [14, BLOOM_ROSE],
    [44, BLOOM_BLUE],
  ];
  for (const [wx, bloom] of boxes) {
    rect(canvas, wx, 70, wx + 10, 73, TIMBER_WARM);
    set(canvas, wx + 2, 69, bloom);
    set(canvas, wx + 5, 69, GRASS_BASE);
    set(canvas, wx + 8, 69, bloom);
  }

  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 32, groundY, 26, 2.5);
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
    // GRASS AND WILD SHIP VARIANTS. One tile stamped across two thousand
    // squares is most of what made the world look flat, and it is the cheapest
    // thing in this whole pass to fix. `terrain-tiles.ts` picks between them
    // from the tile index, so which variant a square shows is DERIVED and
    // nothing is stored (ADR-009's argument, one layer down).
    //
    // The base tile stays plain and is the common case; `b` is tuftier and `c`
    // carries the blooms. Weighting lives in the renderer, not here.
    [terrainDir, 'grass.png', () => grassTile(1201, { tufts: 6 })],
    [terrainDir, 'grass_b.png', () => grassTile(1211, { tufts: 11 })],
    [terrainDir, 'grass_c.png', () => grassTile(1221, { tufts: 8, blooms: 3 })],
    // Phase-44: two more faces, so a field stops being one square repeated.
    [terrainDir, 'grass_d.png', () => grassTile(1231, { tufts: 5, bare: 1 })],
    // Long grass rather than stones: pebbles at 2 px read as confetti, which is
    // the same failure the wilds' dry tufts had in phase-33.
    [terrainDir, 'grass_e.png', () => grassTile(1241, { tufts: 18 })],
    // Tilled variants dress the FIELD without touching the furrows — see
    // `tilledTile`. Two plain to one dressed, so a field reads as worked
    // ground with things in it rather than as a scatter of debris.
    [terrainDir, 'tilled.png', () => tilledTile(1202, {})],
    [terrainDir, 'tilled_b.png', () => tilledTile(1212, { stones: 2 })],
    [terrainDir, 'tilled_c.png', () => tilledTile(1222, { weeds: 3, stones: 1 })],
    [terrainDir, 'water.png', waterTile],
    [terrainDir, 'stone.png', stoneTile],
    [terrainDir, 'path.png', pathTile],
    [terrainDir, 'wild.png', () => wildTile(1206, { stones: 9 })],
    [terrainDir, 'wild_b.png', () => wildTile(1216, { stones: 16 })],
    [buildingsDir, 'tree.png', tree],
    [buildingsDir, 'rock.png', rock],
    [buildingsDir, 'ore_vein.png', oreVein],
    [buildingsDir, 'bush.png', bush],
    [buildingsDir, 'flower.png', flower],
    // Farm props (phase-37): the set that only ever lands on OWNED land.
    [buildingsDir, 'crate.png', crate],
    [buildingsDir, 'sacks.png', sacks],
    [buildingsDir, 'hay_bale.png', hayBale],
    [buildingsDir, 'farm_tools.png', farmTools],
    // Town props (phase-37): the third region's identity.
    [buildingsDir, 'bench.png', bench],
    [buildingsDir, 'lamp.png', lamp],
    [buildingsDir, 'signpost.png', signpost],
    [buildingsDir, 'cat.png', cat],
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
