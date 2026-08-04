/**
 * Command monitor — the ring and the observation. Phase-07.8f.
 *
 * The property that matters most is the one a monitor can most easily break:
 * observing a command must not change it. The wrapper returns exactly what the
 * producer returned, rethrows exactly what it threw, and adds nothing to the
 * path a command travels.
 */

import { describe, expect, it, vi } from 'vitest';

import { appError, ErrorCode } from '../../shared/errors';
import { err, ok } from '../../shared/result';
import { CommandSource, type Command, type CommandMetadata } from '../../sim/commands/types';

import { observeCommands, observeExecutionFailure } from './observer';
import { CommandOutcome, createCommandRing } from './ring';

const TILL: Command = { type: 'tillTile', tile: 100 };

function metadata(overrides: Partial<CommandMetadata> = {}): CommandMetadata {
  return { id: 1, source: CommandSource.Player, dispatchedTick: 7, ...overrides };
}

function readers(tick = 7, pending = 0): { tick: () => number; pending: () => number } {
  return { tick: () => tick, pending: () => pending };
}

describe('command ring', () => {
  it('records with a sequence number and evicts the oldest at capacity', () => {
    const ring = createCommandRing(2);
    for (const type of ['a', 'b', 'c']) {
      ring.record({
        type,
        source: 'player',
        outcome: CommandOutcome.Accepted,
        detail: '',
        tick: 1,
        dispatchMs: 0,
        queueDepth: 0,
      });
    }

    expect(ring.entries().map((e) => [e.seq, e.type])).toEqual([
      [2, 'b'],
      [3, 'c'],
    ]);
  });

  it('tallies every outcome it ever saw, including what it evicted', () => {
    // The tally is the honest half of a bounded buffer: 3 kept of 300 seen
    // says nothing about how many were rejected.
    const ring = createCommandRing(1);
    const base = {
      type: 'tillTile',
      source: 'player',
      detail: '',
      tick: 1,
      dispatchMs: 0,
      queueDepth: 0,
    };

    ring.record({ ...base, outcome: CommandOutcome.Accepted });
    ring.record({ ...base, outcome: CommandOutcome.Accepted });
    ring.record({ ...base, outcome: CommandOutcome.Rejected });
    ring.record({ ...base, outcome: CommandOutcome.Failed });

    expect(ring.tally()).toEqual({ accepted: 2, rejected: 1, failed: 1 });
    expect(ring.observed()).toBe(4);
    expect(ring.entries()).toHaveLength(1);
  });

  it('keeps a stable, frozen entries reference between changes', () => {
    const ring = createCommandRing(4);
    ring.record({
      type: 'tillTile',
      source: 'player',
      outcome: CommandOutcome.Accepted,
      detail: '',
      tick: 1,
      dispatchMs: 0,
      queueDepth: 0,
    });

    expect(ring.entries()).toBe(ring.entries());
    expect(() => {
      (ring.entries() as unknown[]).push('x');
    }).toThrow();
  });

  it('notifies on record and on clear, and forgets its tally when cleared', () => {
    const ring = createCommandRing(4);
    const listener = vi.fn();
    ring.subscribe(listener);

    ring.record({
      type: 'tillTile',
      source: 'player',
      outcome: CommandOutcome.Rejected,
      detail: 'tile_not_owned',
      tick: 1,
      dispatchMs: 0,
      queueDepth: 0,
    });
    ring.clear();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(ring.tally()).toEqual({ accepted: 0, rejected: 0, failed: 0 });
  });
});

