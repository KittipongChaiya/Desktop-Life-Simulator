/**
 * Session recorder. Phase-07.8m, ADR-018 §10.
 *
 * "Recording is subscription, not production." It subscribes to the rings the
 * event and command monitors already fill, samples performance on its own
 * clock, and writes JSON. It publishes nothing, dispatches nothing, and holds
 * no capability that could — the rings hand it observations and the readers
 * hand it numbers.
 *
 * REPLAY IS NOT IN THIS PHASE, and the format is shaped so that when it arrives
 * it replays through the command dispatcher (rule 3) rather than by re-emitting
 * events (rule 10). That is why commands are recorded with their type, source
 * and outcome — the things a dispatcher would need — while events are recorded
 * as observations, which is all they can ever be.
 *
 * IT KEEPS ITS OWN COPY. The monitors' rings are small and always running, so
 * by the time a recording stops the interesting start of it may have been
 * evicted. The recorder copies what arrives while it is running, from the seq
 * it started at, into its own larger buffer.
 *
 * THAT BUFFER IS BOUNDED, and drops are COUNTED AND EXPORTED. An unbounded
 * array that grows with session length is the shape `PERFORMANCE.md` forbids,
 * and a recording that silently lost its middle is worse than one that says it
 * did. A third bounded buffer is where 07.8f's note said a shared one might be
 * extracted; it is not, because this one needs no listeners, no freezing and no
 * stable identity — it would be sharing three lines of slicing.
 */

import type { ObservedCommand } from '../commands/ring';
import type { ObservedEvent } from '../events/ring';

/** Entries kept per stream. Roughly an hour of ordinary play, in ~100 KB. */
export const RECORDING_CAPACITY = 5_000;

export interface PerformanceSample {
  readonly tick: number;
  readonly fps: number;
  readonly frameTimeMs: number;
  /** Null where the runtime does not report a heap, never zero. */
  readonly heapMb: number | null;
}

export interface RecordingDrops {
  readonly events: number;
  readonly commands: number;
  readonly performance: number;
}

export interface Recording {
  /** Format version. A replayer must refuse what it does not understand. */
  readonly version: 1;
  readonly appVersion: string;
  readonly startedAtTick: number;
  readonly stoppedAtTick: number;
  readonly events: readonly ObservedEvent[];
  readonly commands: readonly ObservedCommand[];
  readonly performance: readonly PerformanceSample[];
  /** What the bounded buffers had to discard. Zero is the normal case. */
  readonly dropped: RecordingDrops;
}

export interface RecordingStatus {
  readonly recording: boolean;
  readonly startedAtTick: number | null;
  readonly events: number;
  readonly commands: number;
  readonly performance: number;
  readonly dropped: RecordingDrops;
}

/** The observation surfaces a recorder reads. All read-only. */
export interface RecorderSources {
  readonly events: {
    entries(): readonly ObservedEvent[];
    subscribe(listener: () => void): () => void;
  };
  readonly commands: {
    entries(): readonly ObservedCommand[];
    subscribe(listener: () => void): () => void;
  };
  readonly tick: () => number;
  readonly fps: () => number;
  readonly frameTimeMs: () => number;
  readonly heapMb: () => number | null;
  readonly appVersion: string;
  /** Injected so a test is not at the mercy of a real clock (game-loop's idiom). */
  readonly schedule?: (callback: () => void, ms: number) => number;
  readonly cancel?: (handle: number) => void;
}

export interface Recorder {
  /** Begins a session, discarding any previous one. */
  start(): void;
  /** Ends the session and returns what was observed, or null if not recording. */
  stop(): Recording | null;
  status(): RecordingStatus;
  /** Takes one performance sample. Driven by the recorder's own interval. */
  samplePerformance(): void;
}

/** One point every 500 ms while recording, matching the performance panel. */
export const RECORDING_SAMPLE_MS = 500;

