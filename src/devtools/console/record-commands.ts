/**
 * Recording, from the console. Phase-07.8m.
 *
 * `record start`, `record stop`, `record status`. Stopping exports the JSON
 * through an injected sink, so the download plumbing — the one part that is a
 * browser API rather than logic — is the only thing not covered by a test.
 *
 * The console rather than a panel, for the reason the spawn tools are there:
 * recording is a verb a developer performs occasionally and deliberately, not
 * a surface to watch, and the function keys are spent.
 */

import type { Recorder, Recording } from '../recording/recorder';

import {
  linesOf,
  OutputKind,
  resultOf,
  type CommandDefinition,
  type CommandResult,
} from './registry';

export interface RecordCommandOptions {
  readonly recorder: Recorder;
  /**
   * Delivers the finished recording. Injected so the command is testable and
   * so nothing here needs to know whether that means a file, a clipboard, or
   * something a later phase invents.
   */
  readonly deliver: (name: string, json: string) => void;
}

/** Stable, sortable, and unambiguous about which session it is. */
function fileNameFor(recording: Recording): string {
  return `recording-t${String(recording.startedAtTick)}-t${String(recording.stoppedAtTick)}.json`;
}

function summarise(recording: Recording): readonly string[] {
  const lines = [
    `recorded ticks ${String(recording.startedAtTick)}–${String(recording.stoppedAtTick)}`,
    `${String(recording.events.length)} events · ${String(recording.commands.length)} commands · ${String(recording.performance.length)} samples`,
  ];

  const { events, commands, performance } = recording.dropped;
  const lost = events + commands + performance;
  // Losses are reported in the console as well as in the file. A developer who
  // never opens the JSON should still know the recording is not complete.
  if (lost > 0) {
    lines.push(
      `DROPPED ${String(lost)} entries (events ${String(events)}, commands ${String(commands)}, samples ${String(performance)})`,
    );
  }

  return lines;
}

export function createRecordCommands(options: RecordCommandOptions): readonly CommandDefinition[] {
  const { recorder, deliver } = options;

  const start = (): CommandResult => {
    if (recorder.status().recording) {
      return resultOf('already recording — `record stop` first', OutputKind.Info);
    }
    recorder.start();
    return resultOf('recording started');
  };

  const stop = (): CommandResult => {
    const recording = recorder.stop();
    if (recording === null) return resultOf('not recording', OutputKind.Info);

    const name = fileNameFor(recording);
    deliver(name, JSON.stringify(recording, null, 2));

    return linesOf([...summarise(recording), `exported ${name}`]);
  };

  const status = (): CommandResult => {
    const current = recorder.status();
    if (!current.recording) return resultOf('not recording', OutputKind.Info);

    return resultOf(
      `recording since tick ${String(current.startedAtTick ?? 0)} · ` +
        `${String(current.events)} events · ${String(current.commands)} commands · ` +
        `${String(current.performance)} samples`,
    );
  };

  return [
    {
      name: 'record',
      summary: 'Record events, commands and performance, and export them as JSON.',
      usage: 'record start | record stop | record status',
      run: ({ args }) => {
        switch (args[0]) {
          case 'start':
            return start();
          case 'stop':
            return stop();
          case undefined:
          case 'status':
            return status();
          default:
            return resultOf(
              `Unknown option "${args[0]}". Try: start, stop, status.`,
              OutputKind.Error,
            );
        }
      },
    },
  ];
}
