/**
 * Command source tests. Phase-03.5, ADR-010 §6.
 *
 * These are interface contracts, not implementations — the player UI
 * (phase-05), worker AI (phase-04), automation (phase-06), and replay
 * (post-v1.0) each arrive later. What is testable NOW, and what these tests
 * pin down, is the property the ADR exists to protect: every producer emits
 * the SAME command type through the SAME dispatcher, and none of them can
 * claim to be another.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { CORE_WHEAT } from '../content/crops';
import { stepSimulation } from '../tick';
import { createWorld } from '../world/world';

import type {
  AutomationSource,
  PlayerInputSource,
  ReplaySource,
  WorkerCommandSource,
} from './sources';
import { CommandSource, type Command } from './types';

const OWNED = toIndexUnchecked(30, 30) as number;

const player: PlayerInputSource = {
  source: CommandSource.Player,
  take: () => [{ type: 'tillTile', tile: OWNED }],
};

const worker: WorkerCommandSource = {
  source: CommandSource.Worker,
  take: () => [{ type: 'harvestCrop', tile: OWNED }],
};

const automation: AutomationSource = {
  source: CommandSource.Automation,
  take: () => [{ type: 'plantCrop', tile: OWNED, cropId: CORE_WHEAT }],
};

const replay: ReplaySource = {
  source: CommandSource.Replay,
  take: () => [{ type: 'tillTile', tile: OWNED }],
};

describe('command sources', () => {
  it('each declares a distinct, fixed source tag', () => {
    expect([player.source, worker.source, automation.source, replay.source]).toEqual([
      'player',
      'worker',
      'automation',
      'replay',
    ]);
  });

  it('all produce plain Command values, interchangeable at the dispatcher', () => {
    // The point of the ADR: an automation's command is indistinguishable in
    // kind from the player's. Both are Command; both go through dispatch.
    const world = createWorld(1);

    const fromPlayer: Command[] = [...player.take()];
    for (const command of fromPlayer) {
      expect(world.commands.dispatch(command, { source: player.source }).ok).toBe(true);
    }
    stepSimulation(world); // the till lands, so the plant below is now legal

    const fromAutomation: Command[] = [...automation.take()];
    for (const command of fromAutomation) {
      expect(world.commands.dispatch(command, { source: automation.source }).ok).toBe(true);
    }
  });

  it('gives no producer a privileged write path', () => {
    // A worker's harvest is validated exactly as a player's would be: the tile
    // is empty, so it is rejected. No bypass exists to test for.
    const world = createWorld(1);
    const [command] = worker.take();
    if (command === undefined) throw new Error('setup failed');

    const result = world.commands.dispatch(command, { source: CommandSource.Worker });
    expect(result.ok).toBe(false);
    expect(world.crops.size).toBe(0);
  });

  it('routes a replayed command through the same validation as a live one', () => {
    const live = createWorld(3);
    const replayed = createWorld(3);

    for (const command of player.take()) {
      live.commands.dispatch(command, { source: CommandSource.Player });
    }
    for (const command of replay.take()) {
      replayed.commands.dispatch(command, { source: CommandSource.Replay });
    }
    stepSimulation(live);
    stepSimulation(replayed);

    expect([...live.tiles.tilledAt]).toEqual([...replayed.tiles.tilledAt]);
  });
});