function appendBounded<T>(buffer: T[], items: readonly T[], capacity: number): number {
  buffer.push(...items);
  if (buffer.length <= capacity) return 0;

  const overflow = buffer.length - capacity;
  buffer.splice(0, overflow);
  return overflow;
}

export function createRecorder(sources: RecorderSources): Recorder {
  const schedule = sources.schedule ?? ((cb, ms) => globalThis.setInterval(cb, ms));
  const cancel =
    sources.cancel ??
    ((handle) => {
      globalThis.clearInterval(handle);
    });

  let recording = false;
  let startedAtTick: number | null = null;
  let handle: number | null = null;
  let unsubscribe: (() => void)[] = [];

  const events: ObservedEvent[] = [];
  const commands: ObservedCommand[] = [];
  const performance: PerformanceSample[] = [];
  let dropped: RecordingDrops = { events: 0, commands: 0, performance: 0 };

  // Watermarks, so a ring that has not been read since last time contributes
  // only what is new — and so an entry is never recorded twice.
  let lastEventSeq = 0;
  let lastCommandSeq = 0;

  const drainEvents = (): void => {
    const fresh = sources.events.entries().filter((entry) => entry.seq > lastEventSeq);
    if (fresh.length === 0) return;

    lastEventSeq = fresh[fresh.length - 1]?.seq ?? lastEventSeq;
    const lost = appendBounded(events, fresh, RECORDING_CAPACITY);
    if (lost > 0) dropped = { ...dropped, events: dropped.events + lost };
  };

  const drainCommands = (): void => {
    const fresh = sources.commands.entries().filter((entry) => entry.seq > lastCommandSeq);
    if (fresh.length === 0) return;

    lastCommandSeq = fresh[fresh.length - 1]?.seq ?? lastCommandSeq;
    const lost = appendBounded(commands, fresh, RECORDING_CAPACITY);
    if (lost > 0) dropped = { ...dropped, commands: dropped.commands + lost };
  };

  return {
    start() {
      // A previous session is discarded rather than merged: two recordings in
      // one file would describe a timeline that never happened.
      for (const stop of unsubscribe) stop();
      if (handle !== null) cancel(handle);

      events.length = 0;
      commands.length = 0;
      performance.length = 0;
      dropped = { events: 0, commands: 0, performance: 0 };

      // Start from what the rings hold NOW, so the recording contains what
      // happened after the developer pressed record and nothing before it.
      lastEventSeq = sources.events.entries().at(-1)?.seq ?? 0;
      lastCommandSeq = sources.commands.entries().at(-1)?.seq ?? 0;

      recording = true;
      startedAtTick = sources.tick();
      unsubscribe = [
        sources.events.subscribe(drainEvents),
        sources.commands.subscribe(drainCommands),
      ];
      handle = schedule(() => {
        this.samplePerformance();
      }, RECORDING_SAMPLE_MS);
    },

    stop() {
      if (!recording) return null;

      // One last drain: anything observed since the previous notification
      // belongs to this session, not to the next one.
      drainEvents();
      drainCommands();

      for (const stop of unsubscribe) stop();
      unsubscribe = [];
      if (handle !== null) cancel(handle);
      handle = null;
      recording = false;

      return {
        version: 1,
        appVersion: sources.appVersion,
        startedAtTick: startedAtTick ?? 0,
        stoppedAtTick: sources.tick(),
        events: [...events],
        commands: [...commands],
        performance: [...performance],
        dropped,
      };
    },

    status: () => ({
      recording,
      startedAtTick,
      events: events.length,
      commands: commands.length,
      performance: performance.length,
      dropped,
    }),

    samplePerformance() {
      if (!recording) return;

      const lost = appendBounded(
        performance,
        [
          {
            tick: sources.tick(),
            fps: sources.fps(),
            frameTimeMs: sources.frameTimeMs(),
            heapMb: sources.heapMb(),
          },
        ],
        RECORDING_CAPACITY,
      );
      if (lost > 0) dropped = { ...dropped, performance: dropped.performance + lost };
    },
  };
}
