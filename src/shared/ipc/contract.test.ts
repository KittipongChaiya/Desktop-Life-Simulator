/**
 * The IPC channel table. Phase-08.0c — the module was at 0%.
 *
 * The renderer is treated as untrusted and becomes literally so in v0.2, when
 * plugin code runs there (ADR-003 §3). The preload bridge forwards only the
 * channels named here, so this table IS the trust boundary's surface — and it
 * had no test, in a file every process imports.
 *
 * What is worth asserting about a constant table is the property a human eye
 * misses on review: that no two channels collide. A duplicated string silently
 * routes two different calls to one handler, and the second `ipcMain.handle`
 * for a name throws at startup — a crash on launch, found by whoever ships it.
 */

import { describe, expect, it } from 'vitest';

import { EventChannel, InvokeChannel, SendChannel } from './contract';

const TABLES = { InvokeChannel, SendChannel, EventChannel } as const;

const everyChannel = Object.entries(TABLES).flatMap(([table, channels]) =>
  Object.entries(channels).map(([key, channel]) => ({ table, key, channel })),
);

describe('the IPC channel table', () => {
  it('names every channel exactly once across all three tables', () => {
    const seen = new Map<string, string>();
    for (const { table, key, channel } of everyChannel) {
      const previous = seen.get(channel);
      expect(
        previous,
        `"${channel}" is used by both ${previous} and ${table}.${key}`,
      ).toBeUndefined();
      seen.set(channel, `${table}.${key}`);
    }
  });

  it('namespaces every channel, so a name cannot be ambiguous across features', () => {
    for (const { table, key, channel } of everyChannel) {
      expect(channel, `${table}.${key}`).toMatch(/^[a-z][a-z-]*:[a-z][a-z-]*$/);
    }
  });

  it('is not empty in any direction — each table carries real channels', () => {
    for (const [table, channels] of Object.entries(TABLES)) {
      expect(Object.keys(channels).length, `${table} is empty`).toBeGreaterThan(0);
    }
  });
});
