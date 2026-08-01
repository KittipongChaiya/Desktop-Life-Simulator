/**
 * Duration histogram. Phase-07.7M1.
 *
 * The tick budget in `PERFORMANCE.md` is stated as a **p99**, and until now
 * nothing in this project could measure one: the loop reported a rolling
 * ticks-per-second, which is an average and hides exactly the tail a p99
 * exists to expose. A phase cannot claim "p99 tick unchanged" without this.
 *
 * A RING OF THE LAST N SAMPLES, not buckets. Bucketed counts are the usual
 * choice and are cheaper to summarise, but they answer with a bucket edge
 * rather than a measurement — and this is being used to decide whether a
 * budget was met, where "somewhere between 2.5 and 3 ms" is not an answer.
 * The ring is exact for the window it covers.
 *
 * RECORDING ALLOCATES NOTHING. One float write and an index bump, into a
 * pre-allocated `Float64Array`. Reading sorts a copy, which is O(n log n) and
 * allocates — but reads happen when a developer opens a panel, and writes
 * happen twenty times a second forever, so that is the right way round.
 *
 * DISABLED IN PRODUCTION by construction: nothing constructs one unless
 * `FEATURE_PROFILER` is set, and that flag is a compile-time literal, so
 * Rollup drops this module and its call sites entirely from a release build.
 */

/** Samples retained. 4,096 ticks is roughly 3.4 minutes at 20 Hz. */
export const HISTOGRAM_CAPACITY = 4096;

export interface DurationHistogram {
  /** Records one duration in milliseconds. Allocation-free. */
  record(ms: number): void;
  /**
   * The value at a percentile, 0–100, over the retained window.
   *
   * Nearest-rank: `percentile(99)` is the smallest sample that at least 99% of
   * samples are at or below. Returns 0 when nothing has been recorded — an
   * empty histogram has no tail, and inventing one would be worse than zero.
   */
  percentile(p: number): number;
  average(): number;
  max(): number;
  /** Samples in the retained window, capped at the capacity. */
  count(): number;
  /** Total ever recorded, including samples the ring has since overwritten. */
  total(): number;
  reset(): void;
}

export function createDurationHistogram(capacity: number = HISTOGRAM_CAPACITY): DurationHistogram {
  const size = Math.max(1, Math.floor(capacity));
  const samples = new Float64Array(size);
  /** Scratch for reads, so summarising does not allocate either after the first. */
  const sorted = new Float64Array(size);

  let cursor = 0;
  let filled = 0;
  let recorded = 0;
  let sum = 0;
  let peak = 0;

  /** Copies the live window into `sorted`, ascending. Returns its length. */
  const snapshot = (): number => {
    sorted.set(samples.subarray(0, filled));
    // `subarray` is a view, so this sorts only the live prefix in place.
    sorted.subarray(0, filled).sort();
    return filled;
  };

  return {
    record(ms) {
      // A negative or non-finite duration means a clock adjustment, not a
      // slow tick; recording it would poison every percentile after it.
      if (!Number.isFinite(ms) || ms < 0) return;

      samples[cursor] = ms;
      cursor = (cursor + 1) % size;
      if (filled < size) filled += 1;
      recorded += 1;
      sum += ms;
      if (ms > peak) peak = ms;
    },

    percentile(p) {
      const length = snapshot();
      if (length === 0) return 0;

      const clamped = Math.min(100, Math.max(0, p));
      // Nearest-rank, 1-indexed then converted: p100 lands on the last sample
      // rather than one past the end.
      const rank = Math.ceil((clamped / 100) * length);
      return sorted[Math.min(length - 1, Math.max(0, rank - 1))] ?? 0;
    },

    // Averaged over EVERYTHING recorded, not just the retained window: a mean
    // that silently changed its own denominator would be unreadable.
    average: () => (recorded === 0 ? 0 : sum / recorded),
    max: () => peak,
    count: () => filled,
    total: () => recorded,

    reset() {
      samples.fill(0);
      cursor = 0;
      filled = 0;
      recorded = 0;
      sum = 0;
      peak = 0;
    },
  };
}
