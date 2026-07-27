/**
 * Generates the placeholder sound set. Phase-07.5a — ADR-016, ASSETS.md §3.
 *
 * Scripted, deterministic, and reproducible, exactly like the pixel art
 * (`generate-world-art.mjs` and friends): the SCRIPT is the editable source and
 * its git history is the asset's version (ADR-006 §2). Output lands in the
 * gitignored `assets/dist/audio/`, rebuilt by `npm run assets`.
 *
 * THE REPLACEMENT PATH, which is the whole point of the placeholders
 * (`fix/0.1/7.5.md` — "future replacement must require no code changes"): drop
 * a real `assets/src/audio/<name>.wav` into the tree and this script copies it
 * through instead of synthesising. No renderer code, no catalogue entry, and
 * no call site changes — the game asks for `Sound.Harvest` and never learns
 * which of the two it got.
 *
 * These are placeholders and they sound like it. They exist to prove the
 * wiring, to give the loop acknowledgement, and to be thrown away.
 *
 * The ambient beds `fix/0.1/7.5.md` also lists are deliberately not here:
 * continuous sound is the audible form of the idle motion this phase ruled
 * out, and a sound with no trigger would be an unreachable asset. See
 * `src/renderer/app/sounds.ts`.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE_RATE = 44_100; // ASSETS.md §3
const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'assets', 'src', 'audio');
const OUT = join(ROOT, 'assets', 'dist', 'audio');

// ---------------------------------------------------------------------------
// Synthesis — deliberately small. Anything richer belongs to a real composer.
// ---------------------------------------------------------------------------

/**
 * A deterministic noise source. `Math.random` would make builds irreproducible.
 * @param {number} seed
 * @returns {() => number}
 */
