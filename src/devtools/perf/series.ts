/**
 * Performance series — the window, and the maths that plots it. Phase-07.8h.
 *
 * Pure functions over plain numbers. The panel owns the samples; this owns the
 * arithmetic, because scaling and the flat-series case are exactly where a
 * graph goes silently wrong — an idle farm reports the same value forever, and
 * `(value - min) / (max - min)` is a divide by zero on every point of it.
 *
 * NOT a fourth ring. `events/ring.ts` and `commands/ring.ts` share notifying,
 * freezing and an observed count; a numeric window needs none of those, so
 * extracting a common buffer here would abstract over three lines of slicing.
 */

/** One point every 500 ms — a graph of sixty seconds needs 120 of them. */
export const PERF_SAMPLE_MS = 500;

/** The history §8 asks for. */
export const PERF_WINDOW_MS = 60_000;

/** Samples held to cover the window. */
export const PERF_CAPACITY = PERF_WINDOW_MS / PERF_SAMPLE_MS;

/** One sample appended to a window, oldest dropped once it is full. */
export function pushSample(
  series: readonly number[],
  value: number,
  capacity: number,
): readonly number[] {
  const next = [...series, value];
  return next.length > capacity ? next.slice(next.length - capacity) : next;
}

export interface SeriesRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Bounds to scale a graph against.
 *
 * A flat series is given a span of 1 rather than 0. That is the idle case, not
 * an edge case: a farm nobody is watching reports 0 fps for as long as it is
 * left alone, and every point of that series would otherwise be NaN.
 *
 * The span is added SYMMETRICALLY, so a flat series draws through the middle of
 * the box. Widening only upwards would pin it to the floor, and a steady 60 fps
 * drawn along the bottom of its graph reads as a stall.
 */
export function seriesRange(series: readonly number[]): SeriesRange {
  if (series.length === 0) return { min: 0, max: 1 };

  const min = Math.min(...series);
  const max = Math.max(...series);
  return max === min ? { min: min - 0.5, max: max + 0.5 } : { min, max };
}

/**
 * SVG polyline points for a series drawn into a `width` × `height` box.
 *
 * Oldest at the left, newest at the right, and larger values higher — so the
 * y axis is inverted against the SVG coordinate system, which is the one thing
 * a reader of the graph would notice immediately if it were wrong.
 */
export function seriesPath(series: readonly number[], width: number, height: number): string {
  if (series.length === 0) return '';

  const { min, max } = seriesRange(series);
  const span = max - min;
  const step = series.length === 1 ? 0 : width / (series.length - 1);

  return series
    .map((value, index) => {
      // A single sample sits at the right edge, where the newest always is.
      const x = series.length === 1 ? width : index * step;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
