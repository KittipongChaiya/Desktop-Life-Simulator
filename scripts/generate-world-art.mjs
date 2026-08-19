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
  const { blooms = 0, tufts = 6 } = character;
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
    ellipse(
      canvas,
      cx - 4,
      cy - 5,
      Math.max(2, rx * 0.55),
      Math.max(2, ry * 0.55),
      GRASS_LIGHT,
      0.15,
    );
  }
}

/**
 * A tree (`buildings:tree`, and the timber node's sprite).
 *
 * SHRUNK IN PHASE-37, from 64×96 to 48×72. The reviewed scene showed the
 * problem plainly: a tree stood three times the height of a cottage, so a
 * Tier 3 prop dominated the Tier 2 structure beside it and the village read as
 * a clearing in a forest rather than as a farm with trees on it. Buildings
 * cannot grow — they are anchored to one 32 px tile — so the tree came down.
 *
 * At 72 px it is still comfortably the tallest thing that is not a mill, which
 * is what a tree should be.
 * @returns {import('./lib/pixel-art.mjs').Canvas}
 */
function tree() {
  const canvas = createCanvas(48, 72);
  // Trunk with a root flare; left edge lit, right edge shaded.
  rect(canvas, 21, 39, 27, 68, WOOD_BASE);
  rect(canvas, 19, 66, 29, 70, WOOD_BASE);
  rect(canvas, 21, 39, 22, 68, WOOD_LIGHT);
  rect(canvas, 26, 39, 27, 68, SOIL_DARK);
  rect(canvas, 19, 66, 20, 70, WOOD_LIGHT);
  rect(canvas, 28, 66, 29, 70, SOIL_DARK);
  // A rounded three-lobe canopy — the safe, present silhouette (VISUAL_REFERENCE §4).
  foliage(canvas, [
    [24, 23, 17, 14],
    [13, 30, 9, 8],
    [35, 29, 9, 8],
  ]);
  // Sparse leaf texture; rim highlights only in the lit upper-left quadrant.
  const rng = prng(1301);
  for (let i = 0; i < 22; i += 1) {
    const x = 7 + Math.floor(rng() * 34);
    const y = 10 + Math.floor(rng() * 28);
    const dx = (x - 24) / 17;
    const dy = (y - 23) / 14;
    if (dx * dx + dy * dy > 1) continue;
    if (x < 24 && y < 24 && rng() < 0.45) set(canvas, x, y, LEAF_HIGHLIGHT);
    else set(canvas, x, y, rng() < 0.5 ? GRASS_SHADOW : GRASS_LIGHT);
  }
  outlineSilhouette(canvas);
  contactShadow(canvas, 24, 69, 11, 2);
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

/** Storage shed (`core:storage_shed`): LOW AND WIDE, and the only building
 * with no windows at all. It is a place things go, not a place anyone is —
 * so it gets barn doors, board walls and a shallow slate roof, and its
 * silhouette is the flattest in the set. */
function storageShed() {
  const canvas = createCanvas(TILE, TILE);
  // Walls: vertical boarding, wall to wall. Wider than anything else here.
  material.boards(canvas, 2, 14, 29, 28, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 21);
  // A SHALLOW roof — pitch is the silhouette's whole argument against the
  // cottage's steep gable.
  pitchedRoof(canvas, 8, 15, 16, 15, ROOF_SLATE, ROOF_SLATE_DEEP, ROOF_SLATE_LIGHT);
  rect(canvas, 1, 15, 30, 15, TIMBER_DARK); // deep eave, wall to wall
  // Double barn doors with the X-brace that says "storage" at any size.
  rect(canvas, 10, 18, 21, 28, TIMBER_DARK);
  rect(canvas, 11, 19, 15, 28, TIMBER_WARM);
  rect(canvas, 17, 19, 21, 28, TIMBER_WARM);
  line(canvas, 11, 19, 15, 27, BIRCH_PALE);
  line(canvas, 15, 19, 11, 27, BIRCH_PALE);
  line(canvas, 17, 19, 21, 27, BIRCH_PALE);
  line(canvas, 21, 19, 17, 27, BIRCH_PALE);
  rect(canvas, 16, 18, 16, 28, TIMBER_DARK); // the meeting line
  // A crate left outside, because a store is a place with too much in it.
  rect(canvas, 24, 24, 28, 28, TIMBER_WARM);
  rect(canvas, 24, 24, 28, 24, BIRCH_PALE);
  rect(canvas, 26, 24, 26, 28, TIMBER_DARK);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 16, 29, 14, 2);
  return canvas;
}


/** Rest hut (`core:rest_hut`): the SMALLEST and the roundest. Where a worker
 * goes to stop, so it is soft everywhere the shed is square — a mossy dome, a
 * round door, and a bench outside. */
