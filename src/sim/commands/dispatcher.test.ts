/**
 * Command dispatcher tests. Phase-03.5, ADR-010.
 *
 * The lifecycle under test is VALIDATE → QUEUE → (tick boundary) → EXECUTE →
 * PUBLISH. The two properties that matter most and are asserted hardest:
 *
 *   1. dispatch NEVER mutates the world (ADR-010 §2)
 *   2. a rejected command publishes nothing and leaves the world identical
 */

import { describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '../../shared/errors';
import { toIndexUnchecked } from '../../shared/geometry';
import { CORE_STORAGE_SHED } from '../content/buildings';
import { CORE_TURNIP, CORE_WHEAT } from '../content/crops';
import { CORE_TURNIP_SEED, CORE_WHEAT_SEED, DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation, stepSimulationBy } from '../tick';
import { addItems } from '../world/container';
import { addCoins } from '../world/wallet';
import { createWorld, type World } from '../world/world';

import { registerCropCommands } from './crop-commands';
import { createCommandDispatcher } from './dispatcher';
import { CommandSource, type Command } from './types';

const OWNED = toIndexUnchecked(30, 30) as number;
const OTHER = toIndexUnchecked(29, 29) as number;
const OUTSIDE = toIndexUnchecked(2, 2) as number;

const till = (tile: number): Command => ({ type: 'tillTile', tile });
const plant = (tile: number, cropId: string): Command => ({ type: 'plantCrop', tile, cropId });
const harvest = (tile: number): Command => ({ type: 'harvestCrop', tile });
const place = (tile: number, buildingId: string): Command => ({
  type: 'placeBuilding',
  tile,
  buildingId,
});

const PLAYER = { source: CommandSource.Player } as const;

/** Dispatches through the world's own dispatcher. */
function send(world: World, command: Command) {
  return world.commands.dispatch(command, PLAYER);
}

/** Stocks the farm — planting consumes seeds (06b), so plant commands need them. */
function stockSeeds(world: World): void {
  addItems(world.inventory, CORE_TURNIP_SEED, 20, DEFAULT_STACK_SIZE);
  addItems(world.inventory, CORE_WHEAT_SEED, 20, DEFAULT_STACK_SIZE);
}

/** A world with `OWNED` already tilled, via the command path, and seeds in stock. */
function tilledWorld(seed = 1): World {
  const world = createWorld(seed);
  stockSeeds(world);
  send(world, till(OWNED));
  stepSimulation(world);
  return world;
}

describe('dispatch: acceptance', () => {
  it('accepts a well-formed command', () => {
    const world = createWorld(1);
    expect(send(world, till(OWNED)).ok).toBe(true);
  });

  it('queues the command instead of applying it', () => {
    const world = createWorld(1);
    send(world, till(OWNED));

    expect(world.commands.pending()).toBe(1);
    expect(world.tiles.tilledAt[OWNED]).toBe(0);
  });

  it('leaves the world byte-identical during dispatch', () => {
    const world = tilledWorld();
    const before = JSON.stringify([...world.crops.entries()]);

    send(world, plant(OWNED, CORE_WHEAT));

    expect(JSON.stringify([...world.crops.entries()])).toBe(before);
    expect(world.crops.size).toBe(0);
  });

  it('publishes no events at dispatch time', () => {
    const world = tilledWorld();
    send(world, plant(OWNED, CORE_WHEAT));

    expect(world.events.pending()).toBe(0);
  });
});

describe('dispatch: rejection', () => {
  it('rejects an unknown command type', () => {
    const world = createWorld(1);
    const result = world.commands.dispatch({ type: 'noSuchCommand' } as unknown as Command, PLAYER);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InvalidIntent);
  });

  it('rejects a malformed content id without throwing', () => {
    const world = tilledWorld();
    const result = send(world, plant(OWNED, 'not a content id'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.UnknownContent);
  });

  it('rejects an out-of-bounds tile', () => {
    const world = createWorld(1);
    const result = send(world, till(999_999));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.TileOutOfBounds);
  });

  it('rejects a tile outside the owned plot', () => {
    const world = createWorld(1);
    const result = send(world, till(OUTSIDE));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.TileNotOwned);
  });

  it('rejects tilling a tile that is already tilled', () => {
    const world = tilledWorld();
    const result = send(world, till(OWNED));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.TileWrongKind);
  });

  it('queues nothing when rejected', () => {
    const world = createWorld(1);
    send(world, till(OUTSIDE));

    expect(world.commands.pending()).toBe(0);
  });

  it('publishes nothing when rejected, even after a full tick', () => {
    const world = createWorld(1);
    send(world, plant(OWNED, CORE_WHEAT)); // untilled
    send(world, harvest(OWNED)); // empty

    expect(world.events.pending()).toBe(0);
    stepSimulation(world);
    expect(world.cropStats.planted).toBe(0);
    expect(world.cropStats.harvested).toBe(0);
  });
});

