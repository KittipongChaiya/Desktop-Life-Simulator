/**
 * Logger tests. Phase-01.5 deliverable 6.
 */

import { describe, expect, it, vi } from 'vitest';

import { createLogManager, formatRecord, levelName, LogLevel, type LogRecord } from './logger';

function managerWithSink() {
  const records: LogRecord[] = [];
  const logs = createLogManager({ level: LogLevel.Trace, now: () => 1_700_000_000_000 });
  logs.addSink((record) => records.push(record));
  return { logs, records };
}

describe('levels', () => {
  it('emits records at or above the configured level', () => {
    const { logs, records } = managerWithSink();
    logs.setLevel(LogLevel.Warn);
    const log = logs.get('sim');

    log.trace('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(records.map((r) => r.message)).toEqual(['w', 'e']);
  });

  it('silences everything at Silent', () => {
    const { logs, records } = managerWithSink();
    logs.setLevel(LogLevel.Silent);
    logs.get('sim').error('boom');

    expect(records).toHaveLength(0);
  });

  it('round-trips level names', () => {
    expect(levelName(LogLevel.Warn)).toBe('warn');
  });
});

describe('records', () => {
  it('carries subsystem, timestamp, and message', () => {
    const { logs, records } = managerWithSink();
    logs.get('render').info('hello');

    expect(records[0]).toMatchObject({
      subsystem: 'render',
      message: 'hello',
      timestamp: 1_700_000_000_000,
      level: LogLevel.Info,
    });
  });

  it('nests child subsystems', () => {
    const { logs, records } = managerWithSink();
    logs.get('render').child('atlas').debug('loaded');

    expect(records[0]?.subsystem).toBe('render.atlas');
  });

  it('omits detail when not supplied', () => {
    const { logs, records } = managerWithSink();
    logs.get('sim').info('plain');

    expect(records[0]).not.toHaveProperty('detail');
  });

  it('formats as time LEVEL [subsystem] message', () => {
    const line = formatRecord({
      level: LogLevel.Warn,
      timestamp: new Date(2026, 0, 1, 13, 5, 9, 42).getTime(),
      subsystem: 'ipc',
      message: 'rejected',
    });

    expect(line).toContain('13:05:09.042');
    expect(line).toContain('WARN');
    expect(line).toContain('[ipc]');
    expect(line).toContain('rejected');
  });
});

describe('sinks and buffer', () => {
  it('stops delivering after a sink is removed', () => {
    const { logs, records } = managerWithSink();
    const sink = vi.fn();
    const remove = logs.addSink(sink);

    logs.get('a').info('one');
    remove();
    logs.get('a').info('two');

    expect(sink).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(2);
  });

  it('retains recent records for the console view', () => {
    const { logs } = managerWithSink();
    for (let i = 0; i < 10; i += 1) logs.get('a').info(`m${String(i)}`);

    expect(logs.recent(3).map((r) => r.message)).toEqual(['m7', 'm8', 'm9']);
  });

  it('bounds the buffer so an all-day session cannot grow without limit', () => {
    const { logs } = managerWithSink();
    for (let i = 0; i < 2000; i += 1) logs.get('a').info(`m${String(i)}`);

    expect(logs.recent().length).toBeLessThanOrEqual(500);
  });
});
