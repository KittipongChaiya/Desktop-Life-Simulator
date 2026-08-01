/**
 * Generates the numeric glyph set — the floating-number font. Phase-07.7c.
 *
 * WHY A FONT AND NOT `Text`. Pixi rasterises a texture per distinct string, so
 * "+12" and "+13" would be two GPU allocations, on the most frequent effect in
 * the game. ADR-017 §4 forbids allocating per frame; a fixed set of twelve
 * glyph textures, composed into pooled per-digit sprites, allocates nothing
 * after startup and matches the pixel canon besides.
 *
 * Canon: ICON_GUIDE.md — silhouette-first, full 1 px #3A3640 outline, hard
 * alpha. A 5×7 core inside a 7×9 canvas, plus one pixel of margin for the
 * outline.
 *
 * A 3×5 core was tried first and rejected on sight: with a full outline the
 * border is as thick as the strokes, so `+` and `×` collapsed into blobs and
 * the digits read only barely. The outline is canon, so the core grew instead
 * — a number the player cannot read is not feedback.
 *
 * Painted in Parchment and TINTED at draw time — coins gold, items pale — so
 * the kind of a number costs no extra texture (COLOR_PALETTE.md §6; Reward
 * Gold stays reserved for currency, STYLE_LOCK.md R-09).
 *
 * Deterministic; re-runs are byte-identical.
 * Run: `node scripts/generate-glyph-art.mjs`, then `npm run assets`.
 */

import { join } from 'node:path';

import { PARCHMENT, createCanvas, outlineSilhouette, set, writePng } from './lib/pixel-art.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */

/**
 * The 5×7 core of every glyph, row-major, `#` for ink.
 *
 * Hand-set rather than derived: at this size a scaled font is mush, and each
 * of these was checked against its nearest neighbour — 6 against 8, 3 against
 * 9, 1 against 7 — rather than against an ideal letterform.
 */
const GLYPHS = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['#####', '....#', '...#.', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  // The sign every number is prefixed with. A `×` for item counts was drawn
  // and cut: at this size its diagonals sit one pixel apart, so the outline
  // closes the gaps and it reads as a solid block. Nothing needs it — items
  // and coins both read as `+n` — and a speculative glyph is not worth an
  // illegible one.
  plus: ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
};

/**
 * Paints one glyph into its own 7×9 canvas.
 * @param {string[]} rows
 * @returns {Canvas}
 */
function glyph(rows) {
  const canvas = createCanvas(7, 9);
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y] ?? '';
    for (let x = 0; x < row.length; x += 1) {
      // Offset by one so the outline has a pixel to occupy on every side.
      if (row[x] === '#') set(canvas, x + 1, y + 1, PARCHMENT);
    }
  }
  outlineSilhouette(canvas);
  return canvas;
}

function main() {
  const uiDir = join(SRC, 'ui-world{tps}');

  let count = 0;
  for (const [name, rows] of Object.entries(GLYPHS)) {
    writePng(join(uiDir, `glyph_${name}.png`), glyph(rows));
    count += 1;
  }

  globalThis.console.log(`generated ${String(count)} numeric glyphs`);
}

main();