describe('preview: legality without queuing', () => {
  // The build ghost asks "is this legal here?" on every hover. `preview` runs
  // the same validator `dispatch` runs (no second rule set, ADR-010 §6) but
  // queues nothing and touches nothing.
  it('reports a legal command as ok', () => {
    const world = createWorld(1);
    addCoins(world.wallet, 200); // placement charges since 06c
    expect(world.commands.preview(place(OWNED, CORE_STORAGE_SHED)).ok).toBe(true);
  });

  it('reports an illegal command as not ok', () => {
    const world = createWorld(1);
    expect(world.commands.preview(place(OUTSIDE, CORE_STORAGE_SHED)).ok).toBe(false);
  });

  it('reports an unregistered command type as not ok', () => {
    const world = createWorld(1);
    const result = world.commands.preview({ type: 'noSuchCommand' } as unknown as Command);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InvalidIntent);
  });

  it('queues nothing and leaves the world untouched', () => {
    const world = createWorld(1);
    world.commands.preview(place(OWNED, CORE_STORAGE_SHED));

    expect(world.commands.pending()).toBe(0);
    expect(world.buildings.size).toBe(0);
    // `blocked` is a packed bitfield; no bit anywhere was set.
    expect(world.tiles.blocked.every((byte) => byte === 0)).toBe(true);
  });

  it('agrees with what dispatch would accept', () => {
    // The two paths must never diverge: a tile the ghost paints valid must
    // dispatch, and one it paints invalid must reject.
    const world = createWorld(1);
    expect(world.commands.preview(place(OWNED, CORE_STORAGE_SHED)).ok).toBe(
      world.commands.dispatch(place(OWNED, CORE_STORAGE_SHED), PLAYER).ok,
    );
  });
});

describe('queued execution on the tick boundary', () => {
  it('applies the command on the next tick, not before', () => {
    const world = createWorld(1);
    send(world, till(OWNED));

    expect(world.tiles.tilledAt[OWNED]).toBe(0);
    stepSimulation(world);
    expect(world.tiles.tilledAt[OWNED]).toBeGreaterThan(0);
  });

  it('drains the queue completely', () => {
    const world = createWorld(1);
    send(world, till(OWNED));
    send(world, till(OTHER));

    stepSimulation(world);
    expect(world.commands.pending()).toBe(0);
  });

  it('executes in dispatch order within one tick', () => {
    // Publish order IS execution order: a handler publishes as it runs and the
    // bus delivers in publish order (ADR-008). Dispatching OTHER first and
    // asserting it is published first is a direct read of FIFO execution.
    const world = createWorld(1);
    stockSeeds(world);
    send(world, till(OWNED));
    send(world, till(OTHER));
    stepSimulation(world);

    const planted: number[] = [];
    world.events.subscribe('cropPlanted', (event) => planted.push(event.tile));

    send(world, plant(OTHER, CORE_WHEAT));
    send(world, plant(OWNED, CORE_TURNIP));
    stepSimulation(world);

    expect(planted).toEqual([OTHER, OWNED]);
  });

  it('validates at dispatch against committed state, not the pending queue', () => {
    // Validation is PURE and reads the world as it is (ADR-010 §3), so a
    // command whose precondition only a still-queued command would satisfy is
    // rejected outright. The caller re-issues once the till has landed. This
    // is the deliberate cost of immediate, side-effect-free feedback.
    const world = createWorld(1);
    expect(send(world, till(OWNED)).ok).toBe(true);
    expect(send(world, plant(OWNED, CORE_WHEAT)).ok).toBe(false);
  });

  it('rejects at execution when the world changed after dispatch', () => {
    // Two-stage validation (ADR-010 §3): both plants pass dispatch validation
    // because the tile is empty at dispatch time; only the first can execute.
    const world = tilledWorld();
    expect(send(world, plant(OWNED, CORE_WHEAT)).ok).toBe(true);
    expect(send(world, plant(OWNED, CORE_TURNIP)).ok).toBe(true);

    stepSimulation(world);
    expect(world.crops.size).toBe(1);
    expect(world.crops.get(OWNED as never)?.cropId).toBe(CORE_WHEAT);
  });

  it('reports an execution-time rejection rather than swallowing it', () => {
    const world = tilledWorld();
    const onExecutionRejected = vi.fn();
    const dispatcher = createCommandDispatcher(() => world, { onExecutionRejected });
    registerCropCommands(dispatcher);

    dispatcher.dispatch(plant(OWNED, CORE_WHEAT), PLAYER);
    dispatcher.dispatch(plant(OWNED, CORE_TURNIP), PLAYER);
    dispatcher.drain();

    expect(onExecutionRejected).toHaveBeenCalledTimes(1);
  });

  it('converts a throwing handler into a rejection without aborting the tick', () => {
    const world = createWorld(1);
    const onExecutionRejected = vi.fn();
    const dispatcher = createCommandDispatcher(() => world, { onExecutionRejected });
    dispatcher.register('tillTile', {
      validate: () => ({ ok: true, value: undefined }),
      execute: () => {
        throw new Error('handler bug');
      },
    });

    dispatcher.dispatch(till(OWNED), PLAYER);
    expect(() => dispatcher.drain()).not.toThrow();
    expect(onExecutionRejected).toHaveBeenCalledTimes(1);
  });
});

