/**
 * Spawn tools. Phase-07.8k, ADR-018 §3.
 *
 * The first debug tool that WRITES, and the rule it must not break is the one
 * ADR-018 calls "most likely to be broken by a well-meaning shortcut": every
 * mutation goes through the command dispatcher, validated like any other and
 * rejectable like any other.
 *
 * That is asserted structurally rather than hopefully. `createSpawnCommands`
 * receives ONE capability — a function that submits a command — so there is no
 * store, grid, or entity in scope for it to write to even if it tried. These
 * tests pin the commands it builds to the commands it must submit.
 */

import { describe, expect, it, vi } from 'vitest';

import { appError, ErrorCode } from '../../shared/errors';
import { err, ok } from '../../shared/result';
import { CommandSource, type Command, type CommandResult } from '../../sim/commands/types';
import { OutputKind, type CommandDefinition } from '../console/registry';

import { createSpawnCommands } from './spawn-commands';

function accepted(): CommandResult {
  return ok({ id: 1, source: CommandSource.Player, dispatchedTick: 0 });
}

function harness(result: () => CommandResult = accepted): {
  readonly spawn: CommandDefinition;
  readonly submitted: Command[];
  readonly submit: (command: Command) => CommandResult;
} {
  const submitted: Command[] = [];
  const submit = vi.fn((command: Command) => {
    submitted.push(command);
    return result();
  });

  const commands = createSpawnCommands({ submitCommand: submit });
  const spawn = commands.find((c) => c.name === 'spawn');
  if (spawn === undefined) throw new Error('no spawn command');

  return { spawn, submitted, submit };
}

function run(spawn: CommandDefinition, ...args: readonly string[]): string {
  return spawn
    .run({ args, clear: () => undefined })
    .lines.map((line) => line.text)
    .join(' | ');
}

function kinds(spawn: CommandDefinition, ...args: readonly string[]): readonly string[] {
  return spawn.run({ args, clear: () => undefined }).lines.map((line) => line.kind);
}

describe('spawn worker', () => {
  it('submits a hire command through the dispatcher', () => {
    const { spawn, submitted } = harness();

    run(spawn, 'worker');

    expect(submitted).toEqual([{ type: 'hireWorker' }]);
  });

  it('submits one command per worker asked for', () => {
    // Three separate commands, not one with a count: the dispatcher validates
    // each against the world as it stands, so the third can be refused for
    // want of coins while the first two succeed.
    const { spawn, submitted } = harness();

    run(spawn, 'worker', '3');

    expect(submitted).toHaveLength(3);
  });

  it('refuses a count that is not a positive integer', () => {
    const { spawn, submitted } = harness();

    expect(kinds(spawn, 'worker', '0')).toEqual([OutputKind.Error]);
    expect(kinds(spawn, 'worker', '-2')).toEqual([OutputKind.Error]);
    expect(kinds(spawn, 'worker', 'lots')).toEqual([OutputKind.Error]);
    expect(submitted).toHaveLength(0);
  });
});

describe('spawn crop and building', () => {
  it('submits a plant command for the tile named', () => {
    const { spawn, submitted } = harness();

    run(spawn, 'crop', 'core:wheat', '10,12');

    expect(submitted).toEqual([{ type: 'plantCrop', tile: 12 * 64 + 10, cropId: 'core:wheat' }]);
  });

  it('submits a placement command for the tile named', () => {
    const { spawn, submitted } = harness();

    run(spawn, 'building', 'core:storage_shed', '4,5');

    expect(submitted).toEqual([
      { type: 'placeBuilding', tile: 5 * 64 + 4, buildingId: 'core:storage_shed' },
    ]);
  });

  it('refuses a coordinate off the grid rather than dispatching a bad tile', () => {
    const { spawn, submitted } = harness();

    expect(kinds(spawn, 'crop', 'core:wheat', '99,99')).toEqual([OutputKind.Error]);
    expect(kinds(spawn, 'crop', 'core:wheat', '-1,0')).toEqual([OutputKind.Error]);
    expect(kinds(spawn, 'crop', 'core:wheat', 'here')).toEqual([OutputKind.Error]);
    expect(submitted).toHaveLength(0);
  });

  it('refuses a content id that is not one', () => {
    const { spawn, submitted } = harness();

    expect(kinds(spawn, 'crop', 'wheat', '1,1')).toEqual([OutputKind.Error]);
    expect(submitted).toHaveLength(0);
  });
});

describe('spawn — the dispatcher has the last word', () => {
  it('reports a rejection instead of pretending it worked', () => {
    // The point of ADR-018 §3: a debug spawn is refused exactly like a player
    // action. An illegal placement fails, and the tool says so.
    const { spawn } = harness(() => err(appError(ErrorCode.TileNotOwned, 'tile is not owned')));

    const output = run(spawn, 'building', 'core:storage_shed', '0,0');

    expect(output).toContain('tile is not owned');
    expect(kinds(spawn, 'building', 'core:storage_shed', '0,0')).toEqual([OutputKind.Error]);
  });

  it('reports how many of a batch were accepted when some were not', () => {
    let calls = 0;
    const { spawn } = harness(() => {
      calls += 1;
      return calls > 1 ? err(appError(ErrorCode.MissingItem, 'not enough coins')) : accepted();
    });

    const output = run(spawn, 'worker', '3');

    expect(output).toContain('1');
    expect(output).toContain('not enough coins');
  });
});

describe('spawn — usability', () => {
  it('lists what it can spawn when asked for nothing', () => {
    const { spawn, submitted } = harness();

    const output = run(spawn);

    expect(output).toContain('worker');
    expect(output).toContain('crop');
    expect(output).toContain('building');
    expect(submitted).toHaveLength(0);
  });

  it('refuses a kind it does not know', () => {
    const { spawn, submitted } = harness();

    expect(kinds(spawn, 'dragon')).toEqual([OutputKind.Error]);
    expect(submitted).toHaveLength(0);
  });

  it('declares a summary and a usage line, so `help` is useful', () => {
    const { spawn } = harness();

    expect(spawn.summary.length).toBeGreaterThan(0);
    expect(spawn.usage ?? '').toContain('spawn');
  });
});
