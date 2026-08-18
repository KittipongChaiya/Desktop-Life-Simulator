/**
 * Core content — the definitions themselves. Phase-08b.
 *
 * These are the v0.1 bodies moved out of `src/sim/content/` with one change:
 * each returns its definition table instead of registering it. ADR-019 §2 bounds
 * this migration to exactly that — "the four `registerCore*` functions keep
 * their bodies; only their call site and the surface they call through move" —
 * so every duration, price, and sprite below is the shipped one, and the
 * unmodified content suites are the proof.
 *
 * The numbers remain `GAME_DESIGN.md` §3.1's to change: a rebalance is a data
 * edit by the owning source, not a migration (ADR-004 §5).
 */

import { asContentId } from '../../src/shared/ids';
import {
  CORE_BUILDINGS,
  CORE_KITCHEN,
  CORE_MILL,
  type BuildingDefinition,
} from '../../src/sim/content/buildings';
import {
  CORE_CARROT,
  CORE_PUMPKIN,
  CORE_TURNIP,
  CORE_WHEAT,
  type CropDefinition,
} from '../../src/sim/content/crops';
import {
  CORE_BREAD,
  CORE_CARROT_SEED,
  CORE_FLOUR,
  CORE_PUMPKIN_SEED,
  CORE_TURNIP_SEED,
  CORE_WHEAT_SEED,
  DEFAULT_STACK_SIZE,
  type ItemDefinition,
} from '../../src/sim/content/items';
import { phaseTintId, type PhaseTintDefinition } from '../../src/sim/content/lighting';
import {
  CORE_BAKE_BREAD,
  CORE_GRIND_FLOUR,
  type RecipeDefinition,
} from '../../src/sim/content/recipes';
import {
  CORE_FARMHAND,
  CORE_GROUNDSKEEPER,
  CORE_HARVESTER,
  type RoleDefinition,
} from '../../src/sim/content/roles';
import {
  CORE_AUTUMN,
  CORE_SPRING,
  CORE_SUMMER,
  CORE_WINTER,
  type SeasonDefinition,
} from '../../src/sim/content/seasons';
import { soundId, type RegisteredSound } from '../../src/sim/content/sounds';
import {
  CORE_GRASS,
  CORE_PATH,
  CORE_STONE,
  CORE_WATER,
  type TileKindDefinition,
} from '../../src/sim/content/tile-kinds';
import { TOWN_BUILDINGS } from '../../src/sim/content/town';
import {
  CORE_CLEAR,
  CORE_RAIN,
  type WeatherKindDefinition,
} from '../../src/sim/content/weather-kinds';
import { DayPhase, secondsToTicks } from '../../src/sim/time/game-clock';
import { WorkerTaskKind } from '../../src/sim/world/worker';

/**
 * Registers the v0.1 crops.
 *
 * Durations match `GAME_DESIGN.md` §3.1 exactly. The ordering there is
 * load-bearing: longer crops must stay strictly more efficient per second, so
 * that going away is the optimal strategy (`GAME_DESIGN.md` §3.2). Rebalancing
 * must preserve it.
 *
 * REBALANCED IN 07.9: every duration DOUBLED — turnip 45 s → 90 s, and so on
 * down the table. Growth read as a progress bar rather than a crop; at 45 s a
 * turnip spent under 12 seconds in each of its four stages, which is less time
 * than a player takes to notice one. Doubling uniformly is deliberate: it
 * scales every crop's coins/sec by the same 0.5, so §3.2's inversion and the
 * whole shape of the curve survive untouched, and it is a DATA edit — prices,
 * yields and seed costs are not economy balance this pass may move.
 *
 * It changes no save: a crop stores `plantedTick` and derives the rest
 * (ADR-009 §2), so an existing farm's standing crops simply take the new time.
 */
