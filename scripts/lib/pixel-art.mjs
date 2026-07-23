/**
 * Shared production pixel-art library. Phase-05.6 (vertical slice).
 *
 * The single place the creative canon's hard values enter tooling:
 * every colour is a named export mirroring `docs/assets/COLOR_PALETTE.md`
 * (a colour not in that file does not exist — STYLE_LOCK.md R-08), and the
 * helpers enforce PIXEL_GUIDE.md's structural rules (1 px #3A3640 outline,
 * hard alpha edges, upper-left light via ramp steps, contact shadows).
 *
 * Rectangular canvases (the placeholder encoder was square-only; characters
 * are 32×48 and trees 64×96 — PIXEL_GUIDE.md §2). Painting is deterministic:
 * a seeded PRNG only, so a re-run reproduces byte-identical PNGs and art
 * changes are always intentional diffs (ADR-006 §2's "git is the store").
 */

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

// ── Palette (docs/assets/COLOR_PALETTE.md — hex per table, RGBA here) ────────

/** @param {string} hex `#RRGGBB` @param {number} [alpha] @returns {number[]} */
export function rgba(hex, alpha = 255) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    alpha,
  ];
}

// §2 Structural
export const OUTLINE = rgba('#3A3640');
export const INK_SHADOW = rgba('#2A2733');
export const SOFT_INK = rgba('#4A4557');
// §3.1 Grass & foliage
export const GRASS_SHADOW = rgba('#3E7A3C');
export const GRASS_BASE = rgba('#5AA34E');
export const GRASS_LIGHT = rgba('#7BC062');
export const LEAF_HIGHLIGHT = rgba('#A5D97E');
// §3.2 Soil & wood
export const SOIL_DARK = rgba('#5A3A28');
export const TILLED_SOIL = rgba('#6E5236');
export const WOOD_BASE = rgba('#96704A');
export const WOOD_LIGHT = rgba('#B58A5E');
export const STRAW = rgba('#E0C260');
// §3.3 Water & sky
export const WATER_DEEP = rgba('#2E5A7A');
export const WATER_BASE = rgba('#3E7FA8');
export const WATER_LIGHT = rgba('#6BB0D0');
export const SKY_TINT = rgba('#A9D8E8');
// §3.4 Stone & neutral
export const STONE_DARK = rgba('#5C5A66');
export const STONE_BASE = rgba('#7D7A88');
export const STONE_LIGHT = rgba('#A6A2B0');
export const PARCHMENT = rgba('#E8E0D4');
// §3.5 Skin (base, shadow) — one tone per character, never interpolated
export const SKIN = {
  fair: { base: rgba('#F0D0A8'), shadow: rgba('#D0A778') },
  warm: { base: rgba('#D8A878'), shadow: rgba('#B07E50') },
  tan: { base: rgba('#B07E50'), shadow: rgba('#8A5E38') },
  deep: { base: rgba('#7A5232'), shadow: rgba('#5A3A22') },
};
// §4 Reserved accents — spend deliberately (STYLE_LOCK.md R-09)
export const REWARD_GOLD = rgba('#F2C24C');
export const GOLD_HIGHLIGHT = rgba('#FFE08A');
export const CARROT_ORANGE = rgba('#E68436');
export const PUMPKIN = rgba('#CE6C22');

/** Contact shadow: Ink Shadow at a single flat alpha — one level, hard edge,
 * so the "soft, semi-transparent ellipse" of PIXEL_GUIDE.md §7 never becomes
 * the gradient R-02 forbids. */
export const CONTACT_SHADOW = rgba('#2A2733', 96);

// ── Deterministic PRNG (mulberry32) ──────────────────────────────────────────

/** @param {number} seed @returns {() => number} uniform [0,1) */
export function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Canvas ───────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Canvas
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} px flat RGBA
 */

/** @param {number} width @param {number} height @returns {Canvas} */
export function createCanvas(width, height) {
  return { width, height, px: new Uint8Array(width * height * 4) };
}

/** @param {Canvas} canvas @param {number} x @param {number} y @param {number[]} colour */
export function set(canvas, x, y, colour) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 4;
  canvas.px[offset] = colour[0] ?? 0;
  canvas.px[offset + 1] = colour[1] ?? 0;
  canvas.px[offset + 2] = colour[2] ?? 0;
  canvas.px[offset + 3] = colour[3] ?? 255;
}

/** @param {Canvas} canvas @param {number} x @param {number} y @returns {number} alpha (0 when out of bounds) */
export function alphaAt(canvas, x, y) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return 0;
  return canvas.px[(y * canvas.width + x) * 4 + 3] ?? 0;
}

/**
 * Fills every pixel from a paint callback returning RGBA or null (transparent).
 * @param {Canvas} canvas
 * @param {(x: number, y: number) => number[] | null} paint
 */
export function fill(canvas, paint) {
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const colour = paint(x, y);
      if (colour !== null) set(canvas, x, y, colour);
    }
  }
}

/** Axis-aligned filled rectangle (inclusive coordinates).
 * @param {Canvas} canvas @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {number[]} colour */
export function rect(canvas, x0, y0, x1, y1, colour) {
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) set(canvas, x, y, colour);
}

