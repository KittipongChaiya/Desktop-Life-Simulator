/**
 * Colorized console sink. Phase-01.5 deliverable 6.
 *
 * The ONLY place in `src/` permitted to call `console.*` — everything else goes
 * through the logger, enforced by the `no-console` rule.
 *
 * Uses `%c` CSS styling, which DevTools renders and a piped terminal ignores
 * harmlessly, so the same sink works in both without branching.
 */

/* eslint-disable no-console -- this module IS the console boundary; see header */

import { formatRecord, LogLevel, type LogRecord, type LogSink } from './logger';

const STYLES: Readonly<Record<number, string>> = {
  [LogLevel.Trace]: 'color:#8b93a7',
  [LogLevel.Debug]: 'color:#6ea8fe',
  [LogLevel.Info]: 'color:#7fd1a3',
  [LogLevel.Warn]: 'color:#f0c674',
  [LogLevel.Error]: 'color:#f08a8a;font-weight:bold',
};

function method(level: LogLevel): (...args: unknown[]) => void {
  if (level >= LogLevel.Error) return console.error.bind(console);
  if (level >= LogLevel.Warn) return console.warn.bind(console);
  if (level <= LogLevel.Debug) return console.debug.bind(console);
  return console.info.bind(console);
}

export function createConsoleSink(): LogSink {
  return (record: LogRecord): void => {
    const write = method(record.level);
    const style = STYLES[record.level] ?? '';

    if (record.detail === undefined) {
      write(`%c${formatRecord(record)}`, style);
    } else {
      write(`%c${formatRecord(record)}`, style, record.detail);
    }
  };
}