describe('event publication', () => {
  it('publishes only after execution, and delivers on the tick flush', () => {
    const world = tilledWorld();
    const received: number[] = [];
    world.events.subscribe('cropPlanted', (event) => received.push(event.tile));

    send(world, plant(OWNED, CORE_WHEAT));
    expect(received).toHaveLength(0);

    stepSimulation(world);
    expect(received).toEqual([OWNED]);
  });

  it('reaches the built-in consumer with no manual flush', () => {
    const world = tilledWorld();
    send(world, plant(OWNED, CORE_WHEAT));
    stepSimulation(world);

    expect(world.cropStats.planted).toBe(1);
  });

  it('publishes harvest yields once the crop is mature', () => {
    const world = tilledWorld();
    send(world, plant(OWNED, CORE_WHEAT));
    stepSimulationBy(world, 2401);

    const yields: { item: string; quantity: number }[] = [];
    world.events.subscribe('cropHarvested', (event) => yields.push(...event.yields));

    send(world, harvest(OWNED));
    stepSimulation(world);

    expect(yields).toEqual([{ item: 'core:wheat', quantity: 1 }]);
  });
});

describe('command metadata', () => {
  it('assigns monotonically increasing ids', () => {
    const world = createWorld(1);
    const first = send(world, till(OWNED));
    const second = send(world, till(OTHER));

    if (!first.ok || !second.ok) throw new Error('setup failed');
    expect(second.value.id).toBe(first.value.id + 1);
  });

  it('records the dispatching source verbatim', () => {
    const world = createWorld(1);
    const result = world.commands.dispatch(till(OWNED), { source: CommandSource.Worker });

    if (!result.ok) throw new Error('setup failed');
    expect(result.value.source).toBe(CommandSource.Worker);
  });

  it('records the tick the command was dispatched on', () => {
    const world = createWorld(1);
    stepSimulationBy(world, 5);
    const result = send(world, till(OWNED));

    if (!result.ok) throw new Error('setup failed');
    expect(result.value.dispatchedTick).toBe(5);
  });

  it('does not consume an id for a rejected command', () => {
    const world = createWorld(1);
    send(world, till(OUTSIDE)); // rejected
    const accepted = send(world, till(OWNED));

    if (!accepted.ok) throw new Error('setup failed');
    expect(accepted.value.id).toBe(1);
  });
});

describe('duplicate command protection', () => {
  it('rejects a second command carrying a pending key', () => {
    const world = createWorld(1);
    expect(world.commands.dispatch(till(OWNED), { ...PLAYER, key: 'till-30-30' }).ok).toBe(true);

    const duplicate = world.commands.dispatch(till(OWNED), { ...PLAYER, key: 'till-30-30' });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe(ErrorCode.DuplicateCommand);
  });

  it('queues only the first of a duplicate pair', () => {
    const world = createWorld(1);
    world.commands.dispatch(till(OWNED), { ...PLAYER, key: 'k' });
    world.commands.dispatch(till(OWNED), { ...PLAYER, key: 'k' });

    expect(world.commands.pending()).toBe(1);
  });

  it('allows the key again once the queue has drained', () => {
    const world = createWorld(1);
    world.commands.dispatch(till(OWNED), { ...PLAYER, key: 'k' });
    stepSimulation(world);

    expect(world.commands.dispatch(till(OTHER), { ...PLAYER, key: 'k' }).ok).toBe(true);
  });

  it('does not deduplicate commands dispatched without a key', () => {
    const world = createWorld(1);
    send(world, till(OWNED));
    send(world, till(OWNED));

    expect(world.commands.pending()).toBe(2);
  });
});

