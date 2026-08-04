/**
 * Mounts developer tooling, if this build has any.
 *
 * Lives in `bootstrap` rather than the renderer entry so the devtools import
 * sits inside a boundary-linted layer. `src/renderer/main.tsx` matches no
 * element pattern and is therefore unconstrained — a gap found by the
 * phase-01.6 architecture review — so entry-point code is kept to a minimum
 * and everything real happens here, where the rules apply.
 *
 * The dynamic import is deliberate and must stay INSIDE the `FEATURE_DEBUG`
 * branch: Vite replaces that flag with a literal, so a production build
 * evaluates `if (false)` and Rollup drops the devtools chunks entirely
 * (src/devtools/flags.ts).
 */

import { FEATURE_DEBUG } from '@devtools/flags';
import type { DurationHistogram } from '@devtools/metrics/histogram';
import { MetricGroup } from '@devtools/metrics/registry';
import type { WorldView } from '@render/world-view';

import type { SimulationControl } from '../../shared/simulation-control';
import type { Command, CommandResult } from '../../sim/commands/types';

export interface DevToolsMountOptions {
  readonly simulation: SimulationControl;
  readonly appVersion: string;
  readonly reload: () => void;
  /** The live world view, or null while collapsed. */
  readonly world?: () => WorldView | null;
  /** Last mount failure, if any. Surfaced so a GPU failure is diagnosable. */
  readonly worldError?: () => string | null;
  /**
   * Last command rejected at EXECUTION, if any. Phase-03.6.
   *
   * These are rejections the player never sees: the command passed validation
   * at dispatch and failed a tick later because the world moved. Until the HUD
   * lands in phase-05 this is where they surface, so they are recorded rather
   * than discarded (`AI_RULES.md` §2.2).
   */
  readonly commandRejection?: () => string | null;
  /**
   * The load/save session log (phase-07c): how the world arrived (new game /
   * loaded / from backup, migrations, repairs) and the last save failure.
   * The player-facing surfaces arrive in 07e; this keeps the record visible
   * rather than discarded meanwhile (`AI_RULES.md` §2.2).
   */
  readonly saveNote?: () => string | null;
  /**
   * Submits a sim command through the ordinary player source (06c). Enables
   * console commands that act on the world — `money`, the declared dev-only
   * coin source — with no privileged write path (ADR-010 §6).
   */
  readonly submitCommand?: (command: Command) => CommandResult;
  /**
   * Tick durations, when the build is profiling (07.7M1).
   *
   * Supplied only behind `FEATURE_PROFILER`, so a release build has neither
   * the histogram nor the clock reads that feed it.
   */
  readonly tickHistogram?: DurationHistogram;
  /**
   * Read-only world counts for the overlay (07.8a, ADR-018 §9).
   *
   * A bag of PULL accessors, not a reference to anything: the registry calls
   * each when a panel asks, and none of them caches, mutates, or hands back
   * something a panel could write through. Passed explicitly rather than read
   * from a global, which is ADR-018 §5.
   */
  readonly worldCounts?: WorldCounts;
}

/** The read-only counts the debug overlay displays (07.8a). */
export interface WorldCounts {
  /** Sprites the world view currently has parented. */
  readonly visibleSprites: () => number;
  readonly workers: () => number;
  readonly crops: () => number;
  readonly buildings: () => number;
  /** Addressable item containers — player, worker holds, storage buildings. */
  readonly containers: () => number;
  /** Events published this tick and not yet flushed. */
  readonly eventQueue: () => number;
  /** Commands queued for the next tick's drain. */
  readonly commandQueue: () => number;
}

