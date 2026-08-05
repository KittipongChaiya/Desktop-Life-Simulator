/**
 * Performance panel (F7). Phase-07.8h, ADR-018 §8.
 *
 * THE ADR NAMES THIS PANEL AS THE TRAP: "a 60-second history that repaints at
 * 60 Hz while nothing changes is a debug tool that makes the thing it measures
 * worse, and its own readings untrustworthy." Three things answer that:
 *
 * 1. **Closed costs nothing.** No interval is scheduled while hidden, so not a
 *    single accessor is read — the same structural guarantee the overlay has.
 * 2. **It samples at 2 Hz, not per frame.** A graph of sixty seconds needs 120
 *    points, and a point every 500 ms is what that means. It takes no animation
 *    lease (ADR-017 §1) and never asks for a frame, so an open panel cannot
 *    hold the render loop awake and cannot inflate the FPS it is plotting.
 * 3. **A uniform window stops repainting.** The committed series is compared
 *    element-wise, and once the whole window holds one value every further
 *    sample rebuilds the series that is already on screen — so an idle farm
 *    settles into complete stillness rather than redrawing a flat line forever.
 *
 * That third property falls out of comparing rather than being special-cased,
 * which is why it is a comparison and not an `isIdle` flag.
 */

import { useEffect, useState, type ReactNode } from 'react';

import type { SimulationControl } from '../../shared/simulation-control';
import { heapMegabytes } from '../perf/heap';
import {
  PERF_CAPACITY,
  PERF_SAMPLE_MS,
  PERF_WINDOW_MS,
  pushSample,
  seriesPath,
} from '../perf/series';

import { PanelFrame } from './PanelFrame';
import styles from './PerformancePanel.module.css';

const GRAPH_WIDTH = 260;
const GRAPH_HEIGHT = 32;

interface Series {
  readonly fps: readonly number[];
  readonly frame: readonly number[];
  readonly heap: readonly number[];
}

const EMPTY: Series = { fps: [], frame: [], heap: [] };

function sameValues(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameSeries(a: Series, b: Series): boolean {
  return sameValues(a.fps, b.fps) && sameValues(a.frame, b.frame) && sameValues(a.heap, b.heap);
}

/** Where it opens the first time. Moved and remembered thereafter (07.8n). */
const INITIAL = { x: 910, y: 8, width: 310, height: 200 };

export interface PerformancePanelProps {
  readonly visible: boolean;
  readonly simulation: SimulationControl;
  readonly onClose?: () => void;
}

export function PerformancePanel({
  visible,
  simulation,
  onClose,
}: PerformancePanelProps): ReactNode {
  const [series, setSeries] = useState<Series>(EMPTY);

  useEffect(() => {
    if (!visible) return;

    const sample = (): void => {
      setSeries((previous) => {
        const heap = heapMegabytes();
        const next: Series = {
          fps: pushSample(previous.fps, simulation.fps(), PERF_CAPACITY),
          frame: pushSample(previous.frame, simulation.frameTimeMs(), PERF_CAPACITY),
          // A runtime with no heap reading contributes no points at all,
          // rather than a line of zeroes that would read as a freed heap.
          heap: heap === null ? previous.heap : pushSample(previous.heap, heap, PERF_CAPACITY),
        };
        return sameSeries(previous, next) ? previous : next;
      });
    };

    sample();
    const handle = setInterval(sample, PERF_SAMPLE_MS);
    return () => {
      clearInterval(handle);
    };
  }, [visible, simulation]);

  return (
    <PanelFrame
      id="perf"
      title="Performance"
      visible={visible}
      initial={INITIAL}
      status={`last ${String(PERF_WINDOW_MS / 1000)}s`}
      {...(onClose === undefined ? {} : { onClose })}
    >
      <div className={styles['panel']} data-testid="performance-panel">
        <Graph id="fps" label="FPS" values={series.fps} format={(v) => v.toFixed(0)} />
        <Graph
          id="frame"
          label="Frame"
          values={series.frame}
          format={(v) => `${v.toFixed(1)} ms`}
        />
        {series.heap.length > 0 && (
          <Graph id="heap" label="Heap" values={series.heap} format={(v) => `${v.toFixed(1)} MB`} />
        )}
      </div>
    </PanelFrame>
  );
}

interface GraphProps {
  readonly id: string;
  readonly label: string;
  readonly values: readonly number[];
  readonly format: (value: number) => string;
}

function Graph({ id, label, values, format }: GraphProps): ReactNode {
  const latest = values.at(-1);

  return (
    <div className={styles['graph']}>
      <div className={styles['row']}>
        <span className={styles['label']}>{label}</span>
        {/* The current value beside the shape: a trend with no scale beside it
            tells you something changed and not what it changed to. */}
        <span className={styles['value']}>{latest === undefined ? '—' : format(latest)}</span>
      </div>
      <svg
        className={styles['plot']}
        viewBox={`0 0 ${String(GRAPH_WIDTH)} ${String(GRAPH_HEIGHT)}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          data-testid={`graph-${id}`}
          points={seriesPath(values, GRAPH_WIDTH, GRAPH_HEIGHT)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
