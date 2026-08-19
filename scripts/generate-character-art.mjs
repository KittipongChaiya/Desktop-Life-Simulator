/**
 * Generates the production character rigs — worker and player avatar.
 * Phase-05.6d (vertical slice).
 *
 * One shared painter draws the standard human rig (CHARACTER_BIBLE.md §2,
 * the R-07 anchor): 32×48 canvas, ≈40 px standing height, 1:4 head-to-body
 * (≈10 px head), 16–18 px figure width, mittened 2–3 px limbs, dark-dot
 * eyes, no facial detail. Costumes differ, the body never does (§14 rule 2):
 * - Worker: straw work-hat + apron over earth-cloth (§6, §11) — warm skin,
 *   brown hair (COLOR_PALETTE.md §3.5), matching the icon_status_worker bust.
 * - Player: bare dark hair + ONE accent garment, a Water-ramp scarf (§6 —
 *   the accent is the player's identity and is not reused on workers).
 *
 * Sets: idle (1 static frame × 4 dirs), walk (4 frames × 4 dirs, the calm
 * 5 fps gait), harvest (6 frames × 5 frameTicks = the 30 t sim cost,
 * ANIMATION_GUIDE.md §2; directionless — directions animate only where the
 * action has facing, §3). Worker files replace the 16×16 placeholders
 * file-for-file (ASSETS.md §7.3); player files pre-wire the future player
 * entity.
 *
 * The upper-left light (PIXEL_GUIDE.md §7) is applied as a world-fixed
 * shading pass AFTER any view mirroring, so west-facing sprites stay lit
 * from the same sky as everything else (STYLE_LOCK.md R-06).
 *
 * Deterministic; re-runs are byte-identical.
 * Run: `node scripts/generate-character-art.mjs`, then `npm run assets`.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  INK_SHADOW,
  PARCHMENT,
  SKIN,
  SOFT_INK,
  SOIL_DARK,
  STONE_WARM,
  STONE_WARM_DARK,
  STONE_WARM_LIGHT,
  STRAW,
  TIMBER_DARK,
  TIMBER_WARM,
  BLOOM_ROSE,
  CREAM,
  TILLED_SOIL,
  WATER_BASE,
  WATER_DEEP,
  WATER_LIGHT,
  WOOD_BASE,
  WOOD_LIGHT,
  createCanvas,
  ellipse,
  outlineSilhouette,
  rect,
  set,
  writePng,
} from './lib/pixel-art.mjs';

const SRC = join(import.meta.dirname, '..', 'assets', 'src');

/** @typedef {import('./lib/pixel-art.mjs').Canvas} Canvas */

/**
 * @typedef {object} Costume
 * @property {{ base: number[], shadow: number[] }} skin
 * @property {number[]} hair
 * @property {boolean} hat straw work-hat (worker tell)
 * @property {boolean} apron work-apron front (worker tell)
 * @property {boolean} scarf the player's one accent garment
 * @property {{ base: number[], light: number[], shadow: number[] }} tunic torso & arm cloth ramp
 */

/** The farmhand cloth every pre-19 costume wore; villagers vary it (§14 rule 2:
 * costumes differ, the body never does). */
const WOOD_TUNIC = { base: WOOD_BASE, light: WOOD_LIGHT, shadow: SOIL_DARK };

/** @type {Costume} */
const WORKER = {
  skin: SKIN.warm,
  hair: SOIL_DARK,
  hat: true,
  apron: true,
  scarf: false,
  tunic: WOOD_TUNIC,
};
/**
 * TWO MORE WORKERS, so a farm is staffed by PEOPLE rather than by one person
 * printed several times (phase-36 — the brief §9: "do not make every NPC look
 * like the same character with a different shirt").
 *
 * The hat and the apron are kept on all three. `CHARACTER_BIBLE` makes those
 * two the worker's tells — they are how a worker is told from the player and
 * from a villager at a glance — so what varies is everything else: skin, hair,
 * and the cloth under the apron. Varying the tells would buy variety by
 * spending readability, which is the wrong trade at this size.
 *
 * NOT ROLES. The brief asks for workers distinguishable BY ROLE, and the
 * simulation has no role to read: `WorkerSchedule.taskKinds` is optional and
 * most workers have none, so a costume keyed to it would leave the majority
 * identical and change appearance when a player edited a schedule. Inventing a
 * role would be a gameplay change, which §22 of the brief forbids outright.
 * People, then — not job titles.
 */
