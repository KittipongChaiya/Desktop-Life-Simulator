/**
 * Centralized logger. Phase-01.5 deliverable 6.
 *
 * `console.log` is banned outside this module (lint-enforced across src/).
 * Scattered console calls have no level, no subsystem, no timestamp, and no way
 * to be turned off — which makes them useless in a long-running desktop app and
 * impossible to strip from a production build.
 *
 * Sinks are pluggable so file logging (deliverable 6) can be added in the main
 * process without this module knowing what a filesystem is — `src/devtools` is
 * subject to the same purity rules as the rest of the renderer.
 */

export const LogLevel = {
  Trace: 10,
  Debug: 20,
  Info: 30,
  Warn: 40,
  Error: 50,
  Silent: 100,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LOG_LEVEL_NAMES: Readonly<Record<string, LogLevel>> = {
  trace: LogLevel.Trace,
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
  silent: LogLevel.Silent,
};

export function levelName(level: LogLevel): string {
  return Object.keys(LOG_LEVEL_NAMES).find((k) => LOG_LEVEL_NAMES[k] === level) ?? 'unknown';
}

export interface LogRecord {
  readonly level: LogLevel;
  /** Milliseconds since epoch, supplied by the caller's clock. */
  readonly timestamp: number;
  /** Subsystem name, e.g. "sim", "render", "ipc". */
  readonly subsystem: string;
  readonly message: string;
  readonly detail?: unknown;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  trace(message: string, detail?: unknown): void;
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
  /** A logger for a nested subsystem, e.g. "render" -> "render.atlas". */
  child(subsystem: string): Logger;
}

export interface LogManager {
  get(subsystem: string): Logger;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  addSink(sink: LogSink): () => void;
  /** Most recent records, newest last. Drives the console's log view. */
  recent(limit?: number): readonly LogRecord[];
}

const RING_CAPACITY = 500;

export interface LogManagerOptions {
  readonly level?: LogLevel;
  /** Injected so the logger stays testable and free of wall-clock reads. */
  readonly now?: () => number;
}

export function createLogManager(options: LogManagerOptions = {}): LogManager {
  const sinks = new Set<LogSink>();
  const ring: LogRecord[] = [];
  let level: LogLevel = options.level ?? LogLevel.Info;
  const now = options.now ?? ((): number => Date.now());

  const emit = (record: LogRecord): void => {
    if (record.level < level) return;

    ring.push(record);
    if (ring.length > RING_CAPACITY) ring.shift();

    for (const sink of sinks) sink(record);
  };

  const makeLogger = (subsystem: string): Logger => {
    const at =
      (recordLevel: LogLevel) =>
      (message: string, detail?: unknown): void => {
        emit(
          detail === undefined
            ? { level: recordLevel, timestamp: now(), subsystem, message }
            : { level: recordLevel, timestamp: now(), subsystem, message, detail },
        );
      };

    return {
      trace: at(LogLevel.Trace),
      debug: at(LogLevel.Debug),
      info: at(LogLevel.Info),
      warn: at(LogLevel.Warn),
      error: at(LogLevel.Error),
      child: (nested) => makeLogger(`${subsystem}.${nested}`),
    };
  };

  return {
    get: makeLogger,
    setLevel: (next) => {
      level = next;
    },
    getLevel: () => level,
    addSink: (sink) => {
      sinks.add(sink);
      return () => sinks.delete(sink);
    },
    recent: (limit = RING_CAPACITY) => ring.slice(Math.max(0, ring.length - limit)),
  };
}

/** Formats a record as `HH:MM:SS.mmm LEVEL [subsystem] message`. */
export function formatRecord(record: LogRecord): string {
  const date = new Date(record.timestamp);
  const pad = (n: number, width = 2): string => n.toString().padStart(width, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;

  return `${time} ${levelName(record.level).toUpperCase().padEnd(5)} [${record.subsystem}] ${record.message}`;
}