export function coreCrops(): readonly CropDefinition[] {
  const crops: readonly CropDefinition[] = [
    {
      id: CORE_TURNIP,
      displayName: 'Turnip',
      growthTicks: secondsToTicks(90),
      stageSprites: ['crops:turnip_0', 'crops:turnip_1', 'crops:turnip_2', 'crops:turnip_3'],
      harvestYield: [{ item: asContentId('core:turnip'), quantity: 1 }],
      seedItem: asContentId('core:turnip_seed'),
      seedCost: 5,
      // YEAR-ROUND, and this is load-bearing rather than a tuning choice. The
      // turnip is `WORKER_DEFAULT_CROP`, so if it ever went out of season a
      // farm with no seed bin would have nothing to sow for a whole season —
      // a worker idled by the calendar, which ADR-021 §4 forbids outright.
      seasons: [],
      tags: ['root'],
    },
    {
      id: CORE_WHEAT,
      displayName: 'Wheat',
      growthTicks: secondsToTicks(240),
      stageSprites: ['crops:wheat_0', 'crops:wheat_1', 'crops:wheat_2', 'crops:wheat_3'],
      harvestYield: [{ item: asContentId('core:wheat'), quantity: 1 }],
      seedItem: asContentId('core:wheat_seed'),
      seedCost: 12,
      seasons: [CORE_SPRING, CORE_SUMMER],
      tags: ['grain'],
    },
    {
      id: CORE_CARROT,
      displayName: 'Carrot',
      growthTicks: secondsToTicks(480),
      stageSprites: ['crops:carrot_0', 'crops:carrot_1', 'crops:carrot_2', 'crops:carrot_3'],
      harvestYield: [{ item: asContentId('core:carrot'), quantity: 1 }],
      seedItem: asContentId('core:carrot_seed'),
      seedCost: 25,
      seasons: [CORE_SUMMER, CORE_AUTUMN],
      tags: ['root'],
    },
    {
      id: CORE_PUMPKIN,
      displayName: 'Pumpkin',
      growthTicks: secondsToTicks(1200),
      stageSprites: ['crops:pumpkin_0', 'crops:pumpkin_1', 'crops:pumpkin_2', 'crops:pumpkin_3'],
      harvestYield: [{ item: asContentId('core:pumpkin'), quantity: 1 }],
      seedItem: asContentId('core:pumpkin_seed'),
      seedCost: 60,
      seasons: [CORE_AUTUMN, CORE_WINTER],
      tags: ['gourd'],
    },
  ];
  return crops;
}

/**
 * Registers the v0.1 items — one per crop.
 *
 * Prices rise with growth time so the longer crops stay worth the wait
 * (`GAME_DESIGN.md` §3.2). The numbers are §3.1's, exactly.
 */
export function coreItems(): readonly ItemDefinition[] {
  const items: readonly ItemDefinition[] = [
    {
      id: CORE_TURNIP,
      displayName: 'Turnip',
      sprite: 'ui-world:item_turnip',
      basePrice: 12,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_WHEAT,
      displayName: 'Wheat',
      sprite: 'ui-world:item_wheat',
      basePrice: 34,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CARROT,
      displayName: 'Carrot',
      sprite: 'ui-world:item_carrot',
      basePrice: 80,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_PUMPKIN,
      displayName: 'Pumpkin',
      sprite: 'ui-world:item_pumpkin',
      basePrice: 230,
      stackSize: DEFAULT_STACK_SIZE,
    },
    // The processed goods (phase-25, ADR-035). Prices are PROVISIONAL and are
    // the balance decision `GAME_DESIGN.md` §12 reserves for content.
    //
    // The chain is deliberately worth more than its inputs — 4 wheat (136) →
    // 2 flour (170) → 1 bread (230), a 1.7× premium for four minutes of
    // machine time — because a chain that did not add value would be a
    // building with no reason to exist.
    //
    // WORTH FLAGGING RATHER THAN SLIPPING IN: v0.3 closed with "the premium
    // band is the only above-base coin in the game" (ADR-032/033). Processing
    // is a SECOND above-base source, and that is a real change to the economy's
    // shape rather than an incidental one. It belongs to v0.4 by design — the
    // version exists to make automation worth building — but the interaction
    // with contract premiums is unmeasured until the v0.4 RC prices them
    // together.
    {
      id: CORE_FLOUR,
      displayName: 'Flour',
      sprite: 'ui-world:item_flour',
      basePrice: 85,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_BREAD,
      displayName: 'Bread',
      sprite: 'ui-world:item_bread',
      basePrice: 230,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_TURNIP_SEED,
      displayName: 'Turnip Seeds',
      sprite: 'ui-world:item_turnip_seed',
      basePrice: 5,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_WHEAT_SEED,
      displayName: 'Wheat Seeds',
      sprite: 'ui-world:item_wheat_seed',
      basePrice: 12,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CARROT_SEED,
      displayName: 'Carrot Seeds',
      sprite: 'ui-world:item_carrot_seed',
      basePrice: 25,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_PUMPKIN_SEED,
      displayName: 'Pumpkin Seeds',
      sprite: 'ui-world:item_pumpkin_seed',
      basePrice: 60,
      stackSize: DEFAULT_STACK_SIZE,
    },
  ];
  return items;
}

