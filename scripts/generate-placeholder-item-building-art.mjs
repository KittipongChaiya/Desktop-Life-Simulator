/**
 * Generates PLACEHOLDER item icons and the storage-shed sprite. Phase-05d.
 *
 * Crude by design — they exist only to exercise the rendering and panel paths.
 * Production art replaces the PNGs in `assets/src/ui-world{tps}/` and
 * `assets/src/buildings{tps}/` with no code change: the renderer resolves every
 * sprite through the generated manifest by key (ASSETS.md §5), never a filename.
 *
 * Run once: `node scripts/generate-placeholder-item-building-art.mjs`. The
 * output PNGs are committed as source art; `npm run assets` packs them.
 */

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

// ── Minimal PNG encoder (8-bit RGBA) ─────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** @param {Buffer} buffer @returns {number} */
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {string} type @param {Buffer} data @returns {Buffer} */
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** @param {Uint8Array} px flat RGBA @param {number} size @returns {Buffer} */
function encodePng(px, size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    for (let i = 0; i < size * 4; i += 1) raw[rowStart + 1 + i] = px[y * size * 4 + i] ?? 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {number} size
 * @param {(x: number, y: number) => number[] | null} paint returns RGBA or null for transparent
 * @returns {Uint8Array}
 */
function draw(size, paint) {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const colour = paint(x, y);
      if (colour === null) continue;
      const offset = (y * size + x) * 4;
      px[offset] = colour[0];
      px[offset + 1] = colour[1];
      px[offset + 2] = colour[2];
      px[offset + 3] = colour[3];
    }
  }
  return px;
}

// ── Item icons (16×16): a filled disc in a per-item colour ───────────────────

const OUTLINE = [58, 54, 64, 255];

/** @param {number[]} fill @returns {Uint8Array} */
function itemIcon(fill) {
  const c = 7.5;
  const r = 6;
  return draw(16, (x, y) => {
    const d = Math.hypot(x - c, y - c);
    if (d > r + 0.7) return null;
    if (d > r - 0.6) return OUTLINE;
    return fill;
  });
}

/** @type {[string, number[]][]} */
const ITEMS = [
  ['item_turnip', [214, 196, 224, 255]],
  ['item_wheat', [224, 194, 96, 255]],
  ['item_carrot', [230, 132, 54, 255]],
  ['item_pumpkin', [206, 108, 34, 255]],
];

// ── Storage shed (32×32): a boxy building with a roof ────────────────────────

function storageShed() {
  const wall = [150, 112, 74, 255];
  const roof = [110, 82, 54, 255];
  const door = [82, 58, 40, 255];
  return draw(32, (x, y) => {
    // Roof: a trapezoid across the top third.
    if (y >= 4 && y < 12 && x >= 4 + (11 - y) && x <= 27 - (11 - y)) {
      return y === 4 || x === 4 + (11 - y) || x === 27 - (11 - y) ? OUTLINE : roof;
    }
    // Walls: rows 12-28.
    if (y >= 12 && y <= 28 && x >= 6 && x <= 25) {
      if (x === 6 || x === 25 || y === 28) return OUTLINE;
      // A door in the middle-bottom.
      if (y >= 19 && x >= 13 && x <= 18) return door;
      return wall;
    }
    return null;
  });
}

function main() {
  const uiDir = join(SRC, 'ui-world{tps}');
  const buildingsDir = join(SRC, 'buildings{tps}');
  mkdirSync(uiDir, { recursive: true });
  mkdirSync(buildingsDir, { recursive: true });

  for (const [name, fill] of ITEMS) {
    writeFileSync(join(uiDir, `${name}.png`), encodePng(itemIcon(fill), 16));
  }
  writeFileSync(join(buildingsDir, 'storage_shed.png'), encodePng(storageShed(), 32));

  globalThis.console.log(`generated ${ITEMS.length} item icons + storage_shed`);
}

main();
