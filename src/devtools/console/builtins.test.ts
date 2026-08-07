/**
 * Built-in console commands. Phase-08.0c — the module was at 3%.
 *
 * The developer console is how a human drives the game from outside the
 * process: eight E2E specs fund farms and skip growth through it, because there
 * is no other way in (`TESTING.md` §7.1). A builtin that silently stops working
 * therefore breaks the E2E suite in a way whose cause is a 30-second timeout
 * naming nothing — which is exactly what happened in 07.5, and why these are
 * worth pinning here rather than only through the app.
 *
 * Every dependency is injected (`BuiltinDependencies`), so this is plain
 * construction and assertion — no mocking framework, no browser.
 */

import { describe, expect, it } from 'vitest';

import { TICKS_PER_SECOND } from '../../shared/constants';
import type { SimulationControl } from '../../shared/simulation-control';
import { LogLevel, type LogManager } from '../logger/logger';
import type { MetricRegistry } from '../metrics/registry';
import type { Profiler } from '../profiler/profiler';

import { createBuiltinCommands } from './builtins';
import {
  createCommandRegistry,
  OutputKind,
  type CommandDefinition,
  type CommandResult,
} from './registry';

interface Harness {
  readonly run: (name: string, ...args: string[]) => CommandResult;
  readonly commands: readonly CommandDefinition[];
  readonly cleared: { count: number };
  readonly simulation: SimulationControl & { readonly stepped: number[] };
  readonly logs: LogManager & { level: LogLevel };
  readonly reloaded: { count: number };
  readonly profilerReset: { count: number };
}

function harness(
  options: {
    tick?: number;
    paused?: boolean;
    stats?: { name: string; last: number; mean: number; p95: number; max: number; count: number }[];
    samples?: { group: string; label: string; value: string }[];
  } = {},
): Harness {
  const stepped: number[] = [];
  const cleared = { count: 0 };
  const reloaded = { count: 0 };
  const profilerReset = { count: 0 };
  let tick = options.tick ?? 0;
  let paused = options.paused ?? false;

  const simulation = {
    stepped,
    isPaused: () => paused,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    step: (count: number) => {
      stepped.push(count);
      tick += count;
    },
    tick: () => tick,
    ups: () => 20.4,
    fps: () => 59.94,
    frameTimeMs: () => 16.6667,
  } as unknown as SimulationControl & { readonly stepped: number[] };

  const logs = {
    level: LogLevel.Info,
    getLevel(): LogLevel {
      return this.level as LogLevel;
    },
    setLevel(next: LogLevel): void {
      this.level = next;
    },
  } as unknown as LogManager & { level: LogLevel };

  const profiler = {
    reset: () => {
      profilerReset.count += 1;
    },
    stats: () => options.stats ?? [],
  } as unknown as Profiler;

  const metrics = { sample: () => options.samples ?? [] } as unknown as MetricRegistry;

  const registry = createCommandRegistry();
  const commands = createBuiltinCommands({
    registry,
    metrics,
    profiler,
    logs,
    simulation,
    appVersion: '9.9.9-test',
    reload: () => {
      reloaded.count += 1;
    },
  });
  registry.registerAll(commands);

  return {
    commands,
    cleared,
    simulation,
    logs,
    reloaded,
    profilerReset,
    run: (name, ...args) => {
      const command = registry.get(name);
      if (command === undefined) throw new Error(`no such builtin: ${name}`);
      return command.run({
        args,
        clear: () => {
          cleared.count += 1;
        },
      });
    },
  };
}

const text = (result: CommandResult): string => result.lines.map((line) => line.text).join('\n');
const kinds = (result: CommandResult): OutputKind[] => result.lines.map((line) => line.kind);

describe('the builtin set', () => {
  it('registers every command under a unique name and alias', () => {
    const names = harness().commands.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every command a summary, so `help` is never blank', () => {
    for (const command of harness().commands) {
      expect(command.summary.length, command.name).toBeGreaterThan(0);
    }
  });
});