/**
 * Registers the buildings: the `GAME_DESIGN.md` §5 farm table exactly, plus
 * the village's three (phase-18, ADR-030 §4). The town definitions carry
 * `playerPlaceable: false`, so the shop and `placeBuilding` never see them —
 * they exist so `foundTown` and the renderer can.
 */
export function coreBuildings(): readonly BuildingDefinition[] {
  return [...CORE_BUILDINGS, ...TOWN_BUILDINGS];
}

/**
 * Registers the v0.1 terrain set.
 *
 * Order is significant: it fixes each kind's dense numeric index, which the
 * tile grid stores. Appending is safe; reordering would reinterpret every
 * existing grid and every save.
 */
export function coreTileKinds(): readonly TileKindDefinition[] {
  const kinds: readonly TileKindDefinition[] = [
    { id: CORE_GRASS, walkable: true, tillable: true, moveCost: 1, sprite: 'terrain:grass' },
    { id: CORE_WATER, walkable: false, tillable: false, moveCost: 0, sprite: 'terrain:water' },
    { id: CORE_STONE, walkable: false, tillable: false, moveCost: 0, sprite: 'terrain:stone' },
    // Appended, so grass/water/stone keep their indices. A worker crosses a path
    // in 7 ticks vs 10 on grass (§2.2). No path-laying mechanic ships in v0.1;
    // the kind and its cost exist so movement honours paths when they arrive.
    { id: CORE_PATH, walkable: true, tillable: false, moveCost: 0.7, sprite: 'terrain:path' },
  ];
  return kinds;
}

/**
 * The day's tints. Phase-10c — ADR-020 §4.
 *
 * Four values chosen so the overlay reads as a time of day at a glance and
 * never obscures the farm. `VISION.md` §2.1 puts this window at the bottom of
 * a working desktop for eight hours, so night is a legible dim rather than a
 * dark screen — a player must be able to see a crop is ready at 3am without
 * waiting for dawn.
 *
 * Day is registered with zero alpha rather than omitted. An omitted phase means
 * "no content supplied a tint" and would leave whatever the previous phase
 * painted; an explicit transparent tint means "daylight is the absence of
 * tint", which is what it should transition TO at dawn.
 */
export function corePhaseTints(): readonly PhaseTintDefinition[] {
  const tints: readonly PhaseTintDefinition[] = [
    { id: phaseTintId('core', DayPhase.Dawn), phase: DayPhase.Dawn, color: 0xffb27a, alpha: 0.18 },
    { id: phaseTintId('core', DayPhase.Day), phase: DayPhase.Day, color: 0xffffff, alpha: 0 },
    { id: phaseTintId('core', DayPhase.Dusk), phase: DayPhase.Dusk, color: 0xff8c5a, alpha: 0.22 },
    { id: phaseTintId('core', DayPhase.Night), phase: DayPhase.Night, color: 0x1b2a6b, alpha: 0.4 },
  ];
  return tints;
}

/**
 * The four seasons. Phase-11a — ADR-021 §1.
 *
 * ORDER IS THE YEAR. Spring, summer, autumn, winter is the order this list is
 * registered in, and that is the only thing that makes it the order they occur
 * in — there is no `order` field to disagree with it. Appending a fifth season
 * is safe; reordering these four would give every new world a different year to
 * every world created before it, with nothing to catch it.
 *
 * Existing saves are immune either way: a world freezes the list at creation
 * (`world.seasons`).
 */