/** @type {Costume} */
const WORKER_B = {
  skin: SKIN.deep,
  hair: TIMBER_DARK,
  hat: true,
  apron: true,
  scarf: false,
  tunic: { base: STONE_WARM, light: STONE_WARM_LIGHT, shadow: STONE_WARM_DARK },
};
/** @type {Costume} */
const WORKER_C = {
  skin: SKIN.fair,
  hair: TIMBER_WARM,
  hat: true,
  apron: true,
  scarf: false,
  tunic: { base: BLOOM_ROSE, light: CREAM, shadow: TIMBER_DARK },
};

/** @type {Costume} */
const PLAYER = {
  skin: SKIN.tan,
  hair: SOFT_INK,
  hat: false,
  apron: false,
  scarf: true,
  tunic: WOOD_TUNIC,
};
/** Villagers (phase-19, ADR-031 §4): the same rig in townsfolk cloth. No hat,
 * no apron, no scarf — those tells belong to the worker and the player. */
/** @type {Costume} */
const VILLAGER_A = {
  skin: SKIN.warm,
  hair: STRAW,
  hat: false,
  apron: false,
  scarf: false,
  tunic: { base: PARCHMENT, light: PARCHMENT, shadow: STRAW },
};
/** @type {Costume} */
const VILLAGER_B = {
  skin: SKIN.tan,
  hair: SOFT_INK,
  hat: false,
  apron: false,
  scarf: false,
  // BLUE, not the grey-violet stone ramp this wore until phase-36. That ramp
  // is for cold rock (`COLOR_PALETTE.md` §3.2c) and the brief names sterile
  // grey directly — a person is the last thing that should be wearing it.
  //
  // Blue rather than another cream: the first attempt warmed this to cream and
  // the contact sheet showed the cost immediately — the two villagers became
  // one villager with different hair. The brief asks for muted sky blues, and
  // nobody else in the cast wears one.
  tunic: { base: WATER_BASE, light: WATER_LIGHT, shadow: WATER_DEEP },
};

/**
 * @typedef {object} Pose
 * @property {number} bob whole-figure lift on walk passing frames (px up)
 * @property {number} stride -1 | 0 | 1 — which leg leads
 * @property {number} stoop head/torso/arms sink for the harvest stoop (px down)
 * @property {'side' | 'reach' | 'ground' | 'hold'} hands arm attitude
 * @property {'none' | 'chest' | 'low'} bundle harvested sheaf in hand
 */

/** @type {Pose} */
const STAND = { bob: 0, stride: 0, stoop: 0, hands: 'side', bundle: 'none' };

/** The calm 4-frame gait: contact, passing (lifted), contact, passing. */
const WALK_POSES = [
  { ...STAND, stride: 1 },
  { ...STAND, bob: 1 },
  { ...STAND, stride: -1 },
  { ...STAND, bob: 1 },
];

/** Reach, pluck, straighten — six beats that fill the 30-tick harvest. */
/** @type {Pose[]} */
const HARVEST_POSES = [
  { ...STAND, stoop: 1, hands: 'reach' },
  { ...STAND, stoop: 3, hands: 'reach' },
  { ...STAND, stoop: 4, hands: 'ground' },
  { ...STAND, stoop: 2, hands: 'hold', bundle: 'low' },
  { ...STAND, stoop: 0, hands: 'hold', bundle: 'chest' },
  { ...STAND, stoop: 0, hands: 'side', bundle: 'chest' },
];

// ── Geometry (flat base colours; shading and outline come later) ─────────────

/**
 * Paints the rig for a front (`s`), back (`n`), or east-side (`e`) view.
 * West is produced by mirroring an east paint before the shading pass.
 * @param {Canvas} c
 * @param {'s' | 'n' | 'e'} view
 * @param {Pose} pose
 * @param {Costume} costume
 */
