/**
 * Seeded pseudo-random number generator.
 *
 * THE ONLY SOURCE OF RANDOMNESS IN THE SIMULATION. `Math.random()` is banned in
 * `src/sim` and lint-enforced, because determinism — same seed plus same ordered
 * inputs producing byte-identical state — is the property that save round-trips,
 * reproducible bugs, property testing, and any future multiplayer all rest on.
 * AI_RULES.md §2.1, ADR-007.
 *
 * Algorithm: xoshiro128** — four 32-bit state words, fast, and with a state
 * shape that serializes directly into the save document (SAVE_FORMAT.md §2).
 */

/** Serializable generator state: exactly four unsigned 32-bit words. */
export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. Both bounds inclusive. */
  nextInt(min: number, max: number): number;
  /** Captures state for serialization. */
  getState(): RngState;
  /** Restores state, resuming the stream mid-sequence. */
  setState(state: RngState): void;
}

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/**
 * Expands a single seed into four state words.
 *
 * A naive seeding that leaves most state words zero produces badly correlated
 * early output; splitmix32 avoids that.
 */
function seedState(seed: number): RngState {
  let z = seed >>> 0;
  const word = (): number => {
    z = (z + 0x9e3779b9) >>> 0;
    let t = z;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
  // A fully-zero state is a fixed point for xoshiro; force a nonzero word.
  const s: [number, number, number, number] = [word(), word(), word(), word()];
  if ((s[0] | s[1] | s[2] | s[3]) === 0) s[0] = 1;
  return s;
}

export function createRng(seed: number): Rng {
  let [s0, s1, s2, s3] = seedState(seed);

  const nextUint32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;

    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);

    return result;
  };

  return {
    next(): number {
      // 2**-32 — maps the full uint32 range onto [0, 1).
      return nextUint32() * 2.3283064365386963e-10;
    },

    nextInt(min: number, max: number): number {
      if (max < min) throw new Error(`nextInt: max (${max}) is below min (${min})`);
      return min + Math.floor(this.next() * (max - min + 1));
    },

    getState(): RngState {
      return [s0, s1, s2, s3];
    },

    setState(state: RngState): void {
      [s0, s1, s2, s3] = state;
    },
  };
}
