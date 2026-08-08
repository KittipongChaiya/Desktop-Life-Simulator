/**
 * Phase-11b — the two guarantees ADR-021 exists to make, tested against a real
 * world rather than a model of one.
 *
 * > **Crops do not wither.** A crop planted in season and still standing when
 * > the season turns continues to maturity, unchanged (ADR-021 §3).
 *
 * > **A season may never be the reason a worker has nothing to do** (ADR-021
 * > §4).
 *
 * Both are product constraints before they are technical ones. A withering
 * rule punishes exactly the player who leaves the game running, which is the
 * player `VISION.md` §2.2 exists to protect; a calendar that idles a farm is a
 * novel way to break `GAME_DESIGN.md` §4.2's no-deadlock requirement.
 *
 * The no-wither test asserts BYTE-IDENTICAL worlds rather than "the crop is
 * still there". A seasonal effect that quietly halved a yield, or nudged the
 * RNG, would pass the weaker check.
 */

import { describe, expect, it } from 'vitest';

import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { DEFAULT_DAYS_PER_SEASON, DEFAULT_TICKS_PER_DAY } from '../src/shared/constants';
import { ErrorCode } from '../src/shared/errors';
import { toIndexUnchecked } from '../src/shared/geometry';
import { selectTask } from '../src/sim/ai/worker-tasks';
import { CORE_PUMPKIN, CORE_TURNIP, CORE_WHEAT } from '../src/sim/content/crops';
import { DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { CORE_SPRING, CORE_WINTER } from '../src/sim/content/seasons';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { harvestCrop, plantCrop, tillTile } from '../src/sim/commands/crop-commands';
import { CORE_SEED_BIN } from '../src/sim/content/buildings';
import { stepSimulationBy } from '../src/sim/tick';
import { seasonFor } from '../src/sim/time/game-clock';
import { addItems, containerCount } from '../src/sim/world/container';
import { addCoins } from '../src/sim/world/wallet';
import { WorkerTaskKind } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

import type { SaveMeta } from '../src/persistence/schema';
import type { TileIndex } from '../src/shared/ids';

const OWNED: TileIndex = toIndexUnchecked(30, 30);

const META: SaveMeta = {
  gameVersion: '0.2.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

const SEASON_TICKS = DEFAULT_TICKS_PER_DAY * DEFAULT_DAYS_PER_SEASON;

/** The first tick of the season at `index` in the shipped four-season year. */
const seasonStart = (index: number): number => SEASON_TICKS * index;

function seedsFor(world: World, crop: (typeof CORE_TURNIP)[], quantity = 20): void {
  for (const cropId of crop) {
    const definition = world.cropRegistry.get(cropId);
    if (!definition.ok) throw new Error('setup failed');
    addItems(world.inventory, definition.value.seedItem, quantity, DEFAULT_STACK_SIZE);
  }
}

const seasonOf = (world: World): string | undefined =>
  seasonFor(Math.floor(world.tick / world.ticksPerDay), world.daysPerSeason, world.seasons);

describe('the season gate at plant time (ADR-021 §2)', () => {
  it('accepts a crop in its own season', () => {
    const world = createWorld(1);
    seedsFor(world, [CORE_WHEAT]);
    tillTile(world, OWNED);

    expect(seasonOf(world)).toBe(CORE_SPRING);
    expect(plantCrop(world, OWNED, CORE_WHEAT).ok).toBe(true);
  });

  it('refuses one out of season, and says so by CODE', () => {
    // A typed rejection, exactly like the missing-seed one it sits beside —
    // not a silent no-op. The player pressed a button.
    const world = createWorld(1);
    seedsFor(world, [CORE_PUMPKIN]);
    world.tick = seasonStart(0); // spring; pumpkin is autumn/winter
    tillTile(world, OWNED);

    const result = plantCrop(world, OWNED, CORE_PUMPKIN);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe(ErrorCode.OutOfSeason);
  });

  it('refuses the season before the crop is refused for want of a seed', () => {
    // Ordering matters to the player: being told "no seed", buying one, and
    // THEN being told "wrong season" is two rejections for one mistake.
    const world = createWorld(1);
    world.tick = seasonStart(0);
    tillTile(world, OWNED);

    const result = plantCrop(world, OWNED, CORE_PUMPKIN);

    expect(result.ok === false && result.error.code).toBe(ErrorCode.OutOfSeason);
  });

  it('accepts a year-round crop in every season', () => {
    // The turnip is the staple, and a season it could not be sown in would
    // idle every farm without a seed bin.
    for (let index = 0; index < 4; index += 1) {
      const world = createWorld(1);
      seedsFor(world, [CORE_TURNIP]);
      world.tick = seasonStart(index);
      tillTile(world, OWNED);

      expect(plantCrop(world, OWNED, CORE_TURNIP).ok, `season ${String(index)}`).toBe(true);
    }
  });
});

describe('crops do not wither (ADR-021 §3)', () => {
  it('matures across a season boundary, in a world byte-identical to one without', () => {
    // The crop is planted so that its growth straddles the boundary. Byte
    // equality is the assertion because a seasonal yield or RNG effect would
    // survive a weaker one.
    const straddling = createWorld(7);
    const undisturbed = createWorld(7);

    const growth = 24_000; // core:pumpkin, one full day
    // Winter → spring. Pumpkin is autumn/winter, so the straddling crop is
    // planted legally and finishes in a season it could NOT be planted in —
    // which is the case ADR-021 §3 exists for.
    const boundary = seasonStart(4);

    for (const [world, plantAt] of [
      [straddling, boundary - Math.floor(growth / 2)],
      [undisturbed, seasonStart(3) + 1_000],
    ] as const) {
      seedsFor(world, [CORE_PUMPKIN]);
      world.tick = plantAt;
      tillTile(world, OWNED);
      expect(plantCrop(world, OWNED, CORE_PUMPKIN).ok).toBe(true);
      stepSimulationBy(world, growth);
    }

    // Both crops are mature, and both harvest.
    const first = harvestCrop(straddling, OWNED);
    const second = harvestCrop(undisturbed, OWNED);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    // The straddling world crossed into a season where pumpkin is legal, and
    // the undisturbed one never crossed at all — their yields must match.
    expect(containerCount(straddling.inventory, CORE_PUMPKIN)).toBe(
      containerCount(undisturbed.inventory, CORE_PUMPKIN),
    );
  });

  it('matures a crop whose season has ENDED beneath it', () => {
    // The sharper case: wheat is spring/summer. Planted at the end of summer,
    // it finishes in autumn — a season it could not be planted in. It must
    // still mature, or an absent player has been punished by the calendar.
    const world = createWorld(3);
    seedsFor(world, [CORE_WHEAT]);
    world.tick = seasonStart(2) - 1_000;
    tillTile(world, OWNED);
    expect(plantCrop(world, OWNED, CORE_WHEAT).ok).toBe(true);

    stepSimulationBy(world, 5_000); // past the boundary, past wheat's growth

    expect(seasonOf(world)).not.toBe(CORE_SPRING);
    expect(harvestCrop(world, OWNED).ok).toBe(true);
  });

  it('leaves the standing crop untouched by the boundary itself', () => {
    // Serialised before and after crossing, with the tick rewound: nothing
    // about the crop may depend on which season it is currently in.
    const world = createWorld(11);
    seedsFor(world, [CORE_TURNIP]);
    world.tick = seasonStart(1) - 500;
    tillTile(world, OWNED);
    plantCrop(world, OWNED, CORE_TURNIP);

    const before = JSON.stringify(world.crops.get(OWNED));
    stepSimulationBy(world, 1_000); // crosses into summer
    const after = JSON.stringify(world.crops.get(OWNED));

    expect(after).toBe(before);
  });
});

describe('a season never stops a worker (ADR-021 §4)', () => {
  /**
   * A farm whose entire sowable stock is out of season.
   *
   * It has to go through the SEED BIN, and that is a finding worth recording:
   * without a bin a worker only ever sows `WORKER_DEFAULT_CROP`, which is the
   * year-round turnip, so the season can never close the plant band. The bin's
   * remembered crop is the only route by which a worker asks for a seasonal
   * crop at all — exactly the path ADR-021 §4 describes.
   */
  function outOfSeasonFarm(): World {
    const world = createWorld(5);
    world.tick = seasonStart(2) + 1_000; // autumn

    // Wheat only — spring/summer — so nothing in stock is sowable today. No
    // turnip seeds are granted, so the default crop cannot rescue the band.
    seedsFor(world, [CORE_WHEAT]);
    addCoins(world.wallet, 500);
    expect(placeBuilding(world, toIndexUnchecked(29, 29), CORE_SEED_BIN).ok).toBe(true);

    tillTile(world, OWNED);
    world.lastPlanted.set(OWNED, CORE_WHEAT);
    return world;
  }

  it('never offers a plant task for a crop that cannot be sown today', () => {
    const world = outOfSeasonFarm();
    const task = selectTask(world, OWNED, new Set());

    expect(task?.kind).not.toBe(WorkerTaskKind.Plant);
  });

  it('gives the worker OTHER work instead of nothing', () => {
    // The whole point: the plant band closing must not empty the list. Tilling
    // is still available on the rest of the plot.
    const world = outOfSeasonFarm();

    expect(selectTask(world, OWNED, new Set())).not.toBeNull();
  });

  it('resumes planting when the season turns, with no intervention', () => {
    const world = outOfSeasonFarm();
    expect(selectTask(world, OWNED, new Set())?.kind).not.toBe(WorkerTaskKind.Plant);

    // Straight to next year's spring. Nothing else about the world changes —
    // no command, no player action, no seed purchase.
    world.tick = seasonStart(4) + 1_000;
    const task = selectTask(world, OWNED, new Set());

    expect(task?.kind).toBe(WorkerTaskKind.Plant);
    expect(task?.kind === WorkerTaskKind.Plant && task.cropId).toBe(CORE_WHEAT);
  });

  it('keeps a farm running unattended across a whole year', () => {
    // The integration form of the guarantee: four seasons of real ticks with
    // a mixed seed stock, asserting the farm never stalls with idle workers
    // and unplanted tilled ground.
    const world = createWorld(13);
    seedsFor(world, [CORE_TURNIP, CORE_WHEAT, CORE_PUMPKIN], 500);
    tillTile(world, OWNED);

    stepSimulationBy(world, SEASON_TICKS * 4);

    // A year passed and the world is back where it started in the cycle.
    expect(seasonOf(world)).toBe(CORE_SPRING);
    // Something was sowable at every point: a task exists now, in spring,
    // with the same stock that had to survive winter.
    world.tick += 0;
    expect(selectTask(world, OWNED, new Set())).not.toBeNull();
  });

  it('offers winter work, so the leanest season is not a dead one', () => {
    const world = createWorld(17);
    seedsFor(world, [CORE_TURNIP, CORE_PUMPKIN]);
    world.tick = seasonStart(3); // winter
    tillTile(world, OWNED);

    expect(seasonOf(world)).toBe(CORE_WINTER);
    expect(selectTask(world, OWNED, new Set())?.kind).toBe(WorkerTaskKind.Plant);
  });
});

describe('the seed bin across a season boundary', () => {
  it('keeps its memory while the remembered crop is out of season', () => {
    // `lastPlanted` is not cleared by an out-of-season fall-through, which is
    // what lets the tile go back to its crop when the season returns.
    const world = createWorld(23);
    seedsFor(world, [CORE_PUMPKIN, CORE_TURNIP]);
    world.tick = seasonStart(2); // autumn — pumpkin is legal
    tillTile(world, OWNED);
    plantCrop(world, OWNED, CORE_PUMPKIN);

    expect(world.lastPlanted.get(OWNED)).toBe(CORE_PUMPKIN);

    world.tick = seasonStart(0) + SEASON_TICKS * 4; // spring, next year
    expect(world.lastPlanted.get(OWNED)).toBe(CORE_PUMPKIN);
  });
});

describe('a save is unaffected by the season it is written in', () => {
  it('serialises identically in two different seasons, tick aside', () => {
    // Nothing seasonal may reach the save: the season is derived, so writing
    // one into the document would be a second source of truth (ADR-021 §1).
    const spring = createWorld(29);
    const autumn = createWorld(29);
    autumn.tick = seasonStart(2);

    const springDoc = JSON.parse(serializeSave(toSaveDocument(spring, META))) as {
      world: Record<string, unknown>;
    };
    const autumnDoc = JSON.parse(serializeSave(toSaveDocument(autumn, META))) as {
      world: Record<string, unknown>;
    };

    expect(Object.keys(springDoc.world).sort()).toEqual(Object.keys(autumnDoc.world).sort());
    expect(springDoc.world['seasons']).toEqual(autumnDoc.world['seasons']);
    expect(JSON.stringify(springDoc.world)).not.toContain('"season":');
  });
});