/** Resolves once tooling is mounted, or immediately when the build has none. */
export async function mountDevTools(options: DevToolsMountOptions): Promise<void> {
  if (!FEATURE_DEBUG) return;

  const [{ createDevTools }, { DevTools }, { createRoot }, react, consoleRegistry] =
    await Promise.all([
      import('@devtools/host'),
      import('@devtools/ui/DevTools'),
      import('react-dom/client'),
      import('react'),
      import('@devtools/console/registry'),
    ]);

  const host = createDevTools(options);

  // The `money` console command the phase-01.5 builtins reserved — registered
  // by its owning phase (06c) through the same public API, exactly as the
  // builtins module prescribes. Dev-only by construction: this whole function
  // is behind FEATURE_DEBUG.
  const submitCommand = options.submitCommand;
  if (submitCommand !== undefined) {
    host.commands.register({
      name: 'money',
      summary: 'Grant coins (dev-only source, ADR-013).',
      usage: 'money <amount>',
      run: ({ args }) => {
        const [raw] = args;
        const amount = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
        if (!Number.isSafeInteger(amount) || amount < 1) {
          return consoleRegistry.resultOf(
            `Expected a positive integer amount, got "${raw ?? ''}"`,
            consoleRegistry.OutputKind.Error,
          );
        }
        const result = submitCommand({ type: 'grantCoins', amount });
        return result.ok
          ? consoleRegistry.resultOf(`granted ${amount.toLocaleString()} coins`)
          : consoleRegistry.resultOf(result.error.message, consoleRegistry.OutputKind.Error);
      },
    });
  }

  // TICK TIMING (07.7M1). The budget in `PERFORMANCE.md` is stated as a p99,
  // and until this the loop only reported a rolling average — which hides
  // precisely the tail a p99 exists to expose.
  const histogram = options.tickHistogram;
  if (histogram !== undefined) {
    const ms = (value: number): string => `${value.toFixed(3)} ms`;

    for (const [id, label, order, read] of [
      ['sim.tickP50', 'Tick p50', 20, () => ms(histogram.percentile(50))],
      ['sim.tickP95', 'Tick p95', 21, () => ms(histogram.percentile(95))],
      ['sim.tickP99', 'Tick p99', 22, () => ms(histogram.percentile(99))],
      ['sim.tickAvg', 'Tick avg', 23, () => ms(histogram.average())],
      ['sim.tickMax', 'Tick max', 24, () => ms(histogram.max())],
      ['sim.tickSamples', 'Tick samples', 25, () => String(histogram.total())],
    ] as const) {
      host.metrics.register({ id, label, group: MetricGroup.Simulation, order, read });
    }
  }

  // WORLD COUNTS (07.8a). Every one is a pull, and every one that can be read
  // from a SNAPSHOT is — so the overlay sees exactly what the renderer sees and
  // cannot observe a half-stepped world mid-tick (ADR-005 §2).
  const counts = options.worldCounts;
  if (counts !== undefined) {
    for (const [id, label, group, order, read] of [
      ['world.workers', 'Workers', MetricGroup.World, 1, counts.workers],
      ['world.crops', 'Crops', MetricGroup.World, 2, counts.crops],
      ['world.buildings', 'Buildings', MetricGroup.World, 3, counts.buildings],
      ['world.containers', 'Containers', MetricGroup.World, 4, counts.containers],
      ['sim.eventQueue', 'Event queue', MetricGroup.Simulation, 30, counts.eventQueue],
      ['sim.commandQueue', 'Command queue', MetricGroup.Simulation, 31, counts.commandQueue],
      ['render.sprites', 'Visible sprites', MetricGroup.Render, 12, counts.visibleSprites],
    ] as const) {
      host.metrics.register({ id, label, group, order, read: () => String(read()) });
    }
  }

  // HEAP (07.7M1). Chromium-only and deliberately unguarded elsewhere: this is
  // devtools, and a missing `memory` field reports as unavailable rather than
  // pretending to a number.
  host.metrics.register({
    id: 'render.heap',
    label: 'Heap',
    group: MetricGroup.Render,
    order: 30,
    read: () => {
      const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      if (memory === undefined) return 'unavailable';
      return `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`;
    },
  });

  const commandRejection = options.commandRejection;
  if (commandRejection !== undefined) {
    host.metrics.register({
      id: 'sim.lastCommandRejection',
      label: 'Last Rejection',
      group: MetricGroup.Simulation,
      order: 10,
      read: () => commandRejection() ?? 'none',
    });
  }

  const saveNote = options.saveNote;
  if (saveNote !== undefined) {
    host.metrics.register({
      id: 'sim.saveNote',
      label: 'Save/Load',
      group: MetricGroup.Simulation,
      order: 11,
      read: () => saveNote() ?? 'none',
    });
  }

  // PHASE-02 METRICS. Registered here in `bootstrap`, not in devtools: the
  // metrics read the render layer, and `devtools` may not import `render`
  // (CODE_STYLE.md §8.1). Bootstrap may import both, so the wiring belongs
  // here — which is exactly what the registry was built for (phase-01.5).
  const world = options.world;
  if (world !== undefined) {
    const view = (): WorldView | null => world();

    host.metrics.registerAll([
      {
        id: 'render.backend',
        label: 'Backend',
        group: MetricGroup.Render,
        order: 0,
        read: () => view()?.backend ?? options.worldError?.() ?? 'not mounted',
      },
      {
        id: 'render.camera',
        label: 'Camera',
        group: MetricGroup.Render,
        order: 1,
        read: () => {
          const camera = view()?.camera();
          return camera === undefined
            ? 'Unavailable'
            : `x ${camera.x.toFixed(0)} z ${String(camera.zoom)}`;
        },
      },
      {
        id: 'render.chunkRedraws',
        label: 'Chunk Redraws',
        group: MetricGroup.Render,
        order: 2,
        // Zero on a cached frame. A persistently nonzero value means chunk
        // invalidation is running away.
        read: () => String(view()?.lastChunkRedraws() ?? 0),
      },
      {
        id: 'render.visibleTiles',
        label: 'Visible Tiles',
        group: MetricGroup.Render,
        order: 3,
        read: () => (view()?.visibleTileCount() ?? 0).toLocaleString(),
      },
      {
        id: 'render.dirty',
        label: 'Dirty',
        group: MetricGroup.Render,
        order: 4,
        read: () => {
          const gate = view()?.gate;
          if (gate === undefined) return 'Unavailable';
          return `${gate.isDirty() ? 'yes' : 'no'} · ${String(gate.animationCount())} anim`;
        },
      },
    ]);
  }

  host.logs
    .get('renderer')
    .info('developer tools ready', { keys: 'F1 console · F3 overlay · F4 inspector' });

  // A separate React root: devtools must never re-render the game UI, and the
  // game UI must never be able to unmount devtools.
  const container = document.createElement('div');
  container.id = 'devtools';
  document.body.appendChild(container);

  createRoot(container).render(react.createElement(DevTools, { host }));
}