function paintGeometry(c, view, pose, costume) {
  const dy = pose.stoop - pose.bob; // upper-body vertical shift
  const side = view === 'e';

  // Legs (planted; feet own the pivot row and never leave it mid-harvest).
  const legTop = 31 + Math.max(0, pose.stoop - 1);
  if (side) {
    // Back leg first, in the trouser shadow tone, so depth reads.
    const spread = pose.stride * 2;
    rect(c, 13 - spread, legTop, 16 - spread, 44, SOIL_DARK);
    rect(c, 13 - spread, 43, 16 - spread, 44, SOIL_DARK);
    rect(c, 15 + spread, legTop, 18 + spread, 44, TILLED_SOIL);
    rect(c, 14 + spread, 43, 18 + spread, 44, SOIL_DARK); // boot
    set(c, 19 + spread, 44, SOIL_DARK);
  } else {
    // Front/back view: the lifted leg rides 2 px up, the planted one grounds.
    const liftL = pose.stride === 1 ? 2 : 0;
    const liftR = pose.stride === -1 ? 2 : 0;
    rect(c, 11, legTop, 14, 42 - liftL, TILLED_SOIL);
    rect(c, 11, 43 - liftL, 14, 44 - liftL, SOIL_DARK); // boot
    rect(c, 17, legTop, 20, 42 - liftR, TILLED_SOIL);
    rect(c, 17, 43 - liftR, 20, 44 - liftR, SOIL_DARK);
  }

  // Torso, in the costume's cloth.
  const torsoTop = 16 + dy;
  const torsoBottom = 31 + Math.max(0, pose.stoop - 1);
  if (side) {
    rect(c, 11, torsoTop, 20, torsoBottom, costume.tunic.base);
  } else {
    rect(c, 10, torsoTop, 21, torsoBottom, costume.tunic.base);
    set(c, 10, torsoTop, [0, 0, 0, 0]); // soften shoulder corners
    set(c, 21, torsoTop, [0, 0, 0, 0]);
  }

  // Apron (front view only — its silhouette line is the worker tell).
  if (costume.apron && view === 's') {
    rect(c, 12, torsoTop + 4, 19, torsoBottom, WOOD_LIGHT);
  }
  // Belt.
  if (!side) rect(c, 10, torsoBottom, 21, torsoBottom, SOIL_DARK);

  // Arms.
  const armTop = 17 + dy;
  if (side) {
    // One near arm, swinging opposite the front leg; reaches on harvest.
    const swing = -pose.stride * 2;
    const handY =
      pose.hands === 'ground' ? 38 : pose.hands === 'reach' ? 32 + pose.stoop : 27 + dy;
    rect(c, 14 + swing, armTop, 16 + swing, handY, costume.tunic.base);
    rect(c, 14 + swing, handY, 16 + swing, handY + 1, costume.skin.base); // mitten
  } else {
    const swingL = view === 's' ? -pose.stride : pose.stride;
    /** @type {[number, number, number][]} x0, x1, swing */
    const arms = [
      [8, 9, swingL],
      [22, 23, -swingL],
    ];
    for (const [x0, x1, swing] of arms) {
      if (pose.hands === 'hold') {
        // Arms curl inward to carry the bundle.
        rect(c, x0, armTop, x1, 24 + dy, costume.tunic.base);
        const inX = x0 < 16 ? x0 + 2 : x0 - 2;
        rect(c, inX, 24 + dy, inX + 1, 27 + dy, costume.tunic.base);
        rect(c, inX, 27 + dy, inX + 1, 28 + dy, costume.skin.base);
      } else {
        const reach = pose.hands === 'reach' || pose.hands === 'ground';
        const handY = reach ? 31 + pose.stoop * 2 : 27 + dy + swing;
        rect(c, x0, armTop, x1, handY, costume.tunic.base);
        rect(c, x0, handY + 1, x1, handY + 2, costume.skin.base); // mitten
      }
    }
  }

  // The harvested sheaf.
  if (pose.bundle === 'chest') rect(c, 12, 24 + dy, 19, 27 + dy, STRAW);
  if (pose.bundle === 'low') rect(c, 12, 28 + dy, 19, 31 + dy, STRAW);

  // Head.
  const headCy = 10.5 + dy;
  ellipse(c, 15.5, headCy, 4.8, 4.9, costume.skin.base, 0.1);

  // Hair.
  if (view === 'n') {
    // Back of the head is all hair.
    ellipse(c, 15.5, headCy - 0.3, 4.8, 4.5, costume.hair, 0.1);
  } else {
    // Fringe across the top — kept high so a forehead row separates it from
    // the eyes (the first paint read as a monobrow); side view carries it
    // down the back of the head.
    ellipse(c, 15.5, headCy - 2.9, 4.6, 1.7, costume.hair, 0.1);
    if (side) rect(c, 11, 8 + dy, 13, 13 + dy, costume.hair);
  }

  // Face: dark-dot eyes only (CHARACTER_BIBLE.md §4); none on the back view.
  const eyeY = 11 + dy;
  if (view === 's') {
    set(c, 13, eyeY, INK_SHADOW);
    set(c, 18, eyeY, INK_SHADOW);
  } else if (side) {
    set(c, 18, eyeY, INK_SHADOW);
    set(c, 21, eyeY + 1, costume.skin.base); // the nose bump of the profile
  }

  // Straw work-hat (worker): crown + brim; brim leads the facing on the side.
  if (costume.hat) {
    const hatY = 8 + dy;
    rect(c, 12, hatY - 3, 19, hatY - 1, STRAW);
    if (side) rect(c, 9, hatY, 23, hatY, STRAW);
    else rect(c, 9, hatY, 22, hatY, STRAW);
  }

  // The player's scarf: the one accent garment, wrapped at the neck.
  if (costume.scarf) {
    const scarfY = 16 + dy;
    rect(c, 11, scarfY, 20, scarfY + 1, WATER_BASE);
    if (view === 's') {
      // A hanging tail on the front read.
      rect(c, 12, scarfY + 2, 13, scarfY + 5, WATER_BASE);
    }
  }
}

