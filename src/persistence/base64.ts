/**
 * Base64 for typed arrays. Phase-07a, `SAVE_FORMAT.md` §2.1.
 *
 * Hand-rolled on purpose: `src/persistence` compiles against pure ES2022 with
 * no DOM and no Node (`tsconfig.sim.json`), so `Buffer` and `btoa` do not
 * exist here — and the codec must be deterministic, byte-stable, and exact,
 * which a 40-line implementation proves more directly than an environment
 * shim would. Standard RFC 4648 alphabet with `=` padding.
 *
 * 32-bit words are written EXPLICITLY LITTLE-ENDIAN via `DataView`, so a save
 * document never depends on the writing machine's byte order — the same world
 * produces the same bytes everywhere (`SAVE_FORMAT.md` §3.2).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup: char code → 6-bit value, or -1 for anything else. */
const REVERSE: readonly number[] = (() => {
  const table = new Array<number>(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Encodes bytes as standard base64 with padding. */
export function encodeBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    out += ALPHABET.charAt((triple >> 18) & 63);
    out += ALPHABET.charAt((triple >> 12) & 63);
    out += i + 1 < bytes.length ? ALPHABET.charAt((triple >> 6) & 63) : '=';
    out += i + 2 < bytes.length ? ALPHABET.charAt(triple & 63) : '=';
  }
  return out;
}

/**
 * Decodes standard base64. Throws on malformed input — a corrupt document
 * must fail loudly here so the load pipeline can route it to the `.bak`
 * fallback (ADR-015 §7), never decode garbage silently.
 */
export function decodeBytes(text: string): Uint8Array {
  if (text.length % 4 !== 0) {
    throw new Error(`base64 length ${text.length} is not a multiple of 4`);
  }
  // Padding may only be the final one or two characters.
  const firstPad = text.indexOf('=');
  if (firstPad !== -1 && firstPad < text.length - 2) {
    throw new Error('base64 padding may only terminate the text');
  }

  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let write = 0;

  for (let i = 0; i < text.length; i += 4) {
    const values: number[] = [];
    for (let j = 0; j < 4; j += 1) {
      const char = text.charCodeAt(i + j);
      if (text[i + j] === '=') {
        values.push(0);
        continue;
      }
      const value = REVERSE[char] ?? -1;
      if (value < 0) throw new Error(`invalid base64 character at index ${i + j}`);
      values.push(value);
    }
    const [v0 = 0, v1 = 0, v2 = 0, v3 = 0] = values;
    const triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    if (write < bytes.length) bytes[write++] = (triple >> 16) & 255;
    if (write < bytes.length) bytes[write++] = (triple >> 8) & 255;
    if (write < bytes.length) bytes[write++] = triple & 255;
  }

  return bytes;
}

/** Encodes 32-bit words little-endian, then base64. */
export function encodeUint32(words: Uint32Array): string {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < words.length; i += 1) view.setUint32(i * 4, words[i] ?? 0, true);
  return encodeBytes(bytes);
}

/** Decodes base64 into 32-bit words, little-endian. Throws on partial words. */
export function decodeUint32(text: string): Uint32Array {
  const bytes = decodeBytes(text);
  if (bytes.length % 4 !== 0) {
    throw new Error(`byte length ${bytes.length} is not a whole number of 32-bit words`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const words = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < words.length; i += 1) words[i] = view.getUint32(i * 4, true);
  return words;
}
