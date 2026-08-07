/**
 * The command boundary refuses malformed fields. Phase-08.0d — ADR-010 §5.
 *
 * A command's fields are UNTRUSTED. They arrive as plain numbers and strings
 * from the renderer, from the developer console, from a replayed command log —
 * and in v0.2 from plugin code, which ADR-003 §3 says to treat as hostile. Each
 * command module therefore parses its raw fields before validation, and those
 * parse guards were the single largest block of untested branches left in
 * `src/sim`.
 *
 * The property is uniform and is what every case below asserts: **a malformed
 * field is a typed rejection, never a throw and never a mutation.** A guard that
 * throws crashes the tick for everyone; a guard that lets a bad index through
 * reaches a `Uint8Array` write at a negative offset. Neither may happen, and
 * `world.rng` must not advance either — a refused command that consumed
 * randomness would desynchronise two players from the same seed (ADR-007).
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { CORE_STORAGE_SHED } from '../content/buildings';
import { CORE_WHEAT } from '../content/crops';
import { stepSimulation } from '../tick';
import { addCoins } from '../world/wallet';
import { createWorld, type World } from '../world/world';

import { CommandSource } from './types';
import type { Command } from './types';

const CENTER = toIndexUnchecked(32, 32);

/** A funded world, so affordability is never the reason for a rejection. */
function fundedWorld(): World {
  const world = createWorld(1);
  addCoins(world.wallet, 10_000);
  return world;
}

/** Dispatches and returns the verdict, without stepping. */
function attempt(world: World, command: Command): ReturnType<World['commands']['dispatch']> {
  return world.commands.dispatch(command, { source: CommandSource.Player });
}

/**
 * Every shape of malformed numeric field a command can carry.
 *
 * `-1` and a huge value are the out-of-bounds pair; the fractional and
 * non-finite values are what a computed screen-to-tile conversion produces when
 * something upstream divides by zero.
 */
const MALFORMED_NUMBERS = [-1, 4096, 1_000_000, 2.5, Number.NaN, Number.POSITIVE_INFINITY];

const MALFORMED_IDS = ['', 'wheat', ':wheat', 'core:', 'core:wheat:extra', 'CORE:WHEAT'];

describe('malformed tile indices are refused, not applied', () => {
  const withTile = (tile: number): Command[] => [
    { type: 'tillTile', tile },
    { type: 'plantCrop', tile, cropId: CORE_WHEAT },
    { type: 'harvestCrop', tile },
    { type: 'placeBuilding', tile, buildingId: CORE_STORAGE_SHED },
  ];

  it('rejects every command carrying an out-of-range or non-integer tile', () => {
    for (const tile of MALFORMED_NUMBERS) {
      for (const command of withTile(tile)) {
        const world = fundedWorld();
        const result = attempt(world, command);
        expect(result.ok, `${command.type} @ ${tile}`).toBe(false);
      }
    }
  });

  it('leaves the world untouched — no building, no crop, no coins spent', () => {
    const world = fundedWorld();
    const coins = world.wallet.coins;

    for (const tile of MALFORMED_NUMBERS) {
      for (const command of withTile(tile)) attempt(world, command);
    }
    stepSimulation(world);

    expect(world.buildings.size).toBe(0);
    expect(world.crops.size).toBe(0);
    expect(world.wallet.coins).toBe(coins);
  });

  it('does not advance the RNG, so a refused command cannot desynchronise a seed', () => {
    const world = fundedWorld();
    const before = world.rng.getState();

    for (const tile of MALFORMED_NUMBERS) {
      for (const command of withTile(tile)) attempt(world, command);
    }

    expect(world.rng.getState()).toEqual(before);
  });
});

