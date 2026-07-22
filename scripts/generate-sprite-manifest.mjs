/**
 * Generates the typed sprite manifest. ADR-006 §4, ASSETS.md §5.
 *
 * AssetPack emits atlas JSON; this turns it into TypeScript so every texture is
 * referenced through a checked key. Deleting or renaming a source asset then
 * breaks the BUILD at every use site, instead of producing a missing texture in
 * a state nobody tests.
 *
 * Run via `npm run assets`, after assetpack. Output is gitignored.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {{ frames?: Record<string, unknown> }} AtlasFile */
/** @typedef {{ frames: string[], frameTicks: number, loop: boolean }} AnimationDef */

const DIST = join(import.meta.dirname, '..', 'assets', 'dist');
const SRC = join(import.meta.dirname, '..', 'assets', 'src');
const OUTPUT = join(DIST, 'manifest.ts');

/**
 * `crops/wheat_2.png` in atlas `crops` -> `cropsWheat2`
 * @param {string} atlas
 * @param {string} frame
 * @returns {string}
 */
function toKey(atlas, frame) {
  const base = stripExtension(frame);
  const words = `${atlas} ${base}`.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return words
    .map((word, i) => (i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1)))
    .join('');
}

/**
 * @param {string} name
 * @returns {string}
 */
function stripExtension(name) {
  return name.replace(/\.[^.]+$/, '');
}

/**
 * @param {string} file
 * @returns {AtlasFile}
 */
function readAtlas(file) {
  // Narrow through `unknown` first: JSON.parse returns `any`, and returning it
  // directly would leak an unchecked type into every caller.
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(join(DIST, file), 'utf8'));
  return /** @type {AtlasFile} */ (parsed);
}

/**
 * Reads every `*.anim.json` sidecar under `assets/src` (ASSETS.md §7) and turns
 * it into one animation map. The atlas is the frame's containing group — the
 * source directory with its `{tag}` stripped — so `entities{tps}/worker.anim.json`
 * yields frames like `entities:worker_walk_s_0`.
 *
 * Every referenced frame is validated against the packed sprites, so a typo or
 * a deleted frame breaks the BUILD rather than producing a missing texture at
 * runtime (the same guarantee the sprite manifest gives, ASSETS.md §5).
 *
 * @param {Set<string>} spriteValues every valid `atlas:frame` value
 * @returns {Map<string, AnimationDef>} animation name -> definition
 */
function readAnimations(spriteValues) {
  const files = readdirSync(SRC, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.anim.json'))
    .sort();

  /** @type {Map<string, AnimationDef>} */
  const animations = new Map();

  for (const file of files) {
    const parts = file.split(/[\\/]/);
    const dir = parts[parts.length - 2] ?? '';
    const atlas = dir.replace(/\{[^}]*\}$/, ''); // strip the `{tps}` pipeline tag

    /** @type {unknown} */
    const parsed = JSON.parse(readFileSync(join(SRC, file), 'utf8'));
    const entries = /** @type {Record<string, AnimationDef>} */ (parsed);

    for (const name of Object.keys(entries).sort()) {
      if (animations.has(name)) {
        throw new Error(`Duplicate animation "${name}" across sidecars`);
      }
      const def = entries[name];
      const frames = def.frames.map((frame) => {
        const value = `${atlas}:${frame}`;
        if (!spriteValues.has(value)) {
          throw new Error(`Animation "${name}" references unknown frame "${value}"`);
        }
        return value;
      });
      animations.set(name, { frames, frameTicks: def.frameTicks, loop: def.loop });
    }
  }

  return animations;
}

function main() {
  const atlases = readdirSync(DIST)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .sort();

  /** @type {Map<string, string>} */
  const sprites = new Map();

  for (const file of atlases) {
    const atlas = stripExtension(file);
    const frames = readAtlas(file).frames ?? {};

    for (const frame of Object.keys(frames).sort()) {
      const key = toKey(atlas, frame);
      const value = `${atlas}:${stripExtension(frame)}`;

      const existing = sprites.get(key);
      if (existing !== undefined && existing !== value) {
        // Two frames collapsing to one key would silently shadow one another.
        throw new Error(`Duplicate sprite key "${key}": "${existing}" and "${value}"`);
      }
      sprites.set(key, value);
    }
  }

  const spriteValues = new Set(sprites.values());
  const animations = readAnimations(spriteValues);

  const entries = [...sprites.entries()].map(([key, value]) => `  ${key}: '${value}',`).join('\n');
  const atlasNames = atlases.map((f) => `  '${stripExtension(f)}',`).join('\n');
  const animEntries = [...animations.entries()]
    .map(([name, def]) => {
      const frames = def.frames.map((f) => `'${f}'`).join(', ');
      return `  '${name}': { frames: [${frames}], frameTicks: ${String(def.frameTicks)}, loop: ${String(def.loop)} },`;
    })
    .join('\n');

  const source = `/* eslint-disable */
// GENERATED by scripts/generate-sprite-manifest.mjs — do not edit.
// Regenerate with \`npm run assets\`. See ASSETS.md §5.
//
// Textures are referenced ONLY through these keys. String-literal texture
// paths are banned (ADR-006 §4).

export const Sprites = {
${entries}
} as const;

export type SpriteKey = (typeof Sprites)[keyof typeof Sprites];

/** Every atlas that must be loaded at startup. */
export const Atlases = [
${atlasNames}
] as const;

export type AtlasName = (typeof Atlases)[number];

// Frame-based animations, read from the \`*.anim.json\` sidecars (ASSETS.md §7).
// \`frameTicks\` is in SIMULATION TICKS, not milliseconds (ADR-007 §7). Frames are
// validated against the sprites above at generation time.
export const Animations = {
${animEntries}
} as const;

export type AnimationName = keyof typeof Animations;
`;

  writeFileSync(OUTPUT, source, 'utf8');
  globalThis.console.log(
    `generated ${OUTPUT} — ${String(sprites.size)} sprite(s), ${String(atlases.length)} atlas(es), ${String(animations.size)} animation(s)`,
  );
}

main();
