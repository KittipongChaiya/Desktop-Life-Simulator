/**
 * Command queue tests. Phase-03.5.
 *
 * The queue is FIFO and drains completely (ADR-010 §4). Ordering is not a
 * convenience here — it is the property replay and determinism rest on.
 */

import { describe, expect, it } from 'vitest';

import { createCommandQueue } from './queue';
import { CommandSource, type Command, type CommandMetadata, type QueuedCommand } from './types';

function entry(command: Command, id: number, key?: string): QueuedCommand {
  const metadata: CommandMetadata = {
    id,
    source: CommandSource.Player,
    dispatchedTick: 0,
  };
  return key === undefined ? { command, metadata } : { command, metadata, key };
}

const till = (tile: number): Command => ({ type: 'tillTile', tile });

describe('command queue', () => {
  it('starts empty', () => {
    expect(createCommandQueue().size).toBe(0);
  });

  it('drains in FIFO order', () => {
    const queue = createCommandQueue();
    queue.enqueue(entry(till(1), 1));
    queue.enqueue(entry(till(2), 2));
    queue.enqueue(entry(till(3), 3));

    expect(queue.drain().map((e) => e.metadata.id)).toEqual([1, 2, 3]);
  });

  it('is empty after draining', () => {
    const queue = createCommandQueue();
    queue.enqueue(entry(till(1), 1));
    queue.drain();

    expect(queue.size).toBe(0);
    expect(queue.drain()).toEqual([]);
  });

  it('tracks keys of pending entries only', () => {
    const queue = createCommandQueue();
    queue.enqueue(entry(till(1), 1, 'plant-1'));

    expect(queue.has('plant-1')).toBe(true);
    expect(queue.has('plant-2')).toBe(false);

    // Keys are scoped to the pending window: once executed, the same key is
    // dispatchable again. This is what bounds the set (AI_RULES.md §2.3).
    queue.drain();
    expect(queue.has('plant-1')).toBe(false);
  });

  it('ignores entries with no key for duplicate tracking', () => {
    const queue = createCommandQueue();
    queue.enqueue(entry(till(1), 1));

    expect(queue.size).toBe(1);
    expect(queue.has('')).toBe(false);
  });
});