export function coreSeasons(): readonly SeasonDefinition[] {
  const seasons: readonly SeasonDefinition[] = [
    // Tints are multiplied over the terrain, so white is "leave it alone" and
    // every other value darkens. They are kept close to white on purpose: the
    // ground should read as the same farm in a different month, not as a
    // different biome, and `VISION.md` §2.1 puts this window beside real work
    // for hours at a time.
    { id: CORE_SPRING, displayName: 'Spring', tint: 0xffffff },
    { id: CORE_SUMMER, displayName: 'Summer', tint: 0xfff6dd },
    { id: CORE_AUTUMN, displayName: 'Autumn', tint: 0xffdcae },
    { id: CORE_WINTER, displayName: 'Winter', tint: 0xdde8ff },
  ];
  return seasons;
}

/**
 * The weather. Phase-12a — ADR-022 §1.
 *
 * Two kinds, because two is what wetness can currently tell apart: it rains or
 * it does not. Snow, wind and storms are in ADR-022 §2's table and are not
 * here, because each would be a kind whose declared modifiers nothing reads —
 * the dead-state problem that ADR was written about.
 *
 * WEIGHTS ARE PER SEASON, and the shape is the point: rain is common in spring
 * and autumn, rare in high summer, moderate in winter. A player who notices
 * that autumn is wet has read a real pattern rather than a random one.
 *
 * Order matters — selection walks this list — so appending a kind is safe and
 * reordering these two changes every world's weather history.
 */
export function coreWeatherKinds(): readonly WeatherKindDefinition[] {
  const kinds: readonly WeatherKindDefinition[] = [
    {
      id: CORE_CLEAR,
      displayName: 'Clear',
      weights: { [CORE_SPRING]: 60, [CORE_SUMMER]: 85, [CORE_AUTUMN]: 55, [CORE_WINTER]: 70 },
      rainfall: 0,
    },
    {
      id: CORE_RAIN,
      displayName: 'Rain',
      weights: { [CORE_SPRING]: 40, [CORE_SUMMER]: 15, [CORE_AUTUMN]: 45, [CORE_WINTER]: 30 },
      // One wetness unit per tick. The unit is defined by what reads it
      // (phase-12b), so this number is a rate, not a quantity.
      rainfall: 1,
    },
  ];
  return kinds;
}

/**
 * The shipped sounds, as content. Phase-13c — ADR-023 §3, ADR-019 §2.
 *
 * *"No capability ships that `plugins/core/` has not exercised."* This is
 * `registerAudio`'s first caller, so the capability is proven by first-party
 * use before any third party is invited to depend on it — the same rule that
 * made phase-08b move core content onto `registerContent`.
 *
 * THE GAINS AND CATEGORIES WERE READ OUT OF THE SHIPPED CATALOGUE BY SCRIPT,
 * not retyped. They are the MIX (`sounds.ts`'s header), balanced against
 * placeholders and meant to survive the asset swap, so a transcription slip
 * here would be a silent rebalance nobody could trace.
 *
 * THE ID AND THE ASSET KEY ARE NOT THE SAME STRING. A content id admits only
 * [a-z0-9_] (`shared/ids.ts`), while the catalogue key is a filename stem and
 * uses hyphens — so `core:ui_click` names the sound and `ui-click` names the
 * file. Collapsing them would have meant either an id the registry refuses or
 * renaming a shipped asset.
 *
 * The asset key is the catalogue key. ADR-016 §6's replacement path is
 * unchanged: dropping a real `.wav` into the source tree replaces a
 * placeholder with no code change.
 */
