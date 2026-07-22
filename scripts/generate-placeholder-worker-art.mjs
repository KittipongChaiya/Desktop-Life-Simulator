/**
 * Generates PLACEHOLDER worker sprites. Phase-04c.
 *
 * These 16x16 frames exist only to exercise the asset pipeline and rendering
 * end to end — they are deliberately crude. Production art replaces the PNG
 * files in `assets/src/entities{tps}/` with no code change: the renderer reads
 * frames and timing from `worker.anim.json` (ASSETS.md §7), never from
 * hardcoded coordinates.
 *
 * Run once with `node scripts/generate-placeholder-worker-art.mjs`; the output
 * PNGs and `worker.anim.json` are committed as source art. `npm run assets`
 * packs whatever PNGs are present, so swapping in real art needs no rerun.
 *
 * Emits, per direction n/s/e/w: one idle frame and four walk frames, plus the
 * `worker.anim.json` sidecar.
 */

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZE = 16;
const OUT_DIR = join(import.meta.dirname, '..', 'assets', 'src', 'entities{tps}');

// A neutral palette — nothing evocative, so production art is unconstrained.
const OUTLINE = [58, 54, 64, 255];
const BODY = [150, 146, 158, 255];
const FACE = [92, 88, 104, 255];

/**
 * Writes one RGBA pixel into a flat 16x16 buffer.
 * @param {Uint8Array} px
 * @param {number} x
 * @param {number} y
 * @param {number[]} colour
 */
function set(px, x, y, colour) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const offset = (y * SIZE + x) * 4;
  px[offset] = colour[0];
  px[offset + 1] = colour[1];
  px[offset + 2] = colour[2];
  px[offset + 3] = colour[3];
}

/**
 * Draws one worker frame into a flat RGBA buffer (transparent by default).
 * @param {'n'|'s'|'e'|'w'} dir
 * @param {number} footPhase -1 left lifted, +1 right lifted, 0 stance
 * @returns {Uint8Array}
 */
function drawWorker(dir, footPhase) {
  const px = new Uint8Array(SIZE * SIZE * 4);

  // Head (rows 2-6) and body (rows 7-12): a simple capsule centred on x.
  for (let y = 2; y <= 12; y += 1) {
    const half = y <= 6 ? 2 : 3; // head narrower than body
    for (let x = 8 - half; x <= 7 + half; x += 1) set(px, x, y, BODY);
    set(px, 8 - half - 1, y, OUTLINE);
    set(px, 7 + half + 1, y, OUTLINE);
  }
  for (let x = 6; x <= 9; x += 1) {
    set(px, x, 1, OUTLINE);
    set(px, x, 13, OUTLINE);
  }

  // Feet at row 13-14; the lifted foot rises a pixel to read as a stride.
  set(px, 6, 14 + (footPhase === -1 ? -1 : 0), OUTLINE);
  set(px, 9, 14 + (footPhase === 1 ? -1 : 0), OUTLINE);

  // Facing marker: eyes on the front-facing side. North (back) shows none.
  if (dir === 's' || dir === 'w') set(px, 6, 4, FACE);
  if (dir === 's' || dir === 'e') set(px, 9, 4, FACE);

  return px;
}

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

/**
 * @param {Buffer} buffer
 * @returns {number}
 */
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * @param {Uint8Array} px flat RGBA, SIZE*SIZE*4
 * @returns {Buffer}
 */
function encodePng(px) {
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * (1 + SIZE * 4);
    raw[rowStart] = 0; // filter: none
    for (let i = 0; i < SIZE * 4; i += 1) raw[rowStart + 1 + i] = px[y * SIZE * 4 + i] ?? 0;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
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

// ── Emit ─────────────────────────────────────────────────────────────────────

const DIRECTIONS = ['n', 's', 'e', 'w'];
const WALK_FRAMES = [0, -1, 0, 1]; // stance, left, stance, right

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  /** @type {Record<string, { frames: string[], frameTicks: number, loop: boolean }>} */
  const anim = {};

  for (const dir of DIRECTIONS) {
    const idleName = `worker_idle_${dir}`;
    writeFileSync(join(OUT_DIR, `${idleName}.png`), encodePng(drawWorker(dir, 0)));
    anim[`idle_${dir}`] = { frames: [idleName], frameTicks: 0, loop: false };

    /** @type {string[]} */
    const walkFrames = [];
    WALK_FRAMES.forEach((phase, index) => {
      const name = `worker_walk_${dir}_${index}`;
      writeFileSync(join(OUT_DIR, `${name}.png`), encodePng(drawWorker(dir, phase)));
      walkFrames.push(name);
    });
    // 4 ticks/frame = 5 fps at 20 Hz — a legible placeholder gait (ASSETS.md §7).
    anim[`walk_${dir}`] = { frames: walkFrames, frameTicks: 4, loop: true };
  }

  writeFileSync(join(OUT_DIR, 'worker.anim.json'), `${JSON.stringify(anim, null, 2)}\n`);
  globalThis.console.log(`generated ${DIRECTIONS.length * 5} placeholder frames + worker.anim.json`);
}

main();
