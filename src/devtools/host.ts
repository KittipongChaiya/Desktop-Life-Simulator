/**
 * Devtools host — the single object the renderer bootstrap creates.
 *
 * Everything devtools offers hangs off this. It is created ONLY behind
 * `FEATURE_DEBUG`, so a production build never constructs it and Rollup drops
 * the entire subtree (flags.ts).
 *
 * Game systems must never import this, or anything else under `src/devtools`
 * (deliverable 8). That direction is enforced by the boundary linter, not by
 * convention.
 */

import type { SimulationControl } from '../shared/simulation-control';

import {
  createCommandRing,
  DEFAULT_COMMAND_RING_CAPACITY,
  type CommandRing,
} from './commands/ring';
import { createBuiltinCommands } from './console/builtins';
import { createConsoleEngine, type ConsoleEngine } from './console/engine';
import { createCommandRegistry, type CommandRegistry } from './console/registry';
import { createEventRing, type EventRing } from './events/ring';
import { FEATURE_CONSOLE, FEATURE_INSPECTOR, FEATURE_PROFILER } from './flags';
import { createInspectorRegistry, type InspectorRegistry } from './inspector/registry';
import { createConsoleSink } from './logger/console-sink';
import { createLogManager, LogLevel, type LogManager } from './logger/logger';
import { createMetricRegistry, MetricGroup, type MetricRegistry } from './metrics/registry';
import { heapLabel } from './perf/heap';
import { createNullProfiler, createProfiler, type Profiler } from './profiler/profiler';

export interface DevToolsHost {
  readonly logs: LogManager;
  readonly profiler: Profiler;
  readonly metrics: MetricRegistry;
  readonly commands: CommandRegistry;
  readonly console: ConsoleEngine;
  readonly inspector: InspectorRegistry;
  /** What the event monitor has observed (07.8e). Written by a subscriber only. */
  readonly events: EventRing;
  /**
   * What the command monitor has observed (07.8f).
   *
   * Named `commandLog`, not `commands`, because `commands` is already the
   * console's command registry — two unrelated meanings of the word, and the
   * one that would be silently wrong is this one.
   */
  readonly commandLog: CommandRing;
  readonly simulation: SimulationControl;
}

/**
 * How many observations the event monitor keeps.
 *
 * Enough to hold the run-up to whatever you noticed — a harvest cycle is a
 * handful of events — and small enough that the ring's ceiling is measured in
 * kilobytes, given each summary is itself capped.
 */
const EVENT_RING_CAPACITY = 200;

export interface DevToolsOptions {
  readonly simulation: SimulationControl;
  /**
   * The command ring the composition root already wired (07.8f).
   *
   * Supplied rather than created here because the observation has to be in
   * place before the first command can be submitted, which is long before
   * devtools mount. One is created when absent so a test needs no wiring.
   */
  readonly commandLog?: CommandRing;
  readonly appVersion: string;
  readonly reload: () => void;
  readonly logLevel?: LogLevel;
}

export function createDevTools(options: DevToolsOptions): DevToolsHost {
  const logs = createLogManager({ level: options.logLevel ?? LogLevel.Debug });
  logs.addSink(createConsoleSink());

  const profiler = FEATURE_PROFILER ? createProfiler() : createNullProfiler();
  const metrics = createMetricRegistry();
  const commands = createCommandRegistry();
  const consoleEngine = createConsoleEngine(commands);
  const inspector = createInspectorRegistry();
  const events = createEventRing(EVENT_RING_CAPACITY);
  const commandLog = options.commandLog ?? createCommandRing(DEFAULT_COMMAND_RING_CAPACITY);

  if (FEATURE_CONSOLE) {
    commands.registerAll(
      createBuiltinCommands({
        registry: commands,
        metrics,
        profiler,
        logs,
        simulation: options.simulation,
        appVersion: options.appVersion,
        reload: options.reload,
      }),
    );
  }

  // Baseline metrics. Everything here reads from systems that exist TODAY.
  // Phase-02 registers camera, chunks, visible tiles, and dirty regions;
  // phase-04 registers entity counts — through this same API.
  metrics.registerAll([
    {
      id: 'perf.fps',
      label: 'FPS',
      group: MetricGroup.Performance,
      order: 0,
      read: () => options.simulation.fps().toFixed(1),
    },
    {
      id: 'perf.frameTime',
      label: 'Frame Time',
      group: MetricGroup.Performance,
      order: 1,
      read: () => `${options.simulation.frameTimeMs().toFixed(2)} ms`,
    },
    {
      id: 'perf.memory',
      label: 'Memory',
      group: MetricGroup.Performance,
      order: 2,
      read: () => heapLabel(),
    },
    {
      id: 'sim.tick',
      label: 'Tick',
      group: MetricGroup.Simulation,
      order: 0,
      read: () => options.simulation.tick().toLocaleString(),
    },
    {
      id: 'sim.ups',
      label: 'UPS',
      group: MetricGroup.Simulation,
      order: 1,
      read: () => options.simulation.ups().toFixed(1),
    },
    {
      id: 'sim.state',
      label: 'State',
      group: MetricGroup.Simulation,
      order: 2,
      read: () => (options.simulation.isPaused() ? 'paused' : 'running'),
    },
  ]);

  if (FEATURE_INSPECTOR) {
    inspector.register({
      id: 'runtime',
      order: 100,
      inspect: () => ({
        title: 'Runtime',
        fields: [
          { label: 'Tick', value: options.simulation.tick().toLocaleString() },
          { label: 'Paused', value: String(options.simulation.isPaused()) },
          { label: 'FPS', value: options.simulation.fps().toFixed(1) },
        ],
      }),
    });
  }

  return {
    logs,
    profiler,
    metrics,
    commands,
    console: consoleEngine,
    inspector,
    events,
    commandLog,
    simulation: options.simulation,
  };
}
