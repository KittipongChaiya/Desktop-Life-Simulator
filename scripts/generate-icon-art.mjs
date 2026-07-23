/**
 * Generates the production icon set. Phase-05.6c (vertical slice).
 *
 * Canon: ICON_GUIDE.md — one subject, centred, silhouette-first, full 1 px
 * #3A3640 outline, upper-left light, hard alpha, detail that survives the
 * size. Sizes per ASSETS.md §3: 16×16 item/status/chrome, 24×24 toolbar.
 * Names per NAMING_CONVENTION.md §4.4 — category tokens from ICON_GUIDE.md §4.
 *
 * The set, translated from directive fix/0.1/5.5Assets I.md by the phase doc:
 * - Tools (24×24): hoe, seed, can, hand — the `1`–`4` toolbar
 *   (GAME_DESIGN.md §8.3). "Water" resolves to the watering can.
 * - Status/HUD (16×16): coin (the deliberate Reward Gold spend — the one
 *   icon allowed the reserved accent, ICON_GUIDE.md §3), worker.
 * - UI chrome (16×16): inventory, settings.
 * - Notification glyphs (16×16): success tick, caution mark — never red for
 *   routine events (GAME_DESIGN.md §10.1 rule 6).
 * - Future resources (16×16): wood, stone — tier-tagged ahead of the
 *   economy/RPG waves so they arrive into an established family.
 *
 * Deterministic; re-runs are byte-identical.
 * Run: `node scripts/generate-icon-art.mjs`, then `npm run assets`.
 */

import { join } from 'node:path';

import {
  GOLD_HIGHLIGHT,
  GRASS_BASE,
  GRASS_LIGHT,
  REWARD_GOLD,
  SKIN,
  SOFT_INK,
  SOIL_DARK,
  STONE_BASE,
  STONE_DARK,
  STONE_LIGHT,
  STRAW,
  WARNING_AMBER,
  WOOD_BASE,
  WOOD_LIGHT,
  alphaAt,
  createCanvas,
  ellipse,
  outlineSilhouette,
  rect,
  set,
  writePng,
} from './lib/pixel-art.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */

// ── Status / HUD (16×16) ─────────────────────────────────────────────────────

/** The coin — the one icon that SPENDS Reward Gold (ICON_GUIDE.md §3):
 * currency, the colour the eye is trained to seek. @returns {Canvas} */
