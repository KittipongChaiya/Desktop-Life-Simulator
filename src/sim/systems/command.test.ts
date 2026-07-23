/**
 * Command system tests. Phase-03.5, ADR-010 §3.
 *
 * The system's placement is the decision under test: commands drain FIRST, in
 * `preUpdate`, so an action lands on the tick it was dispatched for and every
 * later system in the same tick observes its effect.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { CommandSource } from '../commands/types';
import { CORE_WHEAT } from '../content/crops';
import { CORE_WHEAT_SEED, DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation, tickOrder } from '../tick';
import { addItems } from '../world/container';
import { createWorld } from '../world/world';

const OWNED = toIndexUnchecked(30, 30) as number;

describe('commandSystem placement', () => {
  it('runs first of all systems', () => {
    expect(tickOrder()[0]).toBe('command');
  });

  it('runs before the event flush, so a command event lands in the same tick', () => {
    const order = tickOrder();
    expect(order.indexOf('command')).toBeLessThan(order.indexOf('eventFlush'));
  });

  it('runs before the snapshot, so views never observe a half-applied command', () => {
    const order = tickOrder();
    expect(order.indexOf('command')).toBeLessThan(order.indexOf('snapshot'));
  });
});

describe('commandSystem execution', () => {
  it('applies a queued command and flushes its event in the same tick', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT_SEED, 1, DEFAULT_STACK_SIZE); // planting consumes a seed (06b)
    world.commands.dispatch({ type: 'tillTile', tile: OWNED }, { source: CommandSource.Player });
    stepSimulation(world);

    world.commands.dispatch(
      { type: 'plantCrop', tile: OWNED, cropId: CORE_WHEAT },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    // Executed in preUpdate, consumed by cropStats in postUpdate — one tick.
    expect(world.crops.size).toBe(1);
    expect(world.cropStats.planted).toBe(1);
  });

  it('is a no-op on a tick with an empty queue', () => {
    const world = createWorld(1);
    expect(() => stepSimulation(world)).not.toThrow();
    expect(world.commands.pending()).toBe(0);
  });
});