function restHut() {
  const canvas = createCanvas(TILE, TILE);
  // Cream walls, small and low.
  rect(canvas, 8, 17, 23, 28, CREAM);
  rect(canvas, 8, 17, 10, 28, CREAM_SHADE);
  rect(canvas, 21, 17, 23, 28, CREAM_SHADE);
  // A DOMED roof of old moss — the only curved roof in the set.
  blob(canvas, 16, 15, 11, 7, ROOF_MOSS, 41, 0.12);
  blob(canvas, 13, 12, 7, 4, GRASS_LIGHT, 43, 0.2);
  for (let x = 5; x <= 27; x += 4) set(canvas, x, 16, TIMBER_DARK);
  rect(canvas, 5, 17, 26, 17, TIMBER_DARK); // eave
  // Round-topped door, and a step.
  blob(canvas, 16, 22, 4, 4, TIMBER_DARK, 47, 0.05);
  rect(canvas, 12, 22, 19, 28, TIMBER_DARK);
  rect(canvas, 13, 23, 18, 28, TIMBER_WARM);
  line(canvas, 16, 23, 16, 27, TIMBER_DARK);
  rect(canvas, 12, 28, 19, 28, STONE_WARM_LIGHT);
  // A bench, which is the whole point of the building. Two rows and real
  // legs — at one row it was a stray stick beside the door.
  rect(canvas, 23, 24, 30, 24, TIMBER_DARK);
  rect(canvas, 23, 25, 30, 26, TIMBER_WARM);
  rect(canvas, 23, 27, 24, 28, TIMBER_DARK);
  rect(canvas, 29, 27, 30, 28, TIMBER_DARK);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 16, 29, 12, 1.8);
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

/** The mill (`core:mill`): the TALLEST silhouette in the game, and the only
 * one with a wheel. The brief names the mill and the kitchen specifically, and
 * the old one was a grey tower whose entire mill-ness was a 5 px gear. A
 * waterwheel reads as a mill at any size, from any angle, to anyone. */
function mill() {
  const canvas = createCanvas(TILE, TILE);
  // Warm stone base, timber upper — a tall, narrow body set to the right so
  // the wheel has room.
  material.masonry(canvas, 11, 18, 26, 28, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 51);
  material.planks(canvas, 11, 11, 26, 17, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 53);
  // A steep slate cap, high enough to be the tallest thing standing.
  pitchedRoof(canvas, 2, 11, 18, 10, ROOF_SLATE, ROOF_SLATE_DEEP, ROOF_SLATE_LIGHT);
  rect(canvas, 8, 11, 28, 11, TIMBER_DARK);
  // A hoist door under the ridge, where sacks go up.
  rect(canvas, 16, 13, 20, 16, TIMBER_DARK);
  rect(canvas, 17, 14, 19, 16, SOIL_DARK);
  // Window on the stone.
  rect(canvas, 20, 21, 23, 24, TIMBER_DARK);
  rect(canvas, 21, 22, 22, 23, STRAW);
  // THE WATERWHEEL. Rim, hub, spokes, paddles.
  blob(canvas, 7, 21, 7, 7, TIMBER_DARK, 57, 0.04);
  blob(canvas, 7, 21, 5, 5, TIMBER_WARM, 59, 0.04);
  blob(canvas, 7, 21, 2, 2, TIMBER_DARK, 61, 0.05);
  for (const [dx, dy] of [[0, -6], [0, 6], [-6, 0], [6, 0], [-4, -4], [4, 4], [-4, 4], [4, -4]]) {
    line(canvas, 7, 21, 7 + dx, 21 + dy, BIRCH_PALE);
  }
  for (const [px, py] of [[7, 14], [7, 28], [0, 21], [14, 21]]) {
    set(canvas, px, py, TIMBER_DARK);
  }
  // The millrace it turns in.
  rect(canvas, 1, 26, 13, 28, WATER_BASE);
  rect(canvas, 1, 26, 13, 26, WATER_LIGHT);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 18, 29, 11, 1.8);
  return canvas;
}


/** The kitchen (`core:kitchen`): the other building the brief names. Its
 * identity is a MASSIVE OVEN STACK on the shaded side — a lopsided silhouette
 * nothing else in the set has — with a lit oven mouth and smoke. The old one
 * was the same box as the cottage with an orange circle on it. */