describe('malformed content ids are refused', () => {
  it('rejects a plantCrop whose crop id is not `namespace:name`', () => {
    for (const cropId of MALFORMED_IDS) {
      const world = fundedWorld();
      const result = attempt(world, { type: 'plantCrop', tile: CENTER, cropId });
      expect(result.ok, cropId).toBe(false);
    }
  });

  it('rejects a placeBuilding whose building id is not `namespace:name`', () => {
    for (const buildingId of MALFORMED_IDS) {
      const world = fundedWorld();
      const result = attempt(world, { type: 'placeBuilding', tile: CENTER, buildingId });
      expect(result.ok, buildingId).toBe(false);
    }
  });

  it('rejects a well-formed id that names content nobody registered', () => {
    // Both refuse, and both under ErrorCode.UnknownContent — only the MESSAGE
    // separates "your id is malformed" from "your dependency is missing".
    //
    // Worth knowing before phase-08 puts a plugin author on the other end of
    // these errors (ADR-019): a loader that branches on the code alone cannot
    // tell a manifest typo from an unmet dependency, and those want different
    // advice. Pinned here as shipped behaviour, not endorsed — changing it is
    // a phase-08 decision with this test to prompt it.
    const world = fundedWorld();
    const malformed = attempt(world, { type: 'plantCrop', tile: CENTER, cropId: 'wheat' });
    const unknown = attempt(world, { type: 'plantCrop', tile: CENTER, cropId: 'mod:moon_melon' });

    expect([malformed.ok, unknown.ok]).toEqual([false, false]);
    if (!malformed.ok && !unknown.ok) {
      expect(malformed.error.code).toBe(unknown.error.code);
      expect(malformed.error.message).not.toBe(unknown.error.message);
    }
  });

  it('rejects buying seeds of an unregistered crop', () => {
    const world = fundedWorld();
    expect(attempt(world, { type: 'buySeeds', cropId: 'mod:absent', quantity: 1 }).ok).toBe(false);
  });

  it('rejects selling an item nobody registered', () => {
    const world = fundedWorld();
    expect(attempt(world, { type: 'sellItems', item: 'mod:absent', quantity: 1 }).ok).toBe(false);
  });
});

describe('malformed entity ids are refused', () => {
  it('rejects a sellBuilding whose building id is not a positive integer', () => {
    for (const building of [0, -1, 2.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      const world = fundedWorld();
      expect(attempt(world, { type: 'sellBuilding', building }).ok, `${building}`).toBe(false);
    }
  });

  it('rejects selling a building id that is well formed but absent', () => {
    const world = fundedWorld();
    expect(attempt(world, { type: 'sellBuilding', building: 999 }).ok).toBe(false);
  });

  it('refuses a bogus depositWorker at EXECUTION, not dispatch — and never throws', () => {
    // `depositWorker` registers `validate: () => ok()`, so unlike every other
    // command here it is admitted to the queue and refused when it runs. That
    // asymmetry is deliberate — the worker AI issues it against a target chosen
    // a tick earlier, and the world may have moved underneath it — but it means
    // dispatch returning `ok` is NOT a statement that the worker exists.
    //
    // What has to hold is the same either way: a bad id changes nothing and
    // does not take the tick down with it.
    const world = fundedWorld();
    const coins = world.wallet.coins;

    for (const worker of [0, -1, 2.5, Number.NaN, 999]) {
      expect(attempt(world, { type: 'depositWorker', worker, storage: null }).ok, `${worker}`).toBe(
        true,
      );
    }

    expect(() => stepSimulation(world)).not.toThrow();
    expect(world.inventory.stacks).toEqual([]);
    expect(world.workers.size).toBe(0);
    expect(world.wallet.coins).toBe(coins);
  });
});

describe('malformed quantities are refused', () => {
  it('rejects non-positive and non-integer quantities on both trade commands', () => {
    for (const quantity of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const world = fundedWorld();
      const buy = attempt(world, { type: 'buySeeds', cropId: CORE_WHEAT, quantity });
      const sell = attempt(world, { type: 'sellItems', item: CORE_WHEAT, quantity });
      expect([buy.ok, sell.ok], `${quantity}`).toEqual([false, false]);
    }
  });
});

describe('an unknown command type is refused rather than ignored', () => {
  it('rejects a command nobody registered', () => {
    const world = fundedWorld();
    const result = attempt(world, { type: 'teleport', tile: CENTER } as unknown as Command);
    expect(result.ok).toBe(false);
  });
});
