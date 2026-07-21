/**
 * Runtime profiler. Phase-01.5 deliverable 3.
 *
 * Scopes are created on first use, so a new subsystem instruments itself with
 * `profiler.begin('assets')` and appears in the overlay automatically — no edit
 * to this file. That is the "support future expansion without modifying
 * existing profiler code" requirement.
 *
 * Rolling statistics rather than full history: an app running for eight hours
 * would otherwise accumulate millions of samples, and PERFORMANCE.md §5.2 makes
 * unbounded growth a defect. A fixed window keeps memory constant and reports
 * what actually matters — recent p50/p95, not a lifetime mean that hides spikes.
 */

const WINDOW_SIZE = 120;

export interface ScopeStats {
  readonly name: string;
  /** Most recent sample, in milliseconds. */
  readonly last: number;
  readonly mean: number;
  readonly p95: number;
  readonly max: number;
  /** Samples recorded since process start. */
  readonly count: number;
}

export interface Profiler {
  /** Starts timing a scope. Returns the function that ends it. */
  begin(scope: string): () => void;
  /** Times a synchronous function and returns its result. */
  measure<T>(scope: string, fn: () => T): T;
  /** Records an externally-measured duration, in milliseconds. */
  record(scope: string, durationMs: number): void;
  /** Current statistics, sorted by descending mean cost. */
  stats(): readonly ScopeStats[];
  reset(): void;
}

interface Window {
  samples: number[];
  cursor: number;
  filled: boolean;
  count: number;
  max: number;
}

/** A profiler that records nothing. Used when FEATURE_PROFILER is off. */
export function createNullProfiler(): Profiler {
  const noop = (): void => undefined;
  return {
    begin: () => noop,
    measure: (_scope, fn) => fn(),
    record: noop,
    stats: () => [],
    reset: noop,
  };
}

export interface ProfilerOptions {
  /** Injected clock, so tests do not depend on wall time. */
  readonly now?: () => number;
}

export function createProfiler(options: ProfilerOptions = {}): Profiler {
  const now = options.now ?? ((): number => performance.now());
  const windows = new Map<string, Window>();

  const windowFor = (scope: string): Window => {
    let window = windows.get(scope);
    if (window === undefined) {
      window = {
        samples: new Array<number>(WINDOW_SIZE).fill(0),
        cursor: 0,
        filled: false,
        count: 0,
        max: 0,
      };
      windows.set(scope, window);
    }
    return window;
  };

  const record = (scope: string, durationMs: number): void => {
    const window = windowFor(scope);
    window.samples[window.cursor] = durationMs;
    window.cursor = (window.cursor + 1) % WINDOW_SIZE;
    if (window.cursor === 0) window.filled = true;
    window.count += 1;
    if (durationMs > window.max) window.max = durationMs;
  };

  return {
    begin(scope) {
      const start = now();
      return () => {
        record(scope, now() - start);
      };
    },

    measure(scope, fn) {
      const start = now();
      try {
        return fn();
      } finally {
        record(scope, now() - start);
      }
    },

    record,

    stats() {
      const result: ScopeStats[] = [];

      for (const [name, window] of windows) {
        const size = window.filled ? WINDOW_SIZE : window.cursor;
        if (size === 0) continue;

        const live = window.samples.slice(0, size);
        const sorted = [...live].sort((a, b) => a - b);
        const sum = live.reduce((total, value) => total + value, 0);
        const lastIndex = (window.cursor - 1 + WINDOW_SIZE) % WINDOW_SIZE;

        result.push({
          name,
          last: window.samples[lastIndex] ?? 0,
          mean: sum / size,
          p95: sorted[Math.min(size - 1, Math.floor(size * 0.95))] ?? 0,
          max: window.max,
          count: window.count,
        });
      }

      return result.sort((a, b) => b.mean - a.mean);
    },

    reset() {
      windows.clear();
    },
  };
}