describe('help', () => {
  it('lists every command with its summary', () => {
    const h = harness();
    const output = text(h.run('help'));
    expect(output).toContain(`${h.commands.length} commands available`);
    for (const command of h.commands) expect(output).toContain(command.name);
  });

  it('describes one command, including its aliases', () => {
    const output = text(harness().run('help', 'clear'));
    expect(output).toContain('clear — Clear the console output.');
    expect(output).toContain('aliases: cls');
  });

  it('falls back to the bare name when a command declares no usage', () => {
    expect(text(harness().run('help', 'clear'))).toContain('usage: clear');
  });

  it('shows the declared usage when there is one', () => {
    expect(text(harness().run('help', 'tick'))).toContain('usage: tick [count]');
  });

  it('omits the alias line for a command that has none', () => {
    expect(text(harness().run('help', 'fps'))).not.toContain('aliases:');
  });

  it('reports an unknown command as an error rather than an empty answer', () => {
    const result = harness().run('help', 'teleport');
    expect(text(result)).toBe('No such command: teleport');
    expect(kinds(result)).toEqual([OutputKind.Error]);
  });

  it('answers to its alias', () => {
    expect(text(harness().run('?'))).toContain('commands available');
  });
});

describe('clear, version, reload', () => {
  it('clear empties the output and prints nothing itself', () => {
    const h = harness();
    expect(h.run('clear').lines).toEqual([]);
    expect(h.cleared.count).toBe(1);
  });

  it('version reports the injected build version and the feature flags', () => {
    const output = text(harness().run('version'));
    expect(output).toContain('9.9.9-test');
    expect(output.split('\n').length).toBeGreaterThan(1); // version plus flags
  });

  it('reload asks the host to reload, and says so', () => {
    const h = harness();
    expect(kinds(h.run('reload'))).toEqual([OutputKind.Info]);
    expect(h.reloaded.count).toBe(1);
  });
});

describe('fps and time', () => {
  it('fps reports frame rate, frame time, and update rate', () => {
    const output = text(harness().run('fps'));
    expect(output).toContain('59.9');
    expect(output).toContain('16.67 ms');
    expect(output).toContain('20.4');
  });

  it('time formats elapsed game time as hh:mm:ss and names the tick rate', () => {
    const oneHourOneMinuteOneSecond = TICKS_PER_SECOND * (3600 + 60 + 1);
    const output = text(harness({ tick: oneHourOneMinuteOneSecond }).run('time'));
    expect(output).toContain('01:01:01');
    expect(output).toContain(`${TICKS_PER_SECOND} Hz`);
  });

  it('time reads 00:00:00 on a fresh world', () => {
    expect(text(harness().run('time'))).toContain('00:00:00');
  });
});

describe('tick', () => {
  it('reports the current tick when given no argument', () => {
    expect(text(harness({ tick: 1234 }).run('tick'))).toContain('1,234');
  });

  it('advances by the requested count and reports the new tick', () => {
    const h = harness({ tick: 100 });
    const output = text(h.run('tick', '50'));
    expect(h.simulation.stepped).toEqual([50]);
    expect(output).toContain('advanced 50');
    expect(output).toContain('150');
  });

  it('refuses anything that is not a positive integer, and steps nothing', () => {
    for (const bad of ['0', '-5', 'lots', '']) {
      const h = harness();
      const result = h.run('tick', bad);
      expect(kinds(result), bad).toEqual([OutputKind.Error]);
      expect(h.simulation.stepped, bad).toEqual([]);
    }
  });

  it('takes the leading integer of a sloppy count — `parseInt`, not a full parse', () => {
    // Documenting shipped behaviour, not endorsing it: `Number.parseInt('2.5e')`
    // is 2, so the positive-integer check passes and the console advances 2
    // ticks for `tick 2.5e`. Harmless in a developer tool and not this phase's
    // to change (08.0c alters no behaviour), but it should be visible: if
    // someone tightens the parse, this test fails and they decide deliberately.
    const h = harness();
    h.run('tick', '2.5e');
    expect(h.simulation.stepped).toEqual([2]);
  });
});

describe('pause and resume', () => {
  it('pauses a running simulation', () => {
    const h = harness({ paused: false });
    expect(text(h.run('pause'))).toBe('simulation paused');
    expect(h.simulation.isPaused()).toBe(true);
  });

  it('says so rather than pausing twice', () => {
    const h = harness({ paused: true });
    const result = h.run('pause');
    expect(text(result)).toBe('already paused');
    expect(kinds(result)).toEqual([OutputKind.Info]);
  });

  it('resumes a paused simulation', () => {
    const h = harness({ paused: true });
    expect(text(h.run('resume'))).toBe('simulation resumed');
    expect(h.simulation.isPaused()).toBe(false);
  });

  it('says so rather than resuming a running one', () => {
    const result = harness({ paused: false }).run('resume');
    expect(text(result)).toBe('not paused');
    expect(kinds(result)).toEqual([OutputKind.Info]);
  });
});