describe('world wiring (phase-03.6)', () => {
  it('routes execution-time rejections to a handler injected at construction', () => {
    // Feedback is injected through the construction boundary, never a mutable
    // setter: the world's dependencies are fixed once it exists. The handler
    // takes only domain types, so no UI shape reaches the simulation.
    const reasons: string[] = [];
    const world = createWorld(1, {
      onExecutionRejected: (_command, error) => reasons.push(error.code),
    });
    stockSeeds(world);

    send(world, till(OWNED));
    stepSimulation(world);

    // Both pass dispatch validation; only the first can execute.
    send(world, plant(OWNED, CORE_WHEAT));
    send(world, plant(OWNED, CORE_TURNIP));
    stepSimulation(world);

    expect(reasons).toEqual([ErrorCode.TileWrongKind]);
  });

  it('works without options, as every existing caller constructs it', () => {
    const world = createWorld(1);
    send(world, till(OWNED));

    expect(() => stepSimulation(world)).not.toThrow();
  });
});

describe('serialization safety (ADR-010 §5)', () => {
  it('round-trips every command shape through JSON unchanged', () => {
    const commands: Command[] = [till(OWNED), plant(OWNED, CORE_WHEAT), harvest(OWNED)];

    for (const command of commands) {
      expect(JSON.parse(JSON.stringify(command)) as Command).toEqual(command);
    }
  });

  it('carries only primitive fields — no closures, no store references', () => {
    for (const command of [till(OWNED), plant(OWNED, CORE_WHEAT), harvest(OWNED)]) {
      for (const value of Object.values(command)) {
        expect(['string', 'number', 'boolean']).toContain(typeof value);
      }
    }
  });

  it('keeps metadata serializable', () => {
    const world = createWorld(1);
    const result = send(world, till(OWNED));

    if (!result.ok) throw new Error('setup failed');
    expect(JSON.parse(JSON.stringify(result.value)) as unknown).toEqual(result.value);
  });
});

describe('deterministic replay (ADR-010 §5)', () => {
  /** seed + ordered command stream — the whole replay format. */
  const STREAM: readonly Command[] = [
    till(OWNED),
    till(OTHER),
    plant(OWNED, CORE_WHEAT),
    plant(OTHER, CORE_TURNIP),
  ];

  function replay(seed: number): World {
    const world = createWorld(seed);
    for (const command of STREAM) {
      world.commands.dispatch(command, { source: CommandSource.Replay });
      stepSimulation(world);
    }
    stepSimulationBy(world, 950);
    world.commands.dispatch(harvest(OTHER), { source: CommandSource.Replay });
    stepSimulation(world);
    return world;
  }

  const snapshot = (world: World): string =>
    JSON.stringify({
      tick: world.tick,
      crops: [...world.crops.entries()].sort(([a], [b]) => a - b),
      tilled: [...world.tiles.tilledAt],
      stats: world.cropStats,
      rng: world.rng.getState(),
    });

  it('produces identical world state from the same seed and stream', () => {
    expect(snapshot(replay(42))).toBe(snapshot(replay(42)));
  });

  it('produces different state from a different seed only where the seed matters', () => {
    // Crops are seed-independent; the RNG stream is not. Asserting both keeps
    // the determinism test honest rather than trivially true.
    const a = replay(1);
    const b = replay(2);

    expect([...a.crops.entries()]).toEqual([...b.crops.entries()]);
    expect(a.rng.getState()).not.toEqual(b.rng.getState());
  });

  it('assigns identical command ids across identical runs', () => {
    // Metadata must reproduce too, or a replay's own record of itself would
    // differ from the original run. Ids come from a counter, never a clock.
    const ids = (seed: number): number[] => {
      const world = createWorld(seed);
      stockSeeds(world);
      const collected: number[] = [];
      for (const command of STREAM) {
        const result = world.commands.dispatch(command, { source: CommandSource.Replay });
        if (result.ok) collected.push(result.value.id);
        stepSimulation(world);
      }
      return collected;
    };

    expect(ids(42)).toEqual([1, 2, 3, 4]);
    expect(ids(42)).toEqual(ids(42));
  });
});
