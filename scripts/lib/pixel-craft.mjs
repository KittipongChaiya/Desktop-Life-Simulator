/**
 * The cozy-pass drawing vocabulary. Phase-32 — ADR-041 §3.
 *
 * ADR-041's finding, and the reason this file exists: `pixel-art.mjs` offered
 * `rect`, `ellipse` and `outlineSilhouette`, so every asset in the game was a
 * box or a blob wearing a uniform keyline. Five buildings shared one
 * silhouette; a tree could only ever be a symmetrical green mass; "texture"
 * could only be uncorrelated single pixels. **The vocabulary was the ceiling.**
 *
 * This is the vocabulary. It sits beside `pixel-art.mjs` rather than inside it
 * because that file is already 370 lines and `CODE_STYLE.md` wants focused
 * modules — and because the split is real: that file is the CANVAS (buffers,
 * pixels, PNG encoding), this one is the BRUSH.
 *
 * ## Everything here is R-02 safe
 *
 * `STYLE_LOCK.md` R-02 forbids anti-aliasing, soft alpha, gradients and blur.
 * Nothing below interpolates a colour: a dither is stepped named entries, a
 * ramp picks between three palette colours, and a pattern is pixel placement.
 * Every output pixel is one of the caller's palette arguments, unchanged.
 *
 * ## And everything here is deterministic
 *
 * ADR-006 §2 makes the script the asset's editable source and its git history
 * the asset's version, which only works if a re-run is byte-identical. Where a
 * shape needs irregularity it takes a SEED and draws from `prng`, never from
 * `Math.random`.
 */

import { OUTLINE, prng, rect, set } from './pixel-art.mjs';

/**
 * A 4×4 ordered (Bayer) threshold matrix, normalised to 0–1.
 *
 * Ordered rather than random because a dither is a TEXTURE, and random dither
 * at 32 px reads as dirt rather than as material. The Bayer pattern also tiles
 * seamlessly, which terrain depends on: a matrix that restarted at the tile
 * edge would put a visible grid over the whole world.
 */
/** @typedef {import('./pixel-art.mjs').Canvas} Canvas */

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16));

/**
 * Whether this pixel is "on" at the given density.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} density 0–1
 * @returns {boolean}
 */
export function dithered(x, y, density) {
  const row = BAYER_4[((y % 4) + 4) % 4];
  const threshold = row === undefined ? 0.5 : (row[((x % 4) + 4) % 4] ?? 0.5);
  return density > threshold;
}

/**
 * Fills a region with `colour` at a dithered density.
 *
 * The R-02-safe way to place a value between two others, and the way texture is
 * built without resorting to noise.
 *
 * @param {Canvas} canvas
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number[]} colour
 * @param {number} density 0–1; 1 is a solid fill
 * @returns {void}
 */
export function ditherRect(canvas, x0, y0, x1, y1, colour, density) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (dithered(x, y, density)) set(canvas, x, y, colour);
    }
  }
}

/**
 * A vertical dithered transition from `from` at the top to `to` at the bottom.
 *
 * The workhorse for ground tiles and large faces: solid at both ends, stepped
 * between, which reads as a soft falloff while remaining two indexed colours.
 *
 * @param {Canvas} canvas
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number[]} from
 * @param {number[]} to
 * @returns {void}
 */
export function ditherBand(canvas, x0, y0, x1, y1, from, to) {
  const span = Math.max(1, y1 - y0);
  for (let y = y0; y <= y1; y += 1) {
    const t = (y - y0) / span;
    for (let x = x0; x <= x1; x += 1) {
      set(canvas, x, y, dithered(x, y, t) ? to : from);
    }
  }
}

/**
 * An organic blob: an ellipse whose radius wobbles with angle.
 *
 * The direct answer to ADR-041's *"the tree is a symmetrical green blob"* —
 * foliage, boulders and bushes are lumpy, and `ellipse` cannot be. Eight radius
 * offsets are drawn from a seeded generator and interpolated around the circle,
 * so the edge stays continuous rather than faceted and the same call always
 * draws the same shape.
 *
 * @param {Canvas} canvas
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {number[]} colour
 * @param {number} seed
 * @param {number} wobble 0–1; how far the edge deviates from the ellipse
 * @returns {void}
 */
export function blob(canvas, cx, cy, rx, ry, colour, seed = 1, wobble = 0.22) {
  const rng = prng(seed);
  const offsets = Array.from({ length: 8 }, () => 1 + (rng() * 2 - 1) * wobble);

  for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y += 1) {
    for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const slot = ((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8;
      const a = offsets[Math.floor(slot) % 8] ?? 1;
      const b = offsets[(Math.floor(slot) + 1) % 8] ?? 1;
      const scale = a + (b - a) * (slot - Math.floor(slot));
      if ((dx / (rx * scale)) ** 2 + (dy / (ry * scale)) ** 2 <= 1) {
        set(canvas, x, y, colour);
      }
    }
  }
}