/** Mirrors a canvas horizontally in place (for the west view). @param {Canvas} c */
function mirror(c) {
  for (let y = 0; y < c.height; y += 1) {
    for (let x = 0; x < c.width / 2; x += 1) {
      const a = (y * c.width + x) * 4;
      const b = (y * c.width + (c.width - 1 - x)) * 4;
      for (let i = 0; i < 4; i += 1) {
        const t = c.px[a + i] ?? 0;
        c.px[a + i] = c.px[b + i] ?? 0;
        c.px[b + i] = t;
      }
    }
  }
}

/**
 * The world-fixed light: on every horizontal run of a mapped base colour,
 * the leftmost pixel takes the light step and the rightmost the shadow step
 * (upper-left light, PIXEL_GUIDE.md §7). Runs after mirroring, so all four
 * views share one sky (STYLE_LOCK.md R-06).
 * @param {Canvas} c
 * @param {[number[], number[], number[]][]} map [base, light, shadow]
 */
function shadePass(c, map) {
  const key = (/** @type {number[]} */ colour) => colour.slice(0, 3).join(',');
  const lookup = new Map(map.map(([base, light, shadow]) => [key(base), { light, shadow }]));
  for (let y = 0; y < c.height; y += 1) {
    let runStart = -1;
    let runKey = '';
    for (let x = 0; x <= c.width; x += 1) {
      const offset = (y * c.width + x) * 4;
      const inBounds = x < c.width && (c.px[offset + 3] ?? 0) === 255;
      const k = inBounds
        ? `${String(c.px[offset] ?? 0)},${String(c.px[offset + 1] ?? 0)},${String(c.px[offset + 2] ?? 0)}`
        : '';
      if (k !== runKey) {
        // Close the previous run.
        if (runStart >= 0 && lookup.has(runKey)) {
          const steps = lookup.get(runKey);
          const runEnd = x - 1;
          if (steps !== undefined && runEnd - runStart >= 1) {
            set(c, runStart, y, steps.light);
            set(c, runEnd, y, steps.shadow);
          }
        }
        runStart = inBounds ? x : -1;
        runKey = k;
      }
    }
  }
}

/**
 * Full sprite: geometry (mirrored for west) → shading → outline.
 * @param {'s' | 'n' | 'e' | 'w'} view
 * @param {Pose} pose
 * @param {Costume} costume
 * @returns {Canvas}
 */
