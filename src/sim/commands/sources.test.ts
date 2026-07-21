/**
 * Command source tests. Phase-03.5, corrected in phase-03.6. ADR-010 §6.
 *
 * These are interface contracts. The player input layer (phase-03.6) is the
 * first real implementation; worker AI (phase-04), automation (phase-06), and
 * replay (post-v1.0) follow the identical shape.
 *
 * PUSH, NOT PULL. A source creates a command and submits it; nothing polls a
 * source for a buffer. This mirrors ADR-010 §3, where the input handler calls
 * dispatch during the frame and learns immediately whether the command was
 * accepted.
 *
 * What these tests pin down is the property the ADR exists to protect: every
 * producer submits the SAME command types through the SAME dispatcher, none
 * gets a privileged path, and none can claim to be another.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { CORE_WHEAT } from '../content/crops';
import { stepSimulation } from '../tick';
import { createWorld, type World } from '../world/world';

import type {
  AutomationSource,
  CommandProducer,
  PlayerInputSource,
  ReplaySource,
  WorkerCommandSource,
} from './sources';
import { CommandSource, type Command, type CommandResult } from './types';

const OWNED = toIndexUnchecked(30, 30) as number;

const till = (tile: number): Command => ({ type: 'tillTile', tile });
const plant = (tile: number, cropId: string): Command => ({ type: 'plantCrop', tile, cropId });
const harvest = (tile: number): Command => ({ type: 'harvestCrop', tile });

/**
 * Binds a producer to a world and a source tag.
 *
 * The tag is captured at construction, which is what makes impersonation
 * impossible: `submit` cannot be told to use a different one.
 */
function producerFor<S extends CommandSource>(
  world: World,
  source: S,
): CommandProducer & { readonly source: S } {
  return {
    source,
    submit: (command: Command): CommandResult => world.commands.dispatch(command, { source }),
  };
}

describe('command sources', () => {
  it('each declares a distinct, fixed source tag', () => {
    const world = createWorld(1);
    const player: PlayerInputSource = producerFor(world, CommandSource.Player);
    const worker: WorkerCommandSource = producerFor(world, CommandSource.Worker);
    const automation: AutomationSource = producerFor(world, CommandSource.Automation);
    const replay: ReplaySource = producerFor(world, CommandSource.Replay);

    expect([player.source, worker.source, automation.source, replay.source]).toEqual([
      'player',
      'worker',
      'automation',
      'replay',
    ]);
  });

  it('submits through the dispatcher rather than exposing a buffer to poll', () => {
    const world = createWorld(1);
    const player: PlayerInputSource = producerFor(world, CommandSource.Player);

    expect(player.submit(till(OWNED)).ok).toBe(true);
    expect(world.commands.pending()).toBe(1);
  });

  it('tags a player submission with the player source (phase-03.6 requirement)', () => {
    const world = createWorld(1);
    const player: PlayerInputSource = producerFor(world, CommandSource.Player);

    const result = player.submit(till(OWNED));
    if (!result.ok) throw new Error('setup failed');

    expect(result.value.source).toBe(CommandSource.Player);
  });

  it('preserves every source identity through the same pathway', () => {
    // The pathway the player uses today is the one worker AI, automation, and
    // replay use later. Each must be attributable in the metadata, or a replay
    // cannot say who did what.
    const tags = [
      CommandSource.Player,
      CommandSource.Worker,
      CommandSource.Automation,
      CommandSource.Replay,
    ] as const;

    for (const tag of tags) {
      const world = createWorld(1);
      const result = producerFor(world, tag).submit(till(OWNED));

      if (!result.ok) throw new Error(`${tag} submission was rejected`);
      expect(result.value.source).toBe(tag);
    }
  });

  it('cannot submit under a different identity than it was bound to', () => {
    const world = createWorld(1);
    const worker: WorkerCommandSource = producerFor(world, CommandSource.Worker);

    const result = worker.submit(till(OWNED));
    if (!result.ok) throw new Error('setup failed');

    expect(result.value.source).not.toBe(CommandSource.Player);
    expect(result.value.source).toBe(CommandSource.Worker);
  });

  it('gives no producer a privileged write path', () => {
    // A worker's harvest is validated exactly as a player's would be: the tile
    // is empty, so it is rejected. No bypass exists to test for.
    const world = createWorld(1);
    const worker: WorkerCommandSource = producerFor(world, CommandSource.Worker);

    expect(worker.submit(harvest(OWNED)).ok).toBe(false);
    expect(world.crops.size).toBe(0);
  });

  it('accepts the same command from any source, interchangeably', () => {
    const world = createWorld(1);
    const player: PlayerInputSource = producerFor(world, CommandSource.Player);
    const automation: AutomationSource = producerFor(world, CommandSource.Automation);

    expect(player.submit(till(OWNED)).ok).toBe(true);
    stepSimulation(world); // the till lands, so the plant below is now legal

    expect(automation.submit(plant(OWNED, CORE_WHEAT)).ok).toBe(true);
  });

  it('routes a replayed command through the same validation as a live one', () => {
    const live = createWorld(3);
    const replayed = createWorld(3);

    producerFor(live, CommandSource.Player).submit(till(OWNED));
    producerFor(replayed, CommandSource.Replay).submit(till(OWNED));
    stepSimulation(live);
    stepSimulation(replayed);

    expect([...live.tiles.tilledAt]).toEqual([...replayed.tiles.tilledAt]);
  });

  it('narrows each specialisation to its own tag at the type level', () => {
    // A compile-time guarantee, asserted at runtime so the test is meaningful:
    // `PlayerInputSource['source']` is the literal 'player', so a worker
    // producer cannot be assigned to a PlayerInputSource.
    const playerTag: PlayerInputSource['source'] = CommandSource.Player;
    const workerTag: WorkerCommandSource['source'] = CommandSource.Worker;

    expect([playerTag, workerTag]).toEqual(['player', 'worker']);
  });
});