/**
 * A filled polygon — the angular shape language `ellipse` cannot make.
 *
 * Gables, awnings, signs, fence rails, tool heads. Scanline fill sampling at
 * the pixel centre, so edges land on whole pixels and stay crisp under
 * nearest-neighbour scaling.
 *
 * @param {Canvas} canvas
 * @param {Array<[number, number]>} points
 * @param {number[]} colour
 * @returns {void}
 */
export function polygon(canvas, points, colour) {
  if (points.length < 3) return;
  const ys = points.map((point) => point[1]);
  const top = Math.floor(Math.min(...ys));
  const bottom = Math.ceil(Math.max(...ys));

  for (let y = top; y <= bottom; y += 1) {
    const sampleY = y + 0.5;
    /** @type {number[]} */
    const crossings = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a === undefined || b === undefined) continue;
      if (a[1] === b[1]) continue;
      if (sampleY < Math.min(a[1], b[1]) || sampleY >= Math.max(a[1], b[1])) continue;
      crossings.push(a[0] + ((sampleY - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    crossings.sort((p, q) => p - q);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.round(crossings[i] ?? 0);
      const to = Math.round(crossings[i + 1] ?? 0) - 1;
      for (let x = from; x <= to; x += 1) set(canvas, x, y, colour);
    }
  }
}

/**
 * A 1 px line, Bresenham. Rails, stems, ropes, furrow edges.
 *
 * @param {Canvas} canvas
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number[]} colour
 * @returns {void}
 */
export function line(canvas, x0, y0, x1, y1, colour) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const targetX = Math.round(x1);
  const targetY = Math.round(y1);
  const dx = Math.abs(targetX - x);
  const dy = -Math.abs(targetY - y);
  const stepX = x < targetX ? 1 : -1;
  const stepY = y < targetY ? 1 : -1;
  let error = dx + dy;

  // Bounded rather than `while (true)`: a malformed call must not hang the
  // asset build, and no sprite in this project is 4,096 px along a diagonal.
  for (let guard = 0; guard < 4096; guard += 1) {
    set(canvas, x, y, colour);
    if (x === targetX && y === targetY) return;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}

/**
 * The signature every material pattern shares. Declared once because five
 * near-identical `@param` blocks is the kind of comment that rots.
 *
 * @callback MaterialPattern
 * @param {Canvas} canvas
 * @param {number} x0 left edge, inclusive
 * @param {number} y0 top edge, inclusive
 * @param {number} x1 right edge, inclusive
 * @param {number} y1 bottom edge, inclusive
 * @param {number[]} base the surface's mid tone
 * @param {number[]} dark the ramp step below it — joints, gaps, grain
 * @param {number[]} light the ramp step above it — catching the light
 * @param {number} [seed] fixes the irregularity; the same seed draws the same wall
 * @returns {void}
 */

/**
 * Material patterns — what makes a wall read as PLANKS rather than as a
 * rectangle of brown, which is most of what "handcrafted" means at 32 px.
 *
 * Each lays a repeating structure with deterministic irregularity, so a surface
 * has grain without having noise. Every one takes its ramp from the caller, so
 * the same pattern serves a barn wall and a crate.
 */
/** @type {Record<'planks'|'boards'|'shingles'|'thatch'|'masonry', MaterialPattern>} */
export const material = {
  /**
   * Horizontal planking with staggered end-joints.
   */
  planks(canvas, x0, y0, x1, y1, base, dark, light, seed = 3) {
    const rng = prng(seed);
    rect(canvas, x0, y0, x1, y1, base);
    for (let y = y0; y <= y1; y += 1) {
      if ((y - y0) % 4 === 3) {
        for (let x = x0; x <= x1; x += 1) set(canvas, x, y, dark);
      } else if ((y - y0) % 4 === 0 && y > y0) {
        for (let x = x0; x <= x1; x += 1) if (rng() < 0.5) set(canvas, x, y, light);
      }
    }
    // Staggered end-joints, so the wall does not read as one long board.
    for (let y = y0; y <= y1; y += 4) {
      const x = x0 + 1 + Math.floor(rng() * Math.max(1, x1 - x0 - 2));
      for (let d = 0; d < 3 && y + d <= y1; d += 1) set(canvas, x, y + d, dark);
    }
  },

  /**
   * Vertical boarding — barn walls, fences, doors.
   */
  boards(canvas, x0, y0, x1, y1, base, dark, light, seed = 5) {
    const rng = prng(seed);
    rect(canvas, x0, y0, x1, y1, base);
    for (let x = x0; x <= x1; x += 1) {
      if ((x - x0) % 3 === 2) {
        for (let y = y0; y <= y1; y += 1) set(canvas, x, y, dark);
      } else if ((x - x0) % 3 === 0 && rng() < 0.45) {
        for (let y = y0; y <= y1; y += 1) if (rng() < 0.7) set(canvas, x, y, light);
      }
    }
  },

  /**
   * Overlapping roof shingles.
   */
  shingles(canvas, x0, y0, x1, y1, base, dark, light) {
    rect(canvas, x0, y0, x1, y1, base);
    for (let y = y0; y <= y1; y += 1) {
      const course = Math.floor((y - y0) / 3);
      if ((y - y0) % 3 === 0) {
        for (let x = x0; x <= x1; x += 1) set(canvas, x, y, light);
      }
      if ((y - y0) % 3 === 2) {
        for (let x = x0; x <= x1; x += 1) set(canvas, x, y, dark);
        // Vertical nicks, offset per course, so the courses read as tiles.
        for (let x = x0 + (course % 2) * 2; x <= x1; x += 4) set(canvas, x, y - 1, dark);
      }
    }
  },

  /**
   * Thatch — soft, layered, no straight seams.
   */
  thatch(canvas, x0, y0, x1, y1, base, dark, light, seed = 7) {
    const rng = prng(seed);
    rect(canvas, x0, y0, x1, y1, base);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const roll = rng();
        if (roll < 0.18) set(canvas, x, y, dark);
        else if (roll < 0.34) set(canvas, x, y, light);
      }
      if ((y - y0) % 5 === 4) {
        for (let x = x0; x <= x1; x += 1) if (rng() < 0.7) set(canvas, x, y, dark);
      }
    }
  },

  /**
   * Irregular stone courses — walls, wells, paths.
   */
  masonry(canvas, x0, y0, x1, y1, base, dark, light, seed = 11) {
    const rng = prng(seed);
    rect(canvas, x0, y0, x1, y1, base);
    for (let y = y0; y <= y1; y += 3) {
      for (let x = x0; x <= x1; x += 1) set(canvas, x, y, dark);
      let x = x0 + Math.floor(rng() * 4);
      while (x <= x1) {
        for (let d = 1; d < 3 && y + d <= y1; d += 1) set(canvas, x, y + d, dark);
        set(canvas, x + 1, y + 1, light);
        x += 3 + Math.floor(rng() * 4);
      }
    }
  },
};

