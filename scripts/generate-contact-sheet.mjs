/**
 * Composes a contact sheet from source PNGs for the human review gate
 * (phase-05.6 working method): every SCRIPT sub-milestone is judged on a
 * sheet, at gameplay-faithful nearest-neighbour scaling, before it ships.
 *
 * - Terrain tiles are shown tiled 2×2 so seam errors are visible.
 * - Standing art is shown over Grass Base — the backdrop it must separate
 *   from in-game (COLOR_PALETTE §9's ≥3:1 rule).
 * - The sheet itself goes to a temp/output path, never into `assets/src/`.
 *
 * Run: `node scripts/generate-contact-sheet.mjs <out.png> <src.png...>`
 *      (a `tile:` prefix on a source path renders it 2×2 tiled)
 */

import { basename } from 'node:path';

import {
  GRASS_BASE,
  PARCHMENT,
  blitScaled,
  createCanvas,
  decodePng,
  fill,
  writePng,
} from './lib/pixel-art.mjs';

const SCALE = 4;
const PAD = 12;

function main() {
  const [out, ...sources] = globalThis.process.argv.slice(2);
  if (out === undefined || sources.length === 0) {
    globalThis.console.error('usage: generate-contact-sheet.mjs <out.png> <[tile:]src.png...>');
    globalThis.process.exitCode = 1;
    return;
  }

  /**
   * @typedef {object} Cell
   * @property {string} name
   * @property {import('./lib/pixel-art.mjs').Canvas} source
   * @property {boolean} tiled
   */
  /** @type {Cell[]} */
  const cells = sources.map((entry) => {
    const tiled = entry.startsWith('tile:');
    const path = tiled ? entry.slice(5) : entry;
    const source = decodePng(path);
    return { name: basename(path), source, tiled };
  });

  /** @param {Cell} cell @returns {number} */
  const cellWidth = (cell) => (cell.tiled ? cell.source.width * 2 : cell.source.width) * SCALE;
  /** @param {Cell} cell @returns {number} */
  const cellHeight = (cell) => (cell.tiled ? cell.source.height * 2 : cell.source.height) * SCALE;
  const rowHeight = Math.max(...cells.map(cellHeight));
  const sheetWidth = cells.reduce((sum, cell) => sum + cellWidth(cell) + PAD, PAD);
  const sheet = createCanvas(sheetWidth, rowHeight + PAD * 2);
  fill(sheet, () => PARCHMENT);

  let x = PAD;
  for (const cell of cells) {
    const y = PAD + rowHeight - cellHeight(cell); // bottom-align, like the world
    if (cell.tiled) {
      for (let ty = 0; ty < 2; ty += 1) {
        for (let tx = 0; tx < 2; tx += 1) {
          blitScaled(
            sheet,
            cell.source,
            x + tx * cell.source.width * SCALE,
            y + ty * cell.source.height * SCALE,
            SCALE,
          );
        }
      }
    } else {
      // Standing art is judged over the grass it must read against.
      const backdrop = createCanvas(cell.source.width, cell.source.height);
      fill(backdrop, () => GRASS_BASE);
      blitScaled(sheet, backdrop, x, y, SCALE);
      blitScaled(sheet, cell.source, x, y, SCALE);
    }
    x += cellWidth(cell) + PAD;
  }

  writePng(out, sheet);
  globalThis.console.log(`contact sheet: ${out} (${cells.length} assets)`);
}

main();