function createNoise(seed) {
  let state = seed >>> 0;
  return () => {
    // xorshift32 — same generator family as the sim's RNG, same reason.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

/**
 * @param {number} ms
 * @returns {number}
 */
const seconds = (ms) => Math.max(1, Math.round((ms / 1000) * SAMPLE_RATE));

/**
 * Adds a decaying tone into `buffer` starting at `atMs`.
 * @param {Float32Array} buffer
 * @param {{ freq: number, ms: number, atMs?: number, gain?: number, decay?: number, wave?: 'sine' | 'square' | 'triangle', bend?: number }} options
 * @returns {void}
 */
function tone(buffer, { freq, ms, atMs = 0, gain = 1, decay = 4, wave = 'sine', bend = 0 }) {
  const start = seconds(atMs);
  const length = seconds(ms);
  for (let i = 0; i < length; i += 1) {
    const index = start + i;
    if (index >= buffer.length) break;
    const t = i / SAMPLE_RATE;
    const progress = i / length;
    const frequency = freq * (1 + bend * progress);
    const phase = 2 * Math.PI * frequency * t;
    const raw =
      wave === 'square'
        ? Math.sign(Math.sin(phase))
        : wave === 'triangle'
          ? (2 / Math.PI) * Math.asin(Math.sin(phase))
          : Math.sin(phase);
    // Exponential decay with a 3 ms attack, so nothing clicks on onset.
    const attack = Math.min(1, t / 0.003);
    buffer[index] += raw * gain * attack * Math.exp(-decay * progress);
  }
}

/**
 * Adds decaying filtered noise — the body of a thud.
 * @param {Float32Array} buffer
 * @param {{ ms: number, atMs?: number, gain?: number, decay?: number, smoothing?: number, seed?: number }} options
 * @returns {void}
 */
function noise(buffer, { ms, atMs = 0, gain = 1, decay = 4, smoothing = 0, seed = 1 }) {
  const start = seconds(atMs);
  const length = seconds(ms);
  const next = createNoise(seed);
  let previous = 0;
  for (let i = 0; i < length; i += 1) {
    const index = start + i;
    if (index >= buffer.length) break;
    const raw = next();
    // A one-pole low-pass: `smoothing` toward 1 is progressively duller.
    previous = smoothing > 0 ? previous * smoothing + raw * (1 - smoothing) : raw;
    const progress = i / length;
    buffer[index] += previous * gain * Math.exp(-decay * progress);
  }
}

/** The catalogue, as waveforms. Keys MUST match `src/renderer/app/sounds.ts`. */
const RECIPES = {
  // A bright two-note pluck: the loop's most frequent sound, so it is short
  // and sits low in the mix rather than announcing itself.
  harvest: () => {
    const buffer = new Float32Array(seconds(180));
    tone(buffer, { freq: 660, ms: 90, gain: 0.5, decay: 6, wave: 'triangle' });
    tone(buffer, { freq: 990, ms: 110, atMs: 55, gain: 0.35, decay: 7, wave: 'triangle' });
    return buffer;
  },
  // A soft body-thud — something heavy set down, not dropped.
  deposit: () => {
    const buffer = new Float32Array(seconds(160));
    tone(buffer, { freq: 180, ms: 140, gain: 0.55, decay: 9 });
    noise(buffer, { ms: 60, gain: 0.18, decay: 14, smoothing: 0.86, seed: 7 });
    return buffer;
  },
  // Two ascending tones. The one place the mix is allowed to feel like reward.
  coin: () => {
    const buffer = new Float32Array(seconds(220));
    tone(buffer, { freq: 988, ms: 80, gain: 0.4, decay: 5, wave: 'triangle' });
    tone(buffer, { freq: 1319, ms: 150, atMs: 70, gain: 0.4, decay: 5, wave: 'triangle' });
    return buffer;
  },
  // A wooden set-down: low thunk plus a short tap.
  placement: () => {
    const buffer = new Float32Array(seconds(200));
    tone(buffer, { freq: 140, ms: 170, gain: 0.5, decay: 8 });
    tone(buffer, { freq: 420, ms: 70, atMs: 10, gain: 0.25, decay: 12, wave: 'triangle' });
    noise(buffer, { ms: 50, gain: 0.2, decay: 18, smoothing: 0.8, seed: 11 });
    return buffer;
  },
  // A soft confirming blip — selection happens constantly, so it stays tiny.
  selection: () => {
    const buffer = new Float32Array(seconds(90));
    tone(buffer, { freq: 740, ms: 80, gain: 0.35, decay: 11, wave: 'triangle' });
    return buffer;
  },
  // The quietest thing in the game. A UI click should be felt, not heard.
  'ui-click': () => {
    const buffer = new Float32Array(seconds(60));
    tone(buffer, { freq: 520, ms: 45, gain: 0.3, decay: 18, wave: 'triangle' });
    return buffer;
  },
  // A gentle rise. Never urgent — nothing routine is ever alarming.
  notification: () => {
    const buffer = new Float32Array(seconds(320));
    tone(buffer, { freq: 587, ms: 140, gain: 0.32, decay: 4, wave: 'sine' });
    tone(buffer, { freq: 784, ms: 200, atMs: 120, gain: 0.32, decay: 4, wave: 'sine' });
    return buffer;
  },
  // Low, short, downward. Distinct from everything else without being a klaxon.
  error: () => {
    const buffer = new Float32Array(seconds(260));
    tone(buffer, { freq: 320, ms: 240, gain: 0.35, decay: 5, wave: 'square', bend: -0.35 });
    return buffer;
  },
};

// ---------------------------------------------------------------------------
// WAV encoding — 16-bit PCM, mono, 44.1 kHz (ASSETS.md §3)
// ---------------------------------------------------------------------------

/**
 * 16-bit PCM mono WAV. `Uint8Array` + `DataView` rather than `Buffer`, so the
 * script depends on nothing Node-specific beyond `fs`.
 * @param {Float32Array} samples
 * @returns {Uint8Array}
 */
function toWav(samples) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  // Normalize to -3 dBFS so the per-sound mix in `sounds.ts` is the only thing
  // deciding relative loudness. Clipping here would bake a mix into the asset.
  const scale = peak > 0 ? 0.708 / peak : 0;

  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);

  /**
   * @param {number} offset
   * @param {string} text
   * @returns {void}
   */
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, (samples[i] ?? 0) * scale));
    view.setInt16(44 + i * 2, Math.round(value * 32_767), true);
  }

  return bytes;
}

// ---------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const authored = existsSync(SRC)
  ? new Set(readdirSync(SRC).filter((name) => name.endsWith('.wav')))
  : new Set();

let copied = 0;
for (const [name, recipe] of Object.entries(RECIPES)) {
  const file = `${name}.wav`;
  const target = join(OUT, file);

  if (authored.has(file)) {
    // A real asset exists. It wins, and this script becomes a copier for it.
    copyFileSync(join(SRC, file), target);
    copied += 1;
    continue;
  }

  writeFileSync(target, toWav(recipe()));
}

const total = Object.keys(RECIPES).length;
globalThis.console.log(
  `audio: ${String(total)} sounds (${String(copied)} authored, ${String(total - copied)} placeholder)`,
);