function kitchen() {
  const canvas = createCanvas(TILE, TILE);
  const rng = prng(1406);
  // The building proper: low, wide, cream, set to the RIGHT.
  rect(canvas, 12, 16, 29, 28, CREAM);
  rect(canvas, 12, 16, 14, 28, CREAM_SHADE);
  material.planks(canvas, 12, 25, 29, 28, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 67);
  pitchedRoof(canvas, 9, 16, 21, 11, ROOF_SLATE, ROOF_SLATE_DEEP, ROOF_SLATE_LIGHT);
  rect(canvas, 10, 16, 31, 16, TIMBER_DARK);
  // Window with a sill, warm from inside.
  rect(canvas, 23, 19, 27, 23, TIMBER_DARK);
  rect(canvas, 24, 20, 26, 22, STRAW);
  line(canvas, 25, 20, 25, 22, TIMBER_DARK);
  rect(canvas, 22, 23, 28, 23, BIRCH_PALE);
  // THE OVEN STACK: masonry, floor to above the roofline, on the left.
  material.masonry(canvas, 2, 9, 12, 28, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 71);
  rect(canvas, 1, 8, 13, 9, STONE_WARM_LIGHT); // the crown
  // The oven mouth, arched and LIT — the one place the game shows fire.
  blob(canvas, 7, 22, 4, 4, SOIL_DARK, 73, 0.05);
  rect(canvas, 3, 22, 11, 27, SOIL_DARK);
  blob(canvas, 7, 24, 3, 2, PUMPKIN, 77, 0.15);
  set(canvas, 7, 24, GOLD_HIGHLIGHT);
  set(canvas, 6, 25, REWARD_GOLD);
  // Smoke: three PUFFS that grow and drift, not a one-pixel line. The first
  // attempt drew a diagonal stroke and it read as an aerial.
  blob(canvas, 6, 6, 2, 2, STONE_WARM_LIGHT, 79, 0.3);
  blob(canvas, 4, 3, 2, 1, CREAM_SHADE, 81, 0.3);
  blob(canvas, 3, 1, 1, 1, CREAM, 85, 0.3);
  // Firewood stacked against the stack.
  for (let y = 26; y <= 28; y += 1) {
    for (let x = 1; x <= 2; x += 1) set(canvas, x, y, rng() < 0.5 ? TIMBER_WARM : TIMBER_DARK);
  }
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 16, 29, 15, 2);
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

/** The cottage (`core:cottage`): a HOME, and it should be the warmest thing on
 * screen. Terracotta over cream plaster with a timber frame — the only
 * half-timbered building — a steep gable, and a chimney with smoke. */
function cottage() {
  const canvas = createCanvas(TILE, TILE);
  // Plaster walls with a timber frame. The frame is the cottage's signature.
  rect(canvas, 6, 15, 25, 28, CREAM);
  rect(canvas, 6, 15, 8, 28, CREAM_SHADE);
  rect(canvas, 6, 15, 6, 28, TIMBER_DARK);
  rect(canvas, 25, 15, 25, 28, TIMBER_DARK);
  rect(canvas, 6, 21, 25, 21, TIMBER_DARK);
  line(canvas, 7, 21, 12, 15, TIMBER_DARK);
  line(canvas, 24, 21, 19, 15, TIMBER_DARK);
  // A STEEP terracotta gable — the tallest pitch of any home-sized building.
  pitchedRoof(canvas, 2, 15, 16, 13, ROOF_TERRACOTTA, ROOF_CLAY, ROOF_TERRACOTTA);
  rect(canvas, 3, 15, 29, 15, ROOF_CLAY); // eave, overhanging both walls
  // Chimney on the shaded side, breaking the roof line, with smoke.
  material.masonry(canvas, 20, 3, 23, 12, STONE_WARM, STONE_WARM_DARK, STONE_WARM_LIGHT, 83);
  rect(canvas, 19, 2, 24, 3, STONE_WARM_LIGHT);
  for (let i = 0; i < 5; i += 1) set(canvas, 21 - Math.floor(i / 2), 1 - i, CREAM);
  // Door with a step, and a lit window either side.
  rect(canvas, 13, 22, 18, 28, TIMBER_DARK);
  material.boards(canvas, 14, 23, 17, 28, TIMBER_WARM, TIMBER_DARK, BIRCH_PALE, 89);
  set(canvas, 17, 25, GOLD_HIGHLIGHT); // the handle
  rect(canvas, 12, 28, 19, 28, STONE_WARM_LIGHT);
  for (const wx of [8, 20]) {
    rect(canvas, wx, 23, wx + 3, 26, TIMBER_DARK);
    rect(canvas, wx + 1, 24, wx + 2, 25, STRAW);
    line(canvas, wx + 1, 24, wx + 2, 24, TIMBER_DARK);
    rect(canvas, wx - 1, 26, wx + 4, 26, BIRCH_PALE); // sill
  }
  // A window box, because this is where somebody lives.
  set(canvas, 9, 27, BLOOM_ROSE);
  set(canvas, 10, 27, GRASS_BASE);
  set(canvas, 21, 27, BLOOM_BLUE);
  set(canvas, 22, 27, GRASS_BASE);
  outlineSelective(canvas, { bottom: false });
  contactShadow(canvas, 16, 29, 13, 1.8);
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
