/**
 * Player command source tests. Phase-03.6.
 *
 * This is the FIRST real implementation of a `CommandProducer` (ADR-010 §6).
 * What it has to prove is that the player reaches the simulation through the
 * ordinary dispatcher — no shortcut, no privileged API — and that its
 * submissions are attributable, so worker AI, automation, and replay can use
 * the identical pathway later and remain distinguishable in the record.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { CommandSource, type Command } from '../../sim/commands/types';
import { stepSimulation } from '../../sim/tick';
import { createWorld } from '../../sim/world/world';

import { createPlayerInputSource } from './command-dispatch';

const OWNED = toIndexUnchecked(30, 30) as number;
const till = (tile: number): Command => ({ type: 'tillTile', tile });

describe('player command source', () => {
  it('declares the player source tag', () => {
    const world = createWorld(1);
    expect(createPlayerInputSource(world.commands).source).toBe(CommandSource.Player);
  });

  it('tags every submission as the player source', () => {
    const world = createWorld(1);
    const player = createPlayerInputSource(world.commands);

    const result = player.submit(till(OWNED));
    if (!result.ok) throw new Error('setup failed');

    expect(result.value.source).toBe(CommandSource.Player);
  });

  it('queues rather than applying, like every other source', () => {
    const world = createWorld(1);
    const player = createPlayerInputSource(world.commands);

    player.submit(till(OWNED));
    expect(world.tiles.tilledAt[OWNED]).toBe(0);

    stepSimulation(world);
    expect(world.tiles.tilledAt[OWNED]).toBeGreaterThan(0);
  });

  it('reports a rejection to the caller rather than throwing', () => {
    const world = createWorld(1);
    const player = createPlayerInputSource(world.commands);
    const outside = toIndexUnchecked(2, 2) as number;

    const result = player.submit(till(outside));
    expect(result.ok).toBe(false);
    expect(world.commands.pending()).toBe(0);
  });

  it('gets no privileged path — the same validation applies', () => {
    const world = createWorld(1);
    const player = createPlayerInputSource(world.commands);

    // Harvesting empty ground is rejected for the player exactly as it would
    // be for a worker. There is no bypass to test for.
    expect(player.submit({ type: 'harvestCrop', tile: OWNED }).ok).toBe(false);
    expect(world.crops.size).toBe(0);
  });
});
