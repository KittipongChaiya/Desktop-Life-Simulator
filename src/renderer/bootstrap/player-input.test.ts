/**
 * Player input tests. Phase-03.6.
 *
 * THE INPUT LAYER DECIDES INTENT, NEVER RULES. These tests are written to fail
 * if that ever stops being true: clicking an illegal tile must still produce a
 * command and still be rejected by the simulation, because the moment the input
 * layer starts pre-checking "is this tile tilled", the player and worker AI are
 * running two different rule sets and will drift.
 *
 * Interaction state is presentation state. It never reaches `World`, so mouse
 * movement cannot influence the tick (ADR-007 §1).
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asContentId } from '../../shared/ids';
import { CommandSource } from '../../sim/commands/types';
import { CORE_WHEAT } from '../../sim/content/crops';
import { DEFAULT_STACK_SIZE } from '../../sim/content/items';
import { stepSimulation } from '../../sim/tick';
import { addItems } from '../../sim/world/container';
import { createWorld, type World } from '../../sim/world/world';
import { createToolSelection } from '../app/tool-selection';

import { createPlayerInputSource } from './command-dispatch';
import { commandFor, createPlayerInput, Tool, toolForKey, type PlayerInput } from './player-input';

const OWNED = toIndexUnchecked(30, 30);
const OUTSIDE = toIndexUnchecked(2, 2);

function inputFor(world: World): PlayerInput {
  return createPlayerInput({
    tools: createToolSelection(),
    source: createPlayerInputSource(world.commands),
    seed: () => CORE_WHEAT,
  });
}

describe('tool selection (GAME_DESIGN §8.3)', () => {
  it('maps the number keys to their tools', () => {
    expect(toolForKey('1')).toBe(Tool.Hoe);
    expect(toolForKey('2')).toBe(Tool.Seed);
    expect(toolForKey('4')).toBe(Tool.Hand);
  });

  it('leaves the watering can unbound — no command backs it in v0.1', () => {
    expect(toolForKey('3')).toBeNull();
  });

  it('ignores every other key', () => {
    for (const key of ['0', '5', 'a', 'Enter', ' ']) expect(toolForKey(key)).toBeNull();
  });

  it('starts with no tool selected', () => {
    expect(inputFor(createWorld(1)).state().tool).toBeNull();
  });

  it('selects and clears a tool', () => {
    const input = inputFor(createWorld(1));

    input.selectTool(Tool.Hoe);
    expect(input.state().tool).toBe(Tool.Hoe);

    input.selectTool(null); // Esc
    expect(input.state().tool).toBeNull();
  });
});

describe('intent mapping', () => {
  it('maps each tool to its command, and nothing else', () => {
    expect(commandFor(Tool.Hoe, OWNED, CORE_WHEAT)).toEqual({ type: 'tillTile', tile: OWNED });
    expect(commandFor(Tool.Seed, OWNED, CORE_WHEAT)).toEqual({
      type: 'plantCrop',
      tile: OWNED,
      cropId: CORE_WHEAT,
    });
    expect(commandFor(Tool.Hand, OWNED, CORE_WHEAT)).toEqual({
      type: 'harvestCrop',
      tile: OWNED,
    });
  });

  it('carries the selected seed into a plant command', () => {
    const turnip = asContentId('core:turnip');
    expect(commandFor(Tool.Seed, OWNED, turnip)).toEqual({
      type: 'plantCrop',
      tile: OWNED,
      cropId: turnip,
    });
  });
});

describe('clicking', () => {
  it('submits nothing when no tool is selected', () => {
    const world = createWorld(1);
    const input = inputFor(world);

    expect(input.click(OWNED)).toBeNull();
    expect(world.commands.pending()).toBe(0);
  });

  it('submits the command for the selected tool, tagged as the player', () => {
    const world = createWorld(1);
    const input = inputFor(world);
    input.selectTool(Tool.Hoe);

    const result = input.click(OWNED);
    if (result === null || !result.ok) throw new Error('expected an accepted command');

    expect(result.value.source).toBe(CommandSource.Player);
    expect(world.commands.pending()).toBe(1);
  });

  it('applies the command on the next tick, never during the click', () => {
    const world = createWorld(1);
    const input = inputFor(world);
    input.selectTool(Tool.Hoe);

    input.click(OWNED);
    expect(world.tiles.tilledAt[OWNED]).toBe(0);

    stepSimulation(world);
    expect(world.tiles.tilledAt[OWNED]).toBeGreaterThan(0);
  });

  it('records the clicked tile as the selection', () => {
    const world = createWorld(1);
    const input = inputFor(world);
    input.selectTool(Tool.Hoe);

    input.click(OWNED);
    expect(input.state().selected).toBe(OWNED);
  });

  it('still submits an illegal action and lets validation reject it', () => {
    // The load-bearing test. The input layer does not know that OUTSIDE is
    // unowned, and must not learn: rules live in command validation, so the
    // player and worker AI cannot drift apart.
    const world = createWorld(1);
    const input = inputFor(world);
    input.selectTool(Tool.Hoe);

    const result = input.click(OUTSIDE);
    expect(result?.ok).toBe(false);
    expect(world.commands.pending()).toBe(0);
  });

  it('completes the manual loop through the command path alone', () => {
    const world = createWorld(1);
    // Planting consumes a seed (phase-06b); stock one so the loop can close.
    const wheat = world.cropRegistry.get(CORE_WHEAT);
    if (!wheat.ok) throw new Error('setup failed');
    addItems(world.inventory, wheat.value.seedItem, 1, DEFAULT_STACK_SIZE);
    const input = inputFor(world);

    input.selectTool(Tool.Hoe);
    input.click(OWNED);
    stepSimulation(world);

    input.selectTool(Tool.Seed);
    input.click(OWNED);
    stepSimulation(world);
    expect(world.crops.get(OWNED)?.cropId).toBe(CORE_WHEAT);

    // Grown from the definition, never a literal: §3.1 durations move.
    for (let i = 0; i < wheat.value.growthTicks; i += 1) stepSimulation(world);

    input.selectTool(Tool.Hand);
    input.click(OWNED);
    stepSimulation(world);

    expect(world.crops.size).toBe(0);
    expect(world.cropStats.harvested).toBe(1);
  });
});

describe('hover is presentation state', () => {
  it('tracks and clears the hovered tile', () => {
    const input = inputFor(createWorld(1));

    input.hover(OWNED);
    expect(input.state().hovered).toBe(OWNED);

    input.hover(null);
    expect(input.state().hovered).toBeNull();
  });

  it('never reaches the world — hovering queues nothing and does not tick', () => {
    const world = createWorld(1);
    const input = inputFor(world);
    input.selectTool(Tool.Hoe);

    for (let i = 0; i < 50; i += 1) input.hover(toIndexUnchecked(30, 30));

    expect(world.commands.pending()).toBe(0);
    expect(world.tick).toBe(0);
  });

  it('produces an identical world from an identical click sequence', () => {
    // Hover noise differs between the two runs; only clicks may matter.
    const run = (hoverNoise: number): World => {
      const world = createWorld(7);
      const input = inputFor(world);

      input.selectTool(Tool.Hoe);
      for (let i = 0; i < hoverNoise; i += 1) input.hover(toIndexUnchecked(29 + (i % 3), 30));
      input.click(OWNED);
      stepSimulation(world);
      return world;
    };

    expect([...run(0).tiles.tilledAt]).toEqual([...run(37).tiles.tilledAt]);
  });
});