function paintView(view, pose, costume) {
  const c = createCanvas(32, 48);
  if (view === 'w') {
    paintGeometry(c, 'e', pose, costume);
    mirror(c);
  } else {
    paintGeometry(c, view, pose, costume);
  }
  shadePass(c, [
    [costume.tunic.base, costume.tunic.light, costume.tunic.shadow], // tunic & arms
    [TILLED_SOIL, WOOD_BASE, SOIL_DARK], // trousers
    [WOOD_LIGHT, WOOD_LIGHT, WOOD_BASE], // apron: right edge shades
    [STRAW, STRAW, WOOD_LIGHT], // hat & sheaf: right edge shades
    [costume.skin.base, costume.skin.base, costume.skin.shadow],
    [WATER_BASE, WATER_LIGHT, WATER_DEEP], // the player scarf
  ]);
  outlineSilhouette(c);
  return c;
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Writes one character's full frame set.
 * @param {string} entity `worker` | `player` | `villager_a` | `villager_b`
 * @param {Costume} costume
 * @param {boolean} [withHarvest] villagers do not work the ground — no swing
 */
function writeCharacter(entity, costume, withHarvest = true, keyPrefix = `${entity}_`) {
  const dir = join(SRC, 'entities{tps}');
  /** @type {('n' | 's' | 'e' | 'w')[]} */
  const views = ['n', 's', 'e', 'w'];
  /** @type {Record<string, {frames: string[], frameTicks: number, loop: boolean}>} */
  const animations = {};

  for (const view of views) {
    writePng(join(dir, `${entity}_idle_${view}.png`), paintView(view, STAND, costume));
    animations[`${keyPrefix}idle_${view}`] = {
      frames: [`${entity}_idle_${view}`],
      frameTicks: 0,
      loop: false,
    };

    const walk = [];
    for (let f = 0; f < WALK_POSES.length; f += 1) {
      const pose = WALK_POSES[f] ?? STAND;
      writePng(join(dir, `${entity}_walk_${view}_${String(f)}.png`), paintView(view, pose, costume));
      walk.push(`${entity}_walk_${view}_${String(f)}`);
    }
    animations[`${keyPrefix}walk_${view}`] = { frames: walk, frameTicks: 4, loop: true };
  }

  if (withHarvest) {
    // Harvest is directionless (ANIMATION_GUIDE.md §3): a front-view one-shot.
    const harvest = [];
    for (let f = 0; f < HARVEST_POSES.length; f += 1) {
      const pose = HARVEST_POSES[f] ?? STAND;
      writePng(join(dir, `${entity}_harvest_${String(f)}.png`), paintView('s', pose, costume));
      harvest.push(`${entity}_harvest_${String(f)}`);
    }
    animations[`${keyPrefix}harvest`] = { frames: harvest, frameTicks: 5, loop: false };
  }

  // THE SIDECAR IS GENERATED WITH THE FRAMES, not hand-authored beside them.
  // Phase-36 added two worker rigs, the sprites appeared, and every one of them
  // was unreachable — `ANIMATIONS[...]` returned undefined and the renderer
  // silently drew nothing, because the `.anim.json` files were written by hand
  // and nobody remembers a file that is not in front of them. Art and the
  // manifest that indexes it now cannot drift.
  writeFileSync(join(dir, `${entity}.anim.json`), `${JSON.stringify(animations, null, 2)}
`);
}

function main() {
  // The base rig stays UNPREFIXED — an empty key prefix.
  writeCharacter('worker', WORKER, true, '');
  // The base rig stays UNPREFIXED. Its animation keys are bare (`walk_s`, not
  // `worker_walk_s`) because it shipped first as the default, and renaming it
  // would churn 21 tracked PNGs and an anim manifest for no visual gain.
  writeCharacter('worker_b', WORKER_B);
  writeCharacter('worker_c', WORKER_C);
  writeCharacter('player', PLAYER);
  // Phase-19: the villagers, on the same rig (CHARACTER_BIBLE §14 rule 2).
  writeCharacter('villager_a', VILLAGER_A, false);
  writeCharacter('villager_b', VILLAGER_B, false);
  globalThis.console.log('generated 3 worker rigs + player + 2 villager rigs');
}

main();
