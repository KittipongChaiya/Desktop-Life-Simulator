/**
 * The voice pool. Phase-13a — ADR-023 §4.
 *
 * Web Audio plays a sound by creating a `BufferSourceNode`, which is
 * single-use: it cannot be restarted, so "play a sound" means "allocate a
 * node". On a farm that harvests continuously for eight hours, unbounded
 * allocation is the heap churn ADR-017 §4 forbids for particles, and audio is
 * not exempt for being inaudible.
 *
 * So the number of sounds that can be in flight at once is FIXED, decided here,
 * and enforced by the same rule the particle pool uses: at capacity, the oldest
 * voice is recycled. A burst of thirty harvests plays the most recent voices
 * and drops the stalest, which is also what a mixer would do and what a person
 * would prefer.
 *
 * **This module allocates nothing after construction and knows nothing about
 * Web Audio.** It is arithmetic over slots — which is what lets the interesting
 * part be tested in Node, exactly as `ADR-016 §1` requires of the bus and for
 * the same reason.
 */

/**
 * How many sounds may overlap.
 *
 * Twelve is generous for this game: the bus already coalesces repeats within
 * 250 ms (`SOUND_COALESCE_MS`), so reaching twelve needs a dozen genuinely
 * different sounds inside a quarter second. It is a ceiling, not a target.
 */
export const VOICE_POOL_CAPACITY = 12;

export interface VoiceClaim {
  /** Which slot to use. Always in `[0, capacity)`. */
  readonly slot: number;
  /** True when an older voice was cut short to make room. */
  readonly recycled: boolean;
}

export interface VoicePool {
  readonly capacity: number;
  /**
   * Claims a slot for a sound ending at `endsAtMs`.
   *
   * Always succeeds — there is no failure mode, because refusing to play a
   * sound and stealing an old one are the same thing from the listener's
   * side, and the second is what a mixer does.
   */
  claim(nowMs: number, endsAtMs: number): VoiceClaim;
  /** How many voices are still sounding at `nowMs`. Diagnostics and tests. */
  activeAt(nowMs: number): number;
  /** Frees every slot. For teardown, where a stuck voice would leak a node. */
  clear(): void;
}

export function createVoicePool(capacity: number = VOICE_POOL_CAPACITY): VoicePool {
  const size = Math.max(1, Math.floor(capacity));
  // Pre-allocated and never resized. `0` means free.
  const endsAt = new Float64Array(size);
  const claimedAt = new Float64Array(size);

  return {
    capacity: size,

    claim(nowMs, endsAtMs) {
      // A free slot first — a voice that has finished is not "recycled", and
      // reporting it as such would make the metric meaningless.
      for (let slot = 0; slot < size; slot += 1) {
        if (endsAt[slot] === 0 || (endsAt[slot] ?? 0) <= nowMs) {
          endsAt[slot] = endsAtMs;
          claimedAt[slot] = nowMs;
          return { slot, recycled: false };
        }
      }

      // Full: steal the one claimed longest ago. Oldest by CLAIM time rather
      // than by end time, so a long sound cannot shield itself from recycling
      // by outlasting everything else.
      let oldest = 0;
      for (let slot = 1; slot < size; slot += 1) {
        if ((claimedAt[slot] ?? 0) < (claimedAt[oldest] ?? 0)) oldest = slot;
      }

      endsAt[oldest] = endsAtMs;
      claimedAt[oldest] = nowMs;
      return { slot: oldest, recycled: true };
    },

    activeAt(nowMs) {
      let live = 0;
      for (let slot = 0; slot < size; slot += 1) {
        if ((endsAt[slot] ?? 0) > nowMs) live += 1;
      }
      return live;
    },

    clear() {
      endsAt.fill(0);
      claimedAt.fill(0);
    },
  };
}
