/**
 * Recording console commands. Phase-07.8m.
 *
 * The interesting behaviour is not "does it call the recorder" but what the
 * developer is told: that a session started, what it caught, and — the one
 * that matters — that some of it was dropped.
 */

import { describe, expect, it, vi } from 'vitest';

import type { Recorder, Recording, RecordingStatus } from '../recording/recorder';

import { createRecordCommands } from './record-commands';
import { OutputKind, type CommandDefinition } from './registry';

function emptyRecording(overrides: Partial<Recording> = {}): Recording {
  return {
    version: 1,
    appVersion: '0.0.0-test',
    startedAtTick: 100,
    stoppedAtTick: 260,
    events: [],
    commands: [],
    performance: [],
    dropped: { events: 0, commands: 0, performance: 0 },
    ...overrides,
  };
}

function idleStatus(overrides: Partial<RecordingStatus> = {}): RecordingStatus {
  return {
    recording: false,
    startedAtTick: null,
    events: 0,
    commands: 0,
    performance: 0,
    dropped: { events: 0, commands: 0, performance: 0 },
    ...overrides,
  };
}

function harness(recorder: Partial<Recorder> = {}): {
  readonly record: CommandDefinition;
  readonly delivered: { name: string; json: string }[];
} {
  const delivered: { name: string; json: string }[] = [];
  const full: Recorder = {
    start: () => undefined,
    stop: () => null,
    status: () => idleStatus(),
    samplePerformance: () => undefined,
    ...recorder,
  };

  const commands = createRecordCommands({
    recorder: full,
    deliver: (name, json) => {
      delivered.push({ name, json });
    },
  });
  const record = commands.find((c) => c.name === 'record');
  if (record === undefined) throw new Error('no record command');

  return { record, delivered };
}

function run(command: CommandDefinition, ...args: readonly string[]): string {
  return command
    .run({ args, clear: () => undefined })
    .lines.map((line) => line.text)
    .join(' | ');
}

describe('record start', () => {
  it('starts a session', () => {
    const start = vi.fn();
    const { record } = harness({ start });

    expect(run(record, 'start')).toContain('recording started');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('refuses to start a second session over a running one', () => {
    // Restarting silently would throw away whatever had been captured.
    const start = vi.fn();
    const { record } = harness({ start, status: () => idleStatus({ recording: true }) });

    expect(run(record, 'start')).toContain('already recording');
    expect(start).not.toHaveBeenCalled();
  });
});

describe('record stop', () => {
  it('says so when there is nothing to stop', () => {
    const { record, delivered } = harness();

    expect(run(record, 'stop')).toContain('not recording');
    expect(delivered).toHaveLength(0);
  });

  it('exports the recording as JSON, named for the ticks it spans', () => {
    const { record, delivered } = harness({ stop: () => emptyRecording() });

    run(record, 'stop');

    expect(delivered[0]?.name).toBe('recording-t100-t260.json');
    expect(JSON.parse(delivered[0]?.json ?? '{}')).toMatchObject({
      version: 1,
      startedAtTick: 100,
      stoppedAtTick: 260,
    });
  });

  it('summarises what it caught', () => {
    const { record } = harness({
      stop: () =>
        emptyRecording({
          events: [{ seq: 1, name: 'tileTilled', tick: 1, summary: '{}' }],
          performance: [{ tick: 1, fps: 60, frameTimeMs: 16, heapMb: null }],
        }),
    });

    const output = run(record, 'stop');

    expect(output).toContain('1 events');
    expect(output).toContain('1 samples');
    expect(output).toContain('recorded ticks 100–260');
  });

  it('says loudly when entries were dropped', () => {
    // A developer who never opens the JSON must still learn the recording is
    // incomplete, or they will draw conclusions from a gap they cannot see.
    const { record } = harness({
      stop: () => emptyRecording({ dropped: { events: 12, commands: 3, performance: 0 } }),
    });

    const output = run(record, 'stop');

    expect(output).toContain('DROPPED 15');
    expect(output).toContain('events 12');
    expect(output).toContain('commands 3');
  });
});

describe('record status', () => {
  it('reports an idle recorder', () => {
    const { record } = harness();

    expect(run(record, 'status')).toContain('not recording');
    expect(run(record)).toContain('not recording');
  });

  it('reports a running session without ending it', () => {
    const stop = vi.fn(() => null);
    const { record } = harness({
      stop,
      status: () => idleStatus({ recording: true, startedAtTick: 40, events: 7 }),
    });

    const output = run(record, 'status');

    expect(output).toContain('since tick 40');
    expect(output).toContain('7 events');
    expect(stop).not.toHaveBeenCalled();
  });

  it('refuses an option it does not know', () => {
    const { record } = harness();

    expect(record.run({ args: ['sideways'], clear: () => undefined }).lines[0]?.kind).toBe(
      OutputKind.Error,
    );
  });
});