/** Filled ellipse; `edge` widens the boundary test slightly for rounder small shapes.
 * @param {Canvas} canvas @param {number} cx @param {number} cy @param {number} radiusX @param {number} radiusY @param {number[]} colour @param {number} [edge] */
export function ellipse(canvas, cx, cy, radiusX, radiusY, colour, edge = 0) {
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = (x - cx) / radiusX;
      const dy = (y - cy) / radiusY;
      if (dx * dx + dy * dy <= 1 + edge) set(canvas, x, y, colour);
    }
  }
}

/**
 * The one outline (PIXEL_GUIDE.md §5): every fully-transparent pixel 4-adjacent
 * to an opaque pixel becomes `#3A3640`, giving an exact 1 px silhouette line.
 * Interior lines are the painter's job (Soft Ink, sparingly); this pass only
 * wraps the silhouette so weight can never drift (STYLE_LOCK.md R-04).
 * @param {Canvas} canvas
 */
export function outlineSilhouette(canvas) {
  const before = Uint8Array.from(canvas.px);
  const opaque = (x, y) => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
    return (before[(y * canvas.width + x) * 4 + 3] ?? 0) === 255;
  };
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if ((before[(y * canvas.width + x) * 4 + 3] ?? 0) !== 0) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        set(canvas, x, y, OUTLINE);
      }
    }
  }
}

/** Contact shadow under a standing object (PIXEL_GUIDE.md §7): flat single-alpha
 * ellipse, painted only where the canvas is still transparent so it never
 * darkens the object itself.
 * @param {Canvas} canvas @param {number} cx @param {number} cy @param {number} radiusX @param {number} radiusY */
export function contactShadow(canvas, cx, cy, radiusX, radiusY) {
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = (x - cx) / radiusX;
      const dy = (y - cy) / radiusY;
      if (dx * dx + dy * dy <= 1 && alphaAt(canvas, x, y) === 0) {
        set(canvas, x, y, CONTACT_SHADOW);
      }
    }
  }
}

// ── PNG encoding (8-bit RGBA, rectangular) ───────────────────────────────────

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

/** @param {Canvas} canvas @returns {Buffer} */
export function encodePng(canvas) {
  const { width, height, px } = canvas;
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // filter: none
    for (let i = 0; i < width * 4; i += 1) raw[y * stride + 1 + i] = px[y * width * 4 + i] ?? 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** @param {string} path @param {Canvas} canvas */
export function writePng(path, canvas) {
  writeFileSync(path, encodePng(canvas));
}

/**
 * Decodes an 8-bit RGBA PNG into a Canvas (all five standard row filters).
 * Enough for reviewing tooling output; not a general-purpose PNG reader —
 * palette/greyscale/interlaced files are rejected loudly.
 * @param {string} path @returns {Canvas}
 */
export function decodePng(path) {
  const file = readFileSync(path);
  let offset = 8; // signature
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error(`${path}: only 8-bit RGBA non-interlaced PNGs are supported`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const canvas = createCanvas(width, height);
  const stride = width * 4;
  /** @param {number} a @param {number} b @param {number} c @returns {number} */
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0;
      const left = i >= 4 ? (canvas.px[y * stride + i - 4] ?? 0) : 0;
      const up = y > 0 ? (canvas.px[(y - 1) * stride + i] ?? 0) : 0;
      const upLeft = y > 0 && i >= 4 ? (canvas.px[(y - 1) * stride + i - 4] ?? 0) : 0;
      let value = x;
      if (filter === 1) value = x + left;
      else if (filter === 2) value = x + up;
      else if (filter === 3) value = x + Math.floor((left + up) / 2);
      else if (filter === 4) value = x + paeth(left, up, upLeft);
      canvas.px[y * stride + i] = value & 0xff;
    }
  }
  return canvas;
}

/** Blits `source` onto `target` scaled by an integer factor (nearest-neighbour,
 * the game's own scaling rule — ASSETS.md §8). Skips fully-transparent pixels
 * so the target's backdrop shows through; semi-transparent pixels are composited.
 * @param {Canvas} target @param {Canvas} source @param {number} x0 @param {number} y0 @param {number} scale
 */
export function blitScaled(target, source, x0, y0, scale) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const alpha = source.px[offset + 3] ?? 0;
      if (alpha === 0) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const tx = x0 + x * scale + dx;
          const ty = y0 + y * scale + dy;
          if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
          if (alpha === 255) {
            set(target, tx, ty, [
              source.px[offset] ?? 0,
              source.px[offset + 1] ?? 0,
              source.px[offset + 2] ?? 0,
              255,
            ]);
          } else {
            const t = (ty * target.width + tx) * 4;
            const mix = alpha / 255;
            set(target, tx, ty, [
              Math.round((source.px[offset] ?? 0) * mix + (target.px[t] ?? 0) * (1 - mix)),
              Math.round((source.px[offset + 1] ?? 0) * mix + (target.px[t + 1] ?? 0) * (1 - mix)),
              Math.round((source.px[offset + 2] ?? 0) * mix + (target.px[t + 2] ?? 0) * (1 - mix)),
              255,
            ]);
          }
        }
      }
    }
  }
}
