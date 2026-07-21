/**
 * Built-in console commands.
 *
 * EVERY command here does real work. Commands from 1.5.md that need systems
 * which do not exist yet — `spawn`, `teleport`, `money` — are deliberately
 * absent rather than stubbed: their owning phase registers them through the
 * same public API this module uses, with no change to the console
 * (AI_RULES.md §1.6).
 */

import { TICKS_PER_SECOND } from '../../shared/constants';
import type { SimulationControl } from '../../shared/simulation-control';
import { ticksToSeconds } from '../../sim/time/game-clock';
import { flagSnapshot } from '../flags';
import { levelName, LOG_LEVEL_NAMES, type LogManager } from '../logger/logger';
import type { MetricRegistry } from '../metrics/registry';
import type { Profiler } from '../profiler/profiler';

import {
  EMPTY_RESULT,
  linesOf,
  OutputKind,
  resultOf,
  type CommandDefinition,
  type CommandRegistry,
} from './registry';

export interface BuiltinDependencies {
  readonly registry: CommandRegistry;
  readonly metrics: MetricRegistry;
  readonly profiler: Profiler;
  readonly logs: LogManager;
  readonly simulation: SimulationControl;
  readonly appVersion: string;
  /** Injected so the module never reaches for a global. */
  readonly reload: () => void;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function createBuiltinCommands(deps: BuiltinDependencies): readonly CommandDefinition[] {
  const { registry, metrics, profiler, logs, simulation, appVersion, reload } = deps;

  return [
    {
      name: 'help',
      summary: 'List available commands, or show detail for one.',
      usage: 'help [command]',
      aliases: ['?'],
      run: ({ args }) => {
        const [target] = args;

        if (target !== undefined) {
          const command = registry.get(target);
          if (command === undefined)
            return resultOf(`No such command: ${target}`, OutputKind.Error);

          const detail = [
            `${command.name} — ${command.summary}`,
            `usage: ${command.usage ?? command.name}`,
          ];
          if (command.aliases !== undefined && command.aliases.length > 0) {
            detail.push(`aliases: ${command.aliases.join(', ')}`);
          }
          return linesOf(detail, OutputKind.Info);
        }

        const all = registry.all();
        const width = all.reduce((max, c) => Math.max(max, c.name.length), 0);
        return linesOf(
          [
            `${String(all.length)} commands available:`,
            ...all.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
          ],
          OutputKind.Info,
        );
      },
    },

    {
      name: 'clear',
      summary: 'Clear the console output.',
      aliases: ['cls'],
      // Takes the whole context rather than destructuring `clear`: pulling a
      // method off an object detaches it from its receiver, which the linter
      // flags and which would break if the context ever became a class.
      run: (context) => {
        context.clear();
        return EMPTY_RESULT;
      },
    },

    {
      name: 'version',
      summary: 'Show build version and active feature flags.',
      run: () => {
        const flags = flagSnapshot();
        return linesOf(
          [
            `Desktop Life Simulator ${appVersion}`,
            ...Object.entries(flags).map(([key, value]) => `  ${key}: ${String(value)}`),
          ],
          OutputKind.Info,
        );
      },
    },

    {
      name: 'fps',
      summary: 'Show current frame rate and frame time.',
      run: () =>
        linesOf([
          `fps        ${simulation.fps().toFixed(1)}`,
          `frame time ${simulation.frameTimeMs().toFixed(2)} ms`,
          `ups        ${simulation.ups().toFixed(1)}`,
        ]),
    },

    {
      name: 'tick',
      summary: 'Show the simulation tick, or advance by N ticks.',
      usage: 'tick [count]',
      run: ({ args }) => {
        const [raw] = args;
        if (raw === undefined) {
          return resultOf(`tick ${simulation.tick().toLocaleString()}`);
        }

        const count = Number.parseInt(raw, 10);
        if (!Number.isInteger(count) || count < 1) {
          return resultOf(`Expected a positive integer, got "${raw}"`, OutputKind.Error);
        }

        simulation.step(count);
        return resultOf(
          `advanced ${count.toLocaleString()} tick(s) → ${simulation.tick().toLocaleString()}`,
        );
      },
    },

    {
      name: 'pause',
      summary: 'Pause the simulation (development only).',
      run: () => {
        if (simulation.isPaused()) return resultOf('already paused', OutputKind.Info);
        simulation.pause();
        return resultOf('simulation paused');
      },
    },

    {
      name: 'resume',
      summary: 'Resume the simulation.',
      run: () => {
        if (!simulation.isPaused()) return resultOf('not paused', OutputKind.Info);
        simulation.resume();
        return resultOf('simulation resumed');
      },
    },

    {
      name: 'time',
      summary: 'Show elapsed game time.',
      run: () => {
        const ticks = simulation.tick();
        return linesOf([
          `game time  ${formatDuration(ticksToSeconds(ticks))}`,
          `ticks      ${ticks.toLocaleString()} @ ${String(TICKS_PER_SECOND)} Hz`,
        ]);
      },
    },

    {
      name: 'reload',
      summary: 'Reload the renderer process.',
      run: () => {
        reload();
        return resultOf('reloading…', OutputKind.Info);
      },
    },

    {
      name: 'loglevel',
      summary: 'Show or set the log level.',
      usage: 'loglevel [trace|debug|info|warn|error|silent]',
      run: ({ args }) => {
        const [requested] = args;
        if (requested === undefined) {
          return resultOf(`log level: ${levelName(logs.getLevel())}`);
        }

        const level = LOG_LEVEL_NAMES[requested.toLowerCase()];
        if (level === undefined) {
          return resultOf(
            `Unknown level "${requested}". Expected one of: ${Object.keys(LOG_LEVEL_NAMES).join(', ')}`,
            OutputKind.Error,
          );
        }

        logs.setLevel(level);
        return resultOf(`log level set to ${levelName(level)}`);
      },
    },

    {
      name: 'profiler',
      summary: 'Show profiler timings, or reset them.',
      usage: 'profiler [reset]',
      run: ({ args }) => {
        if (args[0] === 'reset') {
          profiler.reset();
          return resultOf('profiler reset');
        }

        const stats = profiler.stats();
        if (stats.length === 0) {
          return resultOf('no samples recorded yet', OutputKind.Info);
        }

        const width = Math.max(...stats.map((s) => s.name.length));
        return linesOf([
          `${'scope'.padEnd(width)}   last     mean      p95      max    count`,
          ...stats.map(
            (s) =>
              `${s.name.padEnd(width)} ${s.last.toFixed(2).padStart(6)}ms ${s.mean
                .toFixed(2)
                .padStart(6)}ms ${s.p95.toFixed(2).padStart(6)}ms ${s.max
                .toFixed(2)
                .padStart(6)}ms ${s.count.toString().padStart(8)}`,
          ),
        ]);
      },
    },

    {
      name: 'metrics',
      summary: 'Dump every registered metric.',
      run: () => {
        const samples = metrics.sample();
        if (samples.length === 0) return resultOf('no metrics registered', OutputKind.Info);

        const width = Math.max(...samples.map((s) => s.label.length));
        return linesOf(samples.map((s) => `[${s.group}] ${s.label.padEnd(width)}  ${s.value}`));
      },
    },
  ];
}
