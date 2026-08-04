/**
 * JS heap reading. Phase-07.8h.
 *
 * EXTRACTED ON THE THIRD OCCURRENCE, which is the threshold `AI_RULES.md`
 * Rule 5 names. `host.ts` and `devtools-mount.ts` each carried their own copy —
 * and had already drifted, one reporting "Unavailable" and the other
 * "unavailable" for the same condition. The performance panel would have been
 * the third.
 *
 * `performance.memory` is a non-standard Chromium extension, absent in other
 * runtimes and under some flags. Absent reports as NULL rather than zero: a
 * graph plotting 0 MB would read as a heap that had just been freed.
 */

/** The shape this reads, so a test can supply one without touching globals. */
export interface HeapSource {
  readonly memory?: { readonly usedJSHeapSize: number };
}

/**
 * The live reading source.
 *
 * Cast because `memory` is not in the DOM's `Performance` type — it is a
 * Chromium extension, which is exactly why every read of it is optional.
 */
const LIVE = performance as HeapSource;

/** Used JS heap in megabytes, or null where the runtime does not report it. */
export function heapMegabytes(source: HeapSource = LIVE): number | null {
  const used = source.memory?.usedJSHeapSize;
  if (typeof used !== 'number') return null;

  return used / 1024 / 1024;
}

/** The same reading, rendered for a metric row. */
export function heapLabel(source: HeapSource = LIVE): string {
  const megabytes = heapMegabytes(source);
  return megabytes === null ? 'Unavailable' : `${megabytes.toFixed(1)} MB`;
}