function iconStatusCoin() {
  const canvas = createCanvas(16, 16);
  ellipse(canvas, 7.5, 7.5, 5.6, 5.6, STRAW, 0.1);
  ellipse(canvas, 7, 7, 5, 5, REWARD_GOLD, 0.1);
  // Minted inner ring, in the family's own shade.
  for (const [x, y] of [
    [5, 4],
    [4, 5],
    [3, 7],
    [4, 9],
    [5, 10],
    [7, 11],
    [9, 10],
    [10, 9],
    [11, 7],
    [10, 5],
    [9, 4],
    [7, 3],
  ]) {
    if (alphaAt(canvas, x ?? 0, y ?? 0) === 255) set(canvas, x ?? 0, y ?? 0, STRAW);
  }
  // The glint (Gold Highlight is reserved for exactly this — reward sparkle).
  set(canvas, 5, 5, GOLD_HIGHLIGHT);
  set(canvas, 6, 5, GOLD_HIGHLIGHT);
  set(canvas, 5, 6, GOLD_HIGHLIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

/** A worker at a glance: head and tunic-shouldered bust. @returns {Canvas} */
function iconStatusWorker() {
  const canvas = createCanvas(16, 16);
  // Shoulders: the earth-cloth tunic (COLOR_PALETTE.md §3.5, workers).
  ellipse(canvas, 7.5, 12.5, 5.4, 3.4, WOOD_BASE, 0.1);
  rect(canvas, 2, 12, 13, 13, WOOD_BASE);
  // Lit left shoulder.
  set(canvas, 3, 11, WOOD_LIGHT);
  set(canvas, 4, 10, WOOD_LIGHT);
  set(canvas, 4, 11, WOOD_LIGHT);
  set(canvas, 5, 10, WOOD_LIGHT);
  // Head over the shoulders, hair cap toward the light.
  ellipse(canvas, 7.5, 5.5, 3.4, 3.6, SKIN.warm.base, 0.1);
  ellipse(canvas, 7.5, 4, 3.2, 2, SOIL_DARK, 0.15);
  // Face shading on the lower-right jaw.
  set(canvas, 10, 7, SKIN.warm.shadow);
  set(canvas, 9, 8, SKIN.warm.shadow);
  set(canvas, 10, 8, SKIN.warm.shadow);
  outlineSilhouette(canvas);
  return canvas;
}

// ── UI chrome (16×16) ────────────────────────────────────────────────────────

/** The inventory satchel: flap up top catching the light. @returns {Canvas} */
function iconUiInventory() {
  const canvas = createCanvas(16, 16);
  // Bag body.
  ellipse(canvas, 7.5, 10, 5.4, 4.2, WOOD_BASE, 0.1);
  rect(canvas, 3, 8, 12, 12, WOOD_BASE);
  // Underside shade.
  for (let x = 5; x <= 11; x += 1) set(canvas, x, 13, SOIL_DARK);
  set(canvas, 11, 12, SOIL_DARK);
  set(canvas, 12, 12, SOIL_DARK);
  // Flap: the lit top face.
  rect(canvas, 3, 4, 12, 6, WOOD_LIGHT);
  set(canvas, 3, 7, WOOD_LIGHT);
  set(canvas, 12, 7, WOOD_LIGHT);
  // Buckle.
  set(canvas, 7, 6, STRAW);
  set(canvas, 8, 6, STRAW);
  set(canvas, 7, 7, STRAW);
  set(canvas, 8, 7, STRAW);
  outlineSilhouette(canvas);
  return canvas;
}

/** The settings gear: rounded teeth, raw-metal stone ramp, a punched hub.
 * @returns {Canvas} */
function iconUiSettings() {
  const canvas = createCanvas(16, 16);
  // Four cardinal + four diagonal teeth around a disc.
  ellipse(canvas, 7.5, 7.5, 4.4, 4.4, STONE_BASE, 0.1);
  /** @type {[number, number][]} */
  const teeth = [
    [7.5, 2],
    [7.5, 13],
    [2, 7.5],
    [13, 7.5],
    [3.6, 3.6],
    [11.4, 3.6],
    [3.6, 11.4],
    [11.4, 11.4],
  ];
  for (const [cx, cy] of teeth) ellipse(canvas, cx, cy, 1.4, 1.4, STONE_BASE, 0.2);
  // Upper-left light, lower-right shade.
  ellipse(canvas, 6.4, 6.4, 2.8, 2.8, STONE_LIGHT, 0.1);
  set(canvas, 7, 2, STONE_LIGHT);
  set(canvas, 3, 4, STONE_LIGHT);
  set(canvas, 4, 3, STONE_LIGHT);
  set(canvas, 2, 7, STONE_LIGHT);
  for (const [x, y] of [
    [11, 11],
    [12, 11],
    [11, 12],
    [10, 12],
    [12, 10],
    [13, 8],
    [8, 13],
  ]) {
    if (alphaAt(canvas, x ?? 0, y ?? 0) === 255) set(canvas, x ?? 0, y ?? 0, STONE_DARK);
  }
  // Punched hub: the hole is part of the silhouette, so the outline pass
  // wraps it and the gear reads as a gear, not a flower.
  for (let y = 6; y <= 9; y += 1) {
    for (let x = 6; x <= 9; x += 1) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      if (dx * dx + dy * dy <= 2.6) set(canvas, x, y, [0, 0, 0, 0]);
    }
  }
  outlineSilhouette(canvas);
  return canvas;
}

// ── Notification glyphs (16×16) ──────────────────────────────────────────────

/** The positive tick — Grass-green, the UI's Positive (COLOR_PALETTE.md §6).
 * @returns {Canvas} */
function iconNotificationSuccess() {
  const canvas = createCanvas(16, 16);
  // Down-stroke then the long up-stroke, 2 px thick.
  /** @type {[number, number][]} */
  const spine = [
    [3, 8],
    [4, 9],
    [5, 10],
    [6, 11],
    [7, 10],
    [8, 9],
    [9, 8],
    [10, 7],
    [11, 6],
    [12, 5],
  ];
  for (const [x, y] of spine) {
    set(canvas, x, y, GRASS_BASE);
    set(canvas, x, y - 1, GRASS_LIGHT);
  }
  set(canvas, 6, 12, GRASS_BASE);
  set(canvas, 5, 11, GRASS_BASE);
  outlineSilhouette(canvas);
  return canvas;
}

/** The caution mark — a calm amber exclamation, never red for routine events
 * (GAME_DESIGN.md §10.1 rule 6). Shape carries the state, not hue alone
 * (STYLE_LOCK.md R-14). @returns {Canvas} */
function iconNotificationCaution() {
  const canvas = createCanvas(16, 16);
  // Rounded bar.
  rect(canvas, 7, 3, 8, 9, WARNING_AMBER);
  set(canvas, 7, 2, WARNING_AMBER);
  set(canvas, 8, 2, WARNING_AMBER);
  // Lit left edge.
  for (let y = 3; y <= 8; y += 1) set(canvas, 7, y, STRAW);
  // The dot.
  rect(canvas, 7, 11, 8, 12, WARNING_AMBER);
  set(canvas, 7, 11, STRAW);
  outlineSilhouette(canvas);
  return canvas;
}

// ── Future resources (16×16, item_ form) ─────────────────────────────────────

/** Two stacked logs, ring-faced — ahead of the wood economy. @returns {Canvas} */
function itemWood() {
  const canvas = createCanvas(16, 16);
  // Back log, upper-right.
  rect(canvas, 5, 4, 13, 7, WOOD_BASE);
  for (let x = 5; x <= 13; x += 1) set(canvas, x, 4, WOOD_LIGHT);
  ellipse(canvas, 4.5, 5.5, 1.6, 2, WOOD_LIGHT, 0.15);
  set(canvas, 4, 5, WOOD_BASE);
  set(canvas, 5, 6, WOOD_BASE);
  // Front log, lower-left, its cut face showing rings.
  rect(canvas, 4, 8, 12, 12, WOOD_BASE);
  for (let x = 4; x <= 12; x += 1) set(canvas, x, 12, SOIL_DARK);
  for (let x = 5; x <= 12; x += 1) set(canvas, x, 8, WOOD_LIGHT);
  ellipse(canvas, 12.5, 10, 1.8, 2.4, WOOD_LIGHT, 0.15);
  set(canvas, 12, 10, SOIL_DARK);
  set(canvas, 13, 10, WOOD_BASE);
  outlineSilhouette(canvas);
  return canvas;
}

/** A stone chunk — the rock prop's own stacked-facet read at item size, so
 * the family stays one hand. @returns {Canvas} */
function itemStone() {
  const canvas = createCanvas(16, 16);
  ellipse(canvas, 7.5, 9.5, 5.4, 3.6, STONE_DARK, 0.1);
  ellipse(canvas, 7, 8.5, 4.8, 3.4, STONE_BASE, 0.1);
  ellipse(canvas, 6, 7, 3, 2.2, STONE_LIGHT, 0.1);
  // One seam, Soft Ink, sparingly (PIXEL_GUIDE.md §5).
  set(canvas, 8, 8, SOFT_INK);
  set(canvas, 9, 9, SOFT_INK);
  set(canvas, 10, 10, SOFT_INK);
  outlineSilhouette(canvas);
  return canvas;
}

// ── Tools (24×24 — the toolbar, GAME_DESIGN.md §8.3) ─────────────────────────

/** The hoe: worn handle, a flat blade hooking DOWN off the handle's end —
 * the Γ profile that says hoe, never the symmetric head that says hammer.
 * @returns {Canvas} */
function iconToolHoe() {
  const canvas = createCanvas(24, 24);
  // Handle: 2 px diagonal from lower-left to upper-right.
  for (let i = 0; i < 13; i += 1) {
    const x = 3 + i;
    const y = 20 - i;
    set(canvas, x, y, WOOD_BASE);
    set(canvas, x + 1, y, WOOD_LIGHT);
  }
  // Collar plate off the handle tip, then the thin blade sweeping down-right.
  rect(canvas, 15, 6, 20, 8, STONE_BASE);
  for (let x = 15; x <= 20; x += 1) set(canvas, x, 6, STONE_LIGHT);
  rect(canvas, 18, 9, 20, 13, STONE_BASE);
  for (let y = 9; y <= 13; y += 1) set(canvas, 20, y, STONE_DARK);
  set(canvas, 18, 13, STONE_DARK);
  set(canvas, 19, 13, STONE_DARK);
  set(canvas, 18, 9, STONE_LIGHT);
  set(canvas, 18, 10, STONE_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

/** The seed pouch: a tied sack with seeds spilling at its foot. @returns {Canvas} */
function iconToolSeed() {
  const canvas = createCanvas(24, 24);
  // Sack body.
  ellipse(canvas, 11.5, 14.5, 6.4, 5.8, WOOD_LIGHT, 0.1);
  // Gathered neck and tie.
  rect(canvas, 9, 6, 14, 8, WOOD_LIGHT);
  rect(canvas, 9, 8, 14, 9, WOOD_BASE);
  set(canvas, 8, 7, WOOD_LIGHT);
  set(canvas, 15, 7, WOOD_LIGHT);
  // Fold shadows down the sack's right side.
  for (const [x, y] of [
    [15, 12],
    [16, 13],
    [16, 14],
    [16, 15],
    [15, 16],
    [14, 17],
    [12, 18],
  ]) {
    if (alphaAt(canvas, x ?? 0, y ?? 0) === 255) set(canvas, x ?? 0, y ?? 0, WOOD_BASE);
  }
  // Seeds spilling, attached at the sack's foot.
  set(canvas, 17, 18, STRAW);
  set(canvas, 18, 18, STRAW);
  set(canvas, 18, 19, STRAW);
  set(canvas, 16, 19, STRAW);
  set(canvas, 17, 20, STRAW);
  outlineSilhouette(canvas);
  return canvas;
}

/** The watering can: stout metal body, high spout, water on its way.
 * @returns {Canvas} */
function iconToolCan() {
  const canvas = createCanvas(24, 24);
  // Body.
  rect(canvas, 8, 10, 18, 19, STONE_BASE);
  set(canvas, 8, 10, STONE_LIGHT);
  rect(canvas, 8, 10, 18, 11, STONE_LIGHT);
  for (let y = 12; y <= 18; y += 1) set(canvas, 8, y, STONE_LIGHT);
  for (let y = 12; y <= 19; y += 1) set(canvas, 18, y, STONE_DARK);
  for (let x = 9; x <= 18; x += 1) set(canvas, x, 19, STONE_DARK);
  // Top handle arc.
  set(canvas, 11, 7, STONE_BASE);
  set(canvas, 12, 6, STONE_BASE);
  set(canvas, 13, 6, STONE_BASE);
  set(canvas, 14, 6, STONE_BASE);
  set(canvas, 15, 7, STONE_BASE);
  set(canvas, 10, 8, STONE_BASE);
  set(canvas, 10, 9, STONE_BASE);
  set(canvas, 16, 8, STONE_BASE);
  set(canvas, 16, 9, STONE_BASE);
  // Spout rising to the left, with its rose.
  set(canvas, 7, 12, STONE_BASE);
  set(canvas, 6, 11, STONE_BASE);
  set(canvas, 5, 10, STONE_BASE);
  set(canvas, 4, 9, STONE_BASE);
  set(canvas, 6, 12, STONE_DARK);
  set(canvas, 5, 11, STONE_DARK);
  rect(canvas, 3, 7, 5, 8, STONE_LIGHT);
  outlineSilhouette(canvas);
  return canvas;
}

/** The open hand — harvest by hand, tool `4`. Warm skin, mitten-simple.
 * @returns {Canvas} */
function iconToolHand() {
  const canvas = createCanvas(24, 24);
  // Palm.
  ellipse(canvas, 11.5, 14, 5.4, 4.8, SKIN.warm.base, 0.1);
  // Four fingers: 2 px columns with 1 px gaps, tips rounded by the outline.
  /** @type {[number, number][]} x, topY */
  const fingers = [
    [6, 7],
    [9, 5],
    [12, 4],
    [15, 6],
  ];
  for (const [x, topY] of fingers) {
    rect(canvas, x, topY, x + 1, 12, SKIN.warm.base);
    set(canvas, x, topY, SKIN.warm.base);
  }
  // Thumb sweeping right.
  ellipse(canvas, 17.5, 13, 2, 3, SKIN.warm.base, 0.15);
  // Lower-right shading and the palm crease.
  for (const [x, y] of [
    [15, 17],
    [16, 16],
    [16, 15],
    [14, 18],
    [12, 18],
    [10, 18],
    [17, 14],
    [18, 14],
  ]) {
    if (alphaAt(canvas, x ?? 0, y ?? 0) === 255) set(canvas, x ?? 0, y ?? 0, SKIN.warm.shadow);
  }
  set(canvas, 9, 15, SKIN.warm.shadow);
  set(canvas, 10, 16, SKIN.warm.shadow);
  set(canvas, 11, 16, SKIN.warm.shadow);
  outlineSilhouette(canvas);
  return canvas;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const uiDir = join(SRC, 'ui-world{tps}');

  /** @type {[string, () => Canvas][]} */
  const icons = [
    ['icon_status_coin', iconStatusCoin],
    ['icon_status_worker', iconStatusWorker],
    ['icon_ui_inventory', iconUiInventory],
    ['icon_ui_settings', iconUiSettings],
    ['icon_notification_success', iconNotificationSuccess],
    ['icon_notification_caution', iconNotificationCaution],
    ['item_wood', itemWood],
    ['item_stone', itemStone],
    ['icon_tool_hoe', iconToolHoe],
    ['icon_tool_seed', iconToolSeed],
    ['icon_tool_can', iconToolCan],
    ['icon_tool_hand', iconToolHand],
  ];

  for (const [name, paint] of icons) {
    writePng(join(uiDir, `${name}.png`), paint());
  }

  globalThis.console.log(`generated ${String(icons.length)} icons`);
}

main();