describe('observeCommands', () => {
  it('returns the producer’s result untouched', () => {
    // Identity, not equality: a monitor that rebuilt the result would be a
    // second code path for every command in the game.
    const result = ok(metadata());
    const ring = createCommandRing(4);
    const producer = observeCommands(
      { source: CommandSource.Player, submit: () => result },
      ring,
      readers(),
    );

    expect(producer.submit(TILL)).toBe(result);
  });

  it('keeps the producer’s own source', () => {
    const observed = observeCommands(
      { source: CommandSource.Player, submit: () => ok(metadata()) },
      createCommandRing(4),
      readers(),
    );

    expect(observed.source).toBe(CommandSource.Player);
  });

  it('records an accepted command with its type, tick and queue depth', () => {
    const ring = createCommandRing(4);
    const producer = observeCommands(
      { source: CommandSource.Player, submit: () => ok(metadata({ dispatchedTick: 12 })) },
      ring,
      readers(12, 3),
    );

    producer.submit(TILL);

    const entry = ring.entries()[0];
    expect(entry?.type).toBe('tillTile');
    expect(entry?.outcome).toBe(CommandOutcome.Accepted);
    expect(entry?.tick).toBe(12);
    expect(entry?.queueDepth).toBe(3);
    expect(entry?.detail).toBe('');
  });

  it('records a rejection with the validation error that caused it', () => {
    const ring = createCommandRing(4);
    const producer = observeCommands(
      {
        source: CommandSource.Player,
        submit: () => err(appError(ErrorCode.TileNotOwned, 'tile is not owned')),
      },
      ring,
      readers(),
    );

    producer.submit(TILL);

    expect(ring.entries()[0]?.outcome).toBe(CommandOutcome.Rejected);
    expect(ring.entries()[0]?.detail).toBe(ErrorCode.TileNotOwned);
  });

  it('measures the dispatch, and says that is what it measured', () => {
    const ring = createCommandRing(4);
    let clock = 0;
    const producer = observeCommands(
      { source: CommandSource.Player, submit: () => ok(metadata()) },
      ring,
      { ...readers(), now: () => (clock += 5) },
    );

    producer.submit(TILL);

    // Validation and queueing only. Execution happens a tick later, inside the
    // simulation, where no renderer-side wrapper can see it.
    expect(ring.entries()[0]?.dispatchMs).toBe(5);
  });

  it('records and rethrows when the producer throws', () => {
    const ring = createCommandRing(4);
    const producer = observeCommands(
      {
        source: CommandSource.Player,
        submit: () => {
          throw new Error('dispatcher exploded');
        },
      },
      ring,
      readers(),
    );

    expect(() => producer.submit(TILL)).toThrow('dispatcher exploded');
    // Swallowing it would be worse than not observing at all (AI_RULES §2.2),
    // and losing the record would hide the one command worth seeing.
    expect(ring.entries()[0]?.outcome).toBe(CommandOutcome.Failed);
    expect(ring.entries()[0]?.detail).toContain('dispatcher exploded');
  });
});

describe('observeExecutionFailure', () => {
  it('records a command that passed validation and failed a tick later', () => {
    const ring = createCommandRing(4);
    const onFailure = observeExecutionFailure(ring, readers(9, 1));

    onFailure(TILL, appError(ErrorCode.TileNotOwned, 'someone got there first'), metadata());

    expect(ring.entries()[0]).toMatchObject({
      type: 'tillTile',
      outcome: CommandOutcome.Failed,
      detail: ErrorCode.TileNotOwned,
      tick: 9,
    });
  });

  it('reports the source, so a worker’s failure is not read as the player’s', () => {
    const ring = createCommandRing(4);
    const onFailure = observeExecutionFailure(ring, readers());

    onFailure(
      TILL,
      appError(ErrorCode.TileNotOwned, 'race'),
      metadata({ source: CommandSource.Worker }),
    );

    expect(ring.entries()[0]?.source).toBe(CommandSource.Worker);
  });

  it('has no dispatch measurement to report, and says so rather than reporting zero', () => {
    const ring = createCommandRing(4);
    observeExecutionFailure(ring, readers())(
      TILL,
      appError(ErrorCode.TileNotOwned, 'x'),
      metadata(),
    );

    expect(ring.entries()[0]?.dispatchMs).toBeNull();
  });
});