describe('loglevel', () => {
  it('reports the current level when given no argument', () => {
    expect(text(harness().run('loglevel'))).toBe('log level: info');
  });

  it('sets a level by name, case-insensitively', () => {
    const h = harness();
    expect(text(h.run('loglevel', 'WARN'))).toBe('log level set to warn');
    expect(h.logs.getLevel()).toBe(LogLevel.Warn);
  });

  it('accepts every documented level', () => {
    for (const name of ['trace', 'debug', 'info', 'warn', 'error', 'silent']) {
      const h = harness();
      expect(kinds(h.run('loglevel', name)), name).toEqual([OutputKind.Result]);
    }
  });

  it('refuses an unknown level, lists the real ones, and changes nothing', () => {
    const h = harness();
    const result = h.run('loglevel', 'verbose');
    expect(kinds(result)).toEqual([OutputKind.Error]);
    expect(text(result)).toContain('trace');
    expect(h.logs.getLevel()).toBe(LogLevel.Info);
  });
});

describe('profiler', () => {
  const STATS = [
    { name: 'tick', last: 1.234, mean: 1.1, p95: 2.2, max: 3.3, count: 100 },
    { name: 'render', last: 4.5, mean: 4.4, p95: 5.5, max: 6.6, count: 200 },
  ];

  it('says so when nothing has been sampled yet', () => {
    const result = harness().run('profiler');
    expect(text(result)).toBe('no samples recorded yet');
    expect(kinds(result)).toEqual([OutputKind.Info]);
  });

  it('tabulates every scope with a header row', () => {
    const output = text(harness({ stats: STATS }).run('profiler'));
    expect(output).toContain('scope');
    expect(output).toContain('tick');
    expect(output).toContain('render');
    expect(output.split('\n')).toHaveLength(3); // header plus two scopes
  });

  it('resets on request instead of printing', () => {
    const h = harness({ stats: STATS });
    expect(text(h.run('profiler', 'reset'))).toBe('profiler reset');
    expect(h.profilerReset.count).toBe(1);
  });

  it('prints rather than resetting for any other argument', () => {
    const h = harness({ stats: STATS });
    h.run('profiler', 'show');
    expect(h.profilerReset.count).toBe(0);
  });
});

describe('metrics', () => {
  it('says so when nothing is registered', () => {
    const result = harness().run('metrics');
    expect(text(result)).toBe('no metrics registered');
    expect(kinds(result)).toEqual([OutputKind.Info]);
  });

  it('dumps every sample with its group and label', () => {
    const samples = [
      { group: 'sim', label: 'workers', value: '3' },
      { group: 'render', label: 'draw calls', value: '17' },
    ];
    const output = text(harness({ samples }).run('metrics'));
    expect(output).toContain('[sim] workers');
    expect(output).toContain('[render] draw calls');
    expect(output).toContain('17');
  });
});

describe('the commands deliberately absent', () => {
  it('does not ship spawn, teleport, or money as stubs (AI_RULES §1.6)', () => {
    // Their owning phase registers them through the same public API, with no
    // change here. A stub that answers "not implemented" is a dead path.
    const names = new Set(harness().commands.map((c) => c.name));
    for (const absent of ['spawn', 'teleport', 'money']) {
      expect(names.has(absent), absent).toBe(false);
    }
  });
});

describe('every builtin is reachable through the registry it registered with', () => {
  it('resolves each name and alias to the same definition', () => {
    const h = harness();
    for (const command of h.commands) {
      for (const alias of command.aliases ?? []) {
        expect(text(h.run(alias)), alias).toBe(text(h.run(command.name)));
      }
    }
  });

  it('runs without throwing for every zero-argument builtin', () => {
    const h = harness();
    const needsArgs = new Set(['clear']);
    for (const command of h.commands) {
      if (needsArgs.has(command.name)) continue;
      expect(() => h.run(command.name), command.name).not.toThrow();
    }
  });
});