export function coreSounds(): readonly RegisteredSound[] {
  const sounds: readonly RegisteredSound[] = [
    { id: soundId('core', 'harvest'), category: 'world', gain: 0.35, asset: 'harvest' },
    { id: soundId('core', 'deposit'), category: 'world', gain: 0.3, asset: 'deposit' },
    { id: soundId('core', 'coin'), category: 'world', gain: 0.45, asset: 'coin' },
    { id: soundId('core', 'placement'), category: 'world', gain: 0.5, asset: 'placement' },
    { id: soundId('core', 'selection'), category: 'ui', gain: 0.25, asset: 'selection' },
    { id: soundId('core', 'ui_click'), category: 'ui', gain: 0.2, asset: 'ui-click' },
    { id: soundId('core', 'notification'), category: 'ui', gain: 0.5, asset: 'notification' },
    // The first AMBIENT registration (phase-13d). Proves the category is not
    // decorative: `registerAudio` has accepted 'ambient' since 13c and nothing
    // had ever used it, so until now an unknown-category refusal was the only
    // thing the ambient path had been exercised by.
    { id: soundId('core', 'rain'), category: 'ambient', gain: 0.18, asset: 'rain' },
    { id: soundId('core', 'error'), category: 'ui', gain: 0.6, asset: 'error' },
    { id: soundId('core', 'till'), category: 'world', gain: 0.28, asset: 'till' },
    { id: soundId('core', 'plant'), category: 'world', gain: 0.22, asset: 'plant' },
  ];
  return sounds;
}

/**
 * The shipped roles. Phase-14c — ADR-024 §2.
 *
 * Three, and each expresses one thing a player might actually want:
 * everything, harvesting only, or ground work only. A role is a NAMED
 * SCHEDULE, so shipping them costs no mechanism — they are the same four
 * fields the constraint vocabulary already had.
 *
 * `core:farmhand` declares no constraints at all, which makes it the identity
 * role rather than a special case: assigning it returns a worker to exactly
 * the behaviour a new hire has.
 *
 * None declares a zone, and none can: a zone is a set of tile indices, which
 * are facts about one farm. A role that named them would be wrong on every
 * world but the author's.
 */
export function coreRoles(): readonly RoleDefinition[] {
  const roles: readonly RoleDefinition[] = [
    { id: CORE_FARMHAND, displayName: 'Farmhand' },
    {
      id: CORE_HARVESTER,
      displayName: 'Harvester',
      taskKinds: [WorkerTaskKind.Harvest],
    },
    {
      id: CORE_GROUNDSKEEPER,
      displayName: 'Groundskeeper',
      taskKinds: [WorkerTaskKind.Till, WorkerTaskKind.Plant],
      priority: [WorkerTaskKind.Till],
    },
  ];
  return roles;
}

/**
 * The v0.4 production chain. Phase-25 — ADR-035.
 *
 * Three steps deep on purpose: raw crop → processed good → something better
 * again, which is what `PLAN.md` §5 asks a chain to demonstrate. Two steps
 * would prove a factory works; three proves that one factory's output being
 * another's input needs no machinery beyond the recipes themselves
 * (ADR-035 §7 — nothing in the model knows what a chain is).
 *
 * Each recipe NAMES its building rather than being listed by it, which is what
 * lets a content pack add `barleymod:grind_barley` to `core:mill` without
 * editing anything here (ADR-035 §1).
 *
 * Craft times are provisional, and chosen against the crop that feeds them:
 * wheat matures in 4,800 ticks, so a 1,200-tick grind means one mill keeps
 * pace with roughly four wheat tiles, and a 2,400-tick bake means one kitchen
 * consumes two mills. Those ratios are the interesting part of the balance and
 * are the numbers to move when the v0.4 RC prices the chain properly.
 */
export function coreRecipes(): readonly RecipeDefinition[] {
  const recipes: readonly RecipeDefinition[] = [
    {
      id: CORE_GRIND_FLOUR,
      displayName: 'Grind Flour',
      building: CORE_MILL,
      inputs: [{ item: CORE_WHEAT, quantity: 2 }],
      outputs: [{ item: CORE_FLOUR, quantity: 1 }],
      craftTicks: secondsToTicks(60),
    },
    {
      id: CORE_BAKE_BREAD,
      displayName: 'Bake Bread',
      building: CORE_KITCHEN,
      inputs: [{ item: CORE_FLOUR, quantity: 2 }],
      outputs: [{ item: CORE_BREAD, quantity: 1 }],
      craftTicks: secondsToTicks(120),
    },
  ];
  return recipes;
}