/**
 * Outlines the silhouette, but only on the sides the caller asks for.
 *
 * ADR-041 §1's amended R-04, as a function. `outlineSilhouette` traces the
 * whole alpha edge, which is what makes a scene read as **stickers laid on a
 * background**; this lets a building omit its bottom keyline so it sits ON the
 * ground, and lets a canopy omit the edge where it meets its own trunk.
 *
 * The 1 px width is unchanged and not negotiable — R-04's surviving half.
 *
 * @param {Canvas} canvas
 * @param {{ colour?: number[], top?: boolean, bottom?: boolean, sides?: boolean }} options
 * @returns {void}
 */
export function outlineSelective(canvas, options = {}) {
  const { colour = OUTLINE, top = true, bottom = true, sides = true } = options;
  const { width, height, px } = canvas;
  // Snapshot first: outlining reads the ORIGINAL silhouette, or the outline
  // grows into itself and thickens past 1 px.
  const original = new Uint8Array(px);
  const solidAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return (original[(y * width + x) * 4 + 3] ?? 0) > 0;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (solidAt(x, y)) continue;
      const isTopEdge = solidAt(x, y + 1);
      const isBottomEdge = solidAt(x, y - 1);
      const isSideEdge = solidAt(x - 1, y) || solidAt(x + 1, y);
      if ((top && isTopEdge) || (bottom && isBottomEdge) || (sides && isSideEdge)) {
        set(canvas, x, y, colour);
      }
    }
  }
}

/**
 * A stepped, hue-shifted shading ramp across a face.
 *
 * Real light is not "the same colour, darker": shadow drifts cool and light
 * drifts warm. Doing that with three named palette entries is what separates
 * modelled pixel art from flat fill, and it costs nothing at runtime because it
 * is baked into the sprite.
 *
 * The light lands upper-left (R-06) so no caller re-derives it.
 *
 * @param {Canvas} canvas
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number[]} shadow
 * @param {number[]} base
 * @param {number[]} light
 * @returns {void}
 */
export function rampFace(canvas, x0, y0, x1, y1, shadow, base, light) {
  const down = Math.max(1, y1 - y0);
  const across = Math.max(1, x1 - x0);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const value = ((y - y0) / down) * 0.65 + ((x - x0) / across) * 0.35;
      set(canvas, x, y, value < 0.28 ? light : value < 0.72 ? base : shadow);
    }
  }
}
