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
  CORE_LOOM,
  CORE_MILL,
  CORE_PRESERVING_SHED,
  type BuildingDefinition,
} from '../../src/sim/content/buildings';
import {
  CORE_CABBAGE,
  CORE_CARROT,
  CORE_CORN,
  CORE_FLAX,
  CORE_LEEK,
  CORE_PEA,
  CORE_PUMPKIN,
  CORE_SQUASH,
  CORE_STRAWBERRY,
  CORE_TOMATO,
  CORE_TURNIP,
  CORE_WHEAT,
  type CropDefinition,
} from '../../src/sim/content/crops';
import {
  CORE_ASHFELL,
  CORE_HIGHLANDS,
  CORE_OLD_QUARRY,
  CORE_RIVER_DELTA,
  CORE_SUNKEN_COAST,
  CORE_THORNWOOD,
  type ExpeditionDestination,
} from '../../src/sim/content/expeditions';
import {
  CORE_BREAD,
  CORE_CARROT as CORE_CARROT_ITEM,
  CORE_CARROT_SEED,
  CORE_CLOTH,
  CORE_CORNMEAL,
  CORE_FLOUR,
  CORE_JAM,
  CORE_LINEN_FIBRE,
  CORE_ORE,
  CORE_PORRIDGE,
  CORE_SAUCE,
  CORE_THREAD,
  CORE_ORE as CORE_ORE_ITEM,
  CORE_STONE as CORE_STONE_ITEM,
  CORE_TURNIP as CORE_TURNIP_ITEM,
  CORE_WOOD,
  CORE_PUMPKIN_SEED,
  CORE_CABBAGE as CORE_CABBAGE_ITEM,
  CORE_CABBAGE_SEED,
  CORE_CORN as CORE_CORN_ITEM,
  CORE_CORN_SEED,
  CORE_FLAX as CORE_FLAX_ITEM,
  CORE_FLAX_SEED,
  CORE_LEEK as CORE_LEEK_ITEM,
  CORE_LEEK_SEED,
  CORE_PEA as CORE_PEA_ITEM,
  CORE_PEA_SEED,
  CORE_SQUASH as CORE_SQUASH_ITEM,
  CORE_SQUASH_SEED,
  CORE_STRAWBERRY as CORE_STRAWBERRY_ITEM,
  CORE_STRAWBERRY_SEED,
  CORE_TOMATO as CORE_TOMATO_ITEM,
  CORE_TOMATO_SEED,
  CORE_TURNIP_SEED,
  CORE_WHEAT as CORE_WHEAT_ITEM,
  CORE_WHEAT_SEED,
  DEFAULT_STACK_SIZE,
  type ItemDefinition,
} from '../../src/sim/content/items';
import { phaseTintId, type PhaseTintDefinition } from '../../src/sim/content/lighting';
import {
  CORE_BAKE_BREAD,
  CORE_COOK_PORRIDGE,
  CORE_GRIND_CORNMEAL,
  CORE_GRIND_FLOUR,
  CORE_MAKE_JAM,
  CORE_MAKE_SAUCE,
  CORE_RET_FLAX,
  CORE_SPIN_THREAD,
  CORE_WEAVE_CLOTH,
  type RecipeDefinition,
} from '../../src/sim/content/recipes';
import {
  CORE_ORE as CORE_ORE_NODE,
  CORE_STONE_NODE,
  CORE_TIMBER,
  type ResourceNodeDefinition,
} from '../../src/sim/content/resource-nodes';
import {
  CORE_FARMHAND,
  CORE_FORAGER,
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

    // ── The v0.6 eight (phase-55 — ADR-046 R-01/R-02) ───────────────────────
    //
    // THE NUMBERS ARE DERIVED, NOT CHOSEN. `GAME_DESIGN.md` §3.2 is the single
    // most important balance decision in the game: longer crops must yield
    // strictly better coins-per-second, because that is what makes going away
    // the optimal strategy — `VISION.md` §2.2 expressed as arithmetic. The four
    // v0.1 crops trace a curve, and fitting it gives
    //
    //     profit/sec  =  0.078 x (seconds / 90) ^ 0.23
    //
    // to within a few percent at every existing point. Each crop below takes
    // its growth time and its seed cost, and its sale price is whatever that
    // curve requires. Nothing here was tuned by feel, and §3.2's ordering is
    // preserved across all twelve crops rather than merely inside the new ones.
    //
    // WHAT MAKES A SEASON A CHOICE, given that §3.2 fixes the rate ordering.
    // It cannot be "which crop earns more" — §3.2 settles that permanently. So
    // the axis is CAPITAL, which §3.2 already names as the counterweight:
    // within a season, the crops differ in how much money you must have before
    // you can plant one. The leek is the deliberate demonstration — same growth
    // time as wheat, the same profit per second to four decimal places, half
    // the seed cost and a lower sale price. A player with 6 coins plants leeks;
    // a player with 12 plants wheat and makes more per trip to the market.
    //
    // R-02 checks this held: zero crops are strictly dominated in any season,
    // on all three of rate, value-per-harvest and seed cost.
    {
      id: CORE_PEA,
      displayName: 'Pea',
      growthTicks: secondsToTicks(60),
      stageSprites: ['crops:pea_0', 'crops:pea_1', 'crops:pea_2', 'crops:pea_3'],
      harvestYield: [{ item: asContentId('core:pea'), quantity: 1 }],
      seedItem: asContentId('core:pea_seed'),
      seedCost: 3,
      // The cheapest thing in the game, and the fastest. Spring only: it is the
      // crop a player with almost nothing plants in their first minutes.
      seasons: [CORE_SPRING],
      tags: ['legume'],
    },
    {
      id: CORE_STRAWBERRY,
      displayName: 'Strawberry',
      growthTicks: secondsToTicks(150),
      stageSprites: [
        'crops:strawberry_0',
        'crops:strawberry_1',
        'crops:strawberry_2',
        'crops:strawberry_3',
      ],
      harvestYield: [{ item: asContentId('core:strawberry'), quantity: 1 }],
      seedItem: asContentId('core:strawberry_seed'),
      seedCost: 8,
      seasons: [CORE_SPRING, CORE_SUMMER],
      tags: ['fruit'],
    },
    {
      id: CORE_LEEK,
      displayName: 'Leek',
      growthTicks: secondsToTicks(240),
      stageSprites: ['crops:leek_0', 'crops:leek_1', 'crops:leek_2', 'crops:leek_3'],
      harvestYield: [{ item: asContentId('core:leek'), quantity: 1 }],
      seedItem: asContentId('core:leek_seed'),
      // HALF WHEAT'S SEED COST at exactly wheat's growth time and profit rate.
      // This is the capital axis stated as plainly as it can be: the leek is
      // never better and never worse, it is only cheaper to start.
      seedCost: 6,
      seasons: [CORE_SPRING, CORE_WINTER],
      tags: ['allium'],
    },
    {
      id: CORE_FLAX,
      displayName: 'Flax',
      growthTicks: secondsToTicks(300),
      stageSprites: ['crops:flax_0', 'crops:flax_1', 'crops:flax_2', 'crops:flax_3'],
      harvestYield: [{ item: asContentId('core:flax'), quantity: 1 }],
      seedItem: asContentId('core:flax_seed'),
      seedCost: 14,
      seasons: [CORE_SPRING, CORE_AUTUMN],
      // `fibre` is what phase 56's cloth chain asks for by tag rather than by
      // id — the reason `tags` exists at all (`crops.ts`: v0.3 contracts ask
      // for "a root vegetable" without editing the interface).
      tags: ['fibre'],
    },
    {
      id: CORE_TOMATO,
      displayName: 'Tomato',
      growthTicks: secondsToTicks(400),
      stageSprites: ['crops:tomato_0', 'crops:tomato_1', 'crops:tomato_2', 'crops:tomato_3'],
      harvestYield: [{ item: asContentId('core:tomato'), quantity: 1 }],
      seedItem: asContentId('core:tomato_seed'),
      seedCost: 20,
      seasons: [CORE_SUMMER],
      tags: ['fruit'],
    },
    {
      id: CORE_CORN,
      displayName: 'Corn',
      growthTicks: secondsToTicks(600),
      stageSprites: ['crops:corn_0', 'crops:corn_1', 'crops:corn_2', 'crops:corn_3'],
      harvestYield: [{ item: asContentId('core:corn'), quantity: 1 }],
      seedItem: asContentId('core:corn_seed'),
      seedCost: 32,
      seasons: [CORE_SUMMER, CORE_AUTUMN],
      // The second grain, which is what gives the Mill a reason to exist past
      // one recipe (ADR-046 R-04).
      tags: ['grain'],
    },
    {
      id: CORE_CABBAGE,
      displayName: 'Cabbage',
      growthTicks: secondsToTicks(750),
      stageSprites: ['crops:cabbage_0', 'crops:cabbage_1', 'crops:cabbage_2', 'crops:cabbage_3'],
      harvestYield: [{ item: asContentId('core:cabbage'), quantity: 1 }],
      seedItem: asContentId('core:cabbage_seed'),
      seedCost: 38,
      seasons: [CORE_AUTUMN, CORE_WINTER],
      tags: ['leaf'],
    },
    {
      id: CORE_SQUASH,
      displayName: 'Winter Squash',
      growthTicks: secondsToTicks(900),
      stageSprites: ['crops:squash_0', 'crops:squash_1', 'crops:squash_2', 'crops:squash_3'],
      harvestYield: [{ item: asContentId('core:squash'), quantity: 1 }],
      seedItem: asContentId('core:squash_seed'),
      seedCost: 48,
      // WINTER ONLY, and it is the season's second-best crop behind the
      // pumpkin. `GAME_DESIGN.md` §3.1a called winter "the leanest season, not
      // a dead one" when it held two crops; it now holds five.
      seasons: [CORE_WINTER],
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
    // Gathered from the wilds (phase-27, ADR-037). Priced as RAW materials —
    // below every processed good and every long crop — because they are the
    // bottom of a chain rather than the end of one, and because gathering has
    // no seed cost, no growth wait and no land to buy. A wild resource that
    // outsold a farmed one would make the farm the side activity.
    // ── v0.6 processed goods (phase-56) ─────────────────────────────────────
    //
    // Each price is its recipe's inputs at base price times the v0.4 chain's
    // own step premium of roughly 1.25–1.30. Nothing here is a new economic
    // rule; it is the existing one applied to longer chains.
    {
      id: CORE_CORNMEAL,
      displayName: 'Cornmeal',
      sprite: 'ui-world:item_cornmeal',
      basePrice: 260,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_PORRIDGE,
      displayName: 'Porridge',
      sprite: 'ui-world:item_porridge',
      basePrice: 710,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_JAM,
      displayName: 'Jam',
      sprite: 'ui-world:item_jam',
      basePrice: 82,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_SAUCE,
      displayName: 'Sauce',
      sprite: 'ui-world:item_sauce',
      basePrice: 250,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_LINEN_FIBRE,
      displayName: 'Linen Fibre',
      sprite: 'ui-world:item_linen_fibre',
      basePrice: 84,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_THREAD,
      displayName: 'Thread',
      sprite: 'ui-world:item_thread',
      basePrice: 218,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CLOTH,
      displayName: 'Cloth',
      sprite: 'ui-world:item_cloth',
      // THE MOST VALUABLE THING IN THE GAME, at four items deep and about
      // twelve minutes of machine time from the flax it started as. A chain
      // that ended at the price of a pumpkin would not be worth running.
      basePrice: 850,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_WOOD,
      displayName: 'Wood',
      sprite: 'ui-world:item_wood',
      basePrice: 8,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_STONE_ITEM,
      displayName: 'Stone',
      sprite: 'ui-world:item_stone',
      basePrice: 14,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_ORE,
      displayName: 'Ore',
      sprite: 'ui-world:item_ore',
      basePrice: 40,
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
    // ── v0.6 produce and seeds (phase-55) ───────────────────────────────────
    //
    // Every price here is `GAME_DESIGN.md` §3.2's curve evaluated at that
    // crop's growth time, plus its seed cost — see `coreCrops()` above for the
    // derivation and for why the seed cost is the axis that makes a season a
    // choice. A seed's `basePrice` is its `seedCost`, as it is for all four
    // v0.1 crops: buying a seed is the sink the crop's price is measured from.
    {
      id: CORE_PEA_ITEM,
      displayName: 'Pea',
      sprite: 'ui-world:item_pea',
      basePrice: 7,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_STRAWBERRY_ITEM,
      displayName: 'Strawberry',
      sprite: 'ui-world:item_strawberry',
      basePrice: 21,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_LEEK_ITEM,
      displayName: 'Leek',
      sprite: 'ui-world:item_leek',
      basePrice: 28,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_FLAX_ITEM,
      displayName: 'Flax',
      sprite: 'ui-world:item_flax',
      basePrice: 45,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_TOMATO_ITEM,
      displayName: 'Tomato',
      sprite: 'ui-world:item_tomato',
      basePrice: 64,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CORN_ITEM,
      displayName: 'Corn',
      sprite: 'ui-world:item_corn',
      basePrice: 104,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CABBAGE_ITEM,
      displayName: 'Cabbage',
      sprite: 'ui-world:item_cabbage',
      basePrice: 133,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_SQUASH_ITEM,
      displayName: 'Winter Squash',
      sprite: 'ui-world:item_squash',
      basePrice: 167,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_PEA_SEED,
      displayName: 'Pea Seeds',
      sprite: 'ui-world:item_pea_seed',
      basePrice: 3,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_STRAWBERRY_SEED,
      displayName: 'Strawberry Seeds',
      sprite: 'ui-world:item_strawberry_seed',
      basePrice: 8,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_LEEK_SEED,
      displayName: 'Leek Seeds',
      sprite: 'ui-world:item_leek_seed',
      basePrice: 6,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_FLAX_SEED,
      displayName: 'Flax Seeds',
      sprite: 'ui-world:item_flax_seed',
      basePrice: 14,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_TOMATO_SEED,
      displayName: 'Tomato Seeds',
      sprite: 'ui-world:item_tomato_seed',
      basePrice: 20,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CORN_SEED,
      displayName: 'Corn Seeds',
      sprite: 'ui-world:item_corn_seed',
      basePrice: 32,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_CABBAGE_SEED,
      displayName: 'Cabbage Seeds',
      sprite: 'ui-world:item_cabbage_seed',
      basePrice: 38,
      stackSize: DEFAULT_STACK_SIZE,
    },
    {
      id: CORE_SQUASH_SEED,
      displayName: 'Winter Squash Seeds',
      sprite: 'ui-world:item_squash_seed',
      basePrice: 48,
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
 * Where the farm can reach. Phase-28 — ADR-038 §1, §5.
 *
 * Three destinations, one per standing tier, so the map opens as the town comes
 * to trust you. Each is a name, a distance in ticks, what it costs to outfit,
 * and what a hand brings home.
 *
 * ## The numbers are set by the RATE RULE, not by taste
 *
 * ADR-038 §5: an expedition's haul, valued at base price, per tick of worker
 * time, sits within half to double what the same worker would bring back
 * GATHERING. Gathering is the comparable mechanic — both send someone away to
 * fetch goods — and base price is the stable unit, because the sale multiplier
 * decays with how much you sell rather than with how you got it.
 * `tests/expedition-rate.test.ts` computes both sides and fails if any
 * destination drifts out of band.
 *
 * ## Which is why the hauls are SCARCE goods
 *
 * A worker carries twenty items. Wood at 8 and stone at 14 cap a full pack at a
 * few hundred coins, so a wood-and-stone destination has to be under two
 * minutes away to pay a competitive rate — which is a walk, not an expedition.
 * Ore and the wild produce carry the distance instead, and that is also the
 * reason to go: the wilds already supply wood and stone, and a destination that
 * competed with the band next door would be somewhere with no purpose.
 */
export function coreExpeditions(): readonly ExpeditionDestination[] {
  // ── Six destinations, and three rules they all had to satisfy at once ─────
  //
  // v0.4 shipped three, and two things were wrong with them (ADR-046 R-07,
  // R-08): no destination brought WOOD back at all and stone came from exactly
  // one, so for two of the three materials a player gathers an expedition could
  // not substitute for a forager; and sorting the three by travel time gave
  // precisely the ordering by yield value, which is one axis wearing two names.
  //
  // Adding three more turned out to be a constraint problem rather than a
  // writing one, because THREE separate rules bear on every row:
  //
  // 1. **The rate band** (ADR-038 §5, `expedition-rate.test.ts`). Net value per
  //    tick of worker time must sit between half and twice a forager's rate.
  //    Below it nobody goes; above it every worker goes and the farm stops
  //    mattering.
  // 2. **The carry cap** (`isReachableDestination`). Yields scaled by HAUL_MAX
  //    must fit in WORKER_CARRY_CAPACITY — 20 items.
  // 3. **Distance follows trust** (`expedition-rate.test.ts`): sorted by
  //    standing tier, travel time strictly increases, "or the map reads as
  //    arbitrary".
  //
  // **Rules 1 and 2 together put a ceiling on how long a trip can be**, and it
  // is lower than it looks. The most valuable haul that fits in a worker is
  // about 640 coins of ore, and the rate floor then caps travel at roughly 530
  // seconds. The first draft of the Sunken Coast was a 600-second journey; it
  // is not that the numbers were wrong, it is that no numbers exist for it.
  //
  // **Rule 3 then rules out a second `pillar` destination.** The Highlands is
  // pillar at 450 s, so any other pillar site must be longer — and longer than
  // 450 s leaves almost no room under the rate ceiling. Ashfell was drafted as
  // pillar and is `friend` for that reason: it is gated by trust one tier
  // earlier, and pays for it by being reachable sooner.
  //
  // **Where R-08's inversion actually lives**, after all that: Ashfell is a
  // SHORTER trip than the Sunken Coast and worth MORE. Travel time and yield
  // value order the map differently, which is the whole point — "how far can I
  // afford to send someone" stops having one answer.
  //
  // Registration order is load-bearing for rule 3, because the tier sort is
  // stable and compares neighbours. The order below is travel time ascending.
  const destinations: readonly ExpeditionDestination[] = [
    {
      id: CORE_THORNWOOD,
      displayName: 'Thornwood',
      sprite: 'ui-world:place_thornwood',
      description: 'Close, tangled, and nobody else bothers. Good timber all the same.',
      // The shortest trip in the game and the only one that costs nothing to
      // send. A newcomer's first expedition should be affordable in both senses.
      travelTicks: secondsToTicks(120),
      supplies: [],
      yields: [
        { item: CORE_WOOD, quantity: 8 },
        { item: CORE_STONE_ITEM, quantity: 8 },
      ],
      requires: 'newcomer',
    },
    {
      id: CORE_RIVER_DELTA,
      displayName: 'River Delta',
      sprite: 'ui-world:place_delta',
      description: 'Silt flats downriver. Things grow there without being asked.',
      travelTicks: secondsToTicks(180),
      supplies: [{ item: CORE_WHEAT_SEED, quantity: 4 }],
      yields: [
        { item: CORE_WHEAT_ITEM, quantity: 6 },
        { item: CORE_TURNIP_ITEM, quantity: 8 },
      ],
      requires: 'newcomer',
    },
    {
      id: CORE_OLD_QUARRY,
      displayName: 'Old Quarry',
      sprite: 'ui-world:place_quarry',
      description: 'Worked out, they say. They have not looked lately.',
      travelTicks: secondsToTicks(300),
      supplies: [{ item: CORE_WHEAT_ITEM, quantity: 2 }],
      yields: [
        { item: CORE_ORE_ITEM, quantity: 12 },
        { item: CORE_STONE_ITEM, quantity: 4 },
      ],
      requires: 'friend',
    },
    {
      id: CORE_ASHFELL,
      displayName: 'Ashfell',
      sprite: 'ui-world:place_ashfell',
      description: 'Half a day out and still warm underfoot. They mined it for a reason.',
      // RICHER THAN THE LONGER TRIP BELOW IT, which is where R-08's second axis
      // comes from. It fills a worker's bag to the last slot.
      travelTicks: secondsToTicks(360),
      supplies: [],
      yields: [
        { item: CORE_ORE_ITEM, quantity: 14 },
        { item: CORE_STONE_ITEM, quantity: 1 },
        { item: CORE_WOOD, quantity: 2 },
      ],
      requires: 'friend',
    },
    {
      id: CORE_SUNKEN_COAST,
      displayName: 'The Sunken Coast',
      sprite: 'ui-world:place_coast',
      description: 'A long walk to a drowned village. The stone is already cut.',
      // Longer than Ashfell and worth less, and not a trap: it is the only bulk
      // FLAX in the game, which is the linen chain's first rung, and it costs
      // nothing to send anyone there.
      travelTicks: secondsToTicks(400),
      supplies: [],
      yields: [
        { item: CORE_FLAX_ITEM, quantity: 10 },
        { item: CORE_STONE_ITEM, quantity: 7 },
      ],
      requires: 'friend',
    },
    {
      id: CORE_HIGHLANDS,
      displayName: 'The Highlands',
      sprite: 'ui-world:place_highlands',
      description: 'Two days out, and cold. Only worth it for what grows up there.',
      travelTicks: secondsToTicks(450),
      supplies: [
        { item: CORE_BREAD, quantity: 1 },
        { item: CORE_WOOD, quantity: 2 },
      ],
      yields: [
        { item: CORE_CARROT_ITEM, quantity: 8 },
        { item: CORE_ORE_ITEM, quantity: 6 },
      ],
      requires: 'pillar',
    },
  ];
  return destinations;
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
    //
    // STRENGTHENED in phase-33 (ADR-041). The four were reviewed on one scene
    // at 1x and spring and summer were indistinguishable, while autumn and
    // winter showed only on the path and the stones. A multiply CANNOT shift a
    // green very far — it removes blue, and grass stays green — so these are
    // pushed to the edge of what the mechanism can do and no further. Summer is
    // the reference now, because a multiply cannot brighten and the brightest
    // season therefore has to be the one that leaves the art alone.
    { id: CORE_SPRING, displayName: 'Spring', tint: 0xf2fff4 },
    { id: CORE_SUMMER, displayName: 'Summer', tint: 0xffffff },
    { id: CORE_AUTUMN, displayName: 'Autumn', tint: 0xffcb80 },
    { id: CORE_WINTER, displayName: 'Winter', tint: 0xc8d8f5 },
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
      // Overcast: cooler and a little darker, multiplied over the season's own
      // tint (phase-33). Deliberately GENTLE — the brief asks for rain that
      // looks cozy, and this window sits beside real work, so the ground should
      // read as the same farm under cloud rather than as dusk.
      tint: 0xc6d2e0,
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
      // The wilds crew (phase-27, ADR-037 §4 as amended). Gathering is opt-in,
      // and this role is how a player opts in: assign it and the worker walks
      // out to the band, leave it unassigned and the farm keeps its hands.
      id: CORE_FORAGER,
      displayName: 'Forager',
      taskKinds: [WorkerTaskKind.Gather],
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

    // ── The v0.6 chains (phase-56 — ADR-046 R-03/R-04) ──────────────────────
    //
    // v0.4 built a factory model FOR CHAINS and shipped one two-step chain, so
    // the depth the model was designed for had never once been exercised. Two
    // things follow from that and both are fixed here.
    //
    // EVERY FACTORY NOW HAS A CHOICE TO MAKE. The Mill ran one recipe, which
    // means a Mill was not a decision — it was a switch that was either on or
    // off. Three recipes at one building is the smallest thing that makes
    // "what is my Mill doing right now" a question worth asking, and R-04 is
    // that stated as a rule.
    //
    // THE PREMIUM IS THE V0.4 ONE, APPLIED UNCHANGED. `coreItems()` recorded
    // it: 4 wheat (136) → 2 flour (170) → 1 bread (230), roughly 1.25x per
    // step and 1.7x across the chain, "because a chain that did not add value
    // would be a building with no reason to exist." Every price below is that
    // same step ratio against its own inputs, so processing keeps exactly the
    // shape it had rather than becoming a better deal because it got longer.
    {
      id: CORE_GRIND_CORNMEAL,
      displayName: 'Grind Cornmeal',
      building: CORE_MILL,
      inputs: [{ item: CORE_CORN, quantity: 2 }],
      outputs: [{ item: CORE_CORNMEAL, quantity: 1 }],
      craftTicks: secondsToTicks(75),
    },
    {
      id: CORE_RET_FLAX,
      displayName: 'Ret Flax',
      building: CORE_MILL,
      inputs: [{ item: CORE_FLAX, quantity: 3 }],
      outputs: [{ item: CORE_LINEN_FIBRE, quantity: 2 }],
      craftTicks: secondsToTicks(90),
    },
    {
      id: CORE_COOK_PORRIDGE,
      displayName: 'Cook Porridge',
      building: CORE_KITCHEN,
      // The one recipe that takes two different inputs, which is what makes a
      // Kitchen queue something a player has to supply rather than feed.
      inputs: [
        { item: CORE_CORNMEAL, quantity: 2 },
        { item: CORE_LEEK, quantity: 1 },
      ],
      outputs: [{ item: CORE_PORRIDGE, quantity: 1 }],
      craftTicks: secondsToTicks(150),
    },
    {
      id: CORE_MAKE_JAM,
      displayName: 'Make Jam',
      building: CORE_PRESERVING_SHED,
      inputs: [{ item: CORE_STRAWBERRY, quantity: 3 }],
      outputs: [{ item: CORE_JAM, quantity: 1 }],
      craftTicks: secondsToTicks(60),
    },
    {
      id: CORE_MAKE_SAUCE,
      displayName: 'Make Sauce',
      building: CORE_PRESERVING_SHED,
      inputs: [{ item: CORE_TOMATO, quantity: 3 }],
      outputs: [{ item: CORE_SAUCE, quantity: 1 }],
      craftTicks: secondsToTicks(90),
    },
    {
      id: CORE_SPIN_THREAD,
      displayName: 'Spin Thread',
      building: CORE_LOOM,
      inputs: [{ item: CORE_LINEN_FIBRE, quantity: 2 }],
      outputs: [{ item: CORE_THREAD, quantity: 1 }],
      craftTicks: secondsToTicks(120),
    },
    {
      id: CORE_WEAVE_CLOTH,
      displayName: 'Weave Cloth',
      building: CORE_LOOM,
      inputs: [{ item: CORE_THREAD, quantity: 3 }],
      outputs: [{ item: CORE_CLOTH, quantity: 1 }],
      craftTicks: secondsToTicks(240),
    },
  ];
  return recipes;
}

/**
 * What stands in the wilds. Phase-27 — ADR-037 §5.
 *
 * Three kinds, covering the three verbs `PLAN.md` §5 names — foraging, mining,
 * gathering — and no more. Order IS significant: densities are summed in
 * registration order against one hash value, so appending is safe and
 * reordering re-rolls every existing world's wilds.
 *
 * The densities sum to 0.135, so roughly seven eighths of the wilds is open
 * ground. That is deliberate: a band packed with nodes is a maze rather than a
 * wilderness, and a worker has to be able to walk through it to reach the far
 * side.
 *
 * THE FIRST NUMBERS WERE 0.21 AND THEY WERE WRONG ON SCREEN. A live look at
 * the running app showed a solid wall of canopy — because a tile density is
 * not a visual density: the tree sprite's crown overflows its tile and closes
 * the gaps either side, so one tile in five reads as about one in two. A
 * worker walking through it was lost among the trunks, and watching the little
 * people work is the whole of `VISION.md` §1. Cut by a third, measured by
 * looking again.
 *
 * Regrow times are long relative to gather times — minutes against seconds —
 * so a crew cannot camp one node. The intended shape is a worker walking a
 * circuit, which is also what makes the wilds feel like somewhere you go
 * rather than a second field.
 */
export function coreResourceNodes(): readonly ResourceNodeDefinition[] {
  const nodes: readonly ResourceNodeDefinition[] = [
    {
      id: CORE_TIMBER,
      displayName: 'Timber',
      sprite: 'buildings:tree',
      yields: [{ item: CORE_WOOD, quantity: 2 }],
      gatherTicks: secondsToTicks(6),
      regrowTicks: secondsToTicks(300),
      density: 0.06,
    },
    {
      id: CORE_STONE_NODE,
      displayName: 'Stone',
      sprite: 'buildings:rock',
      yields: [{ item: CORE_STONE_ITEM, quantity: 2 }],
      gatherTicks: secondsToTicks(9),
      regrowTicks: secondsToTicks(600),
      density: 0.045,
    },
    {
      id: CORE_ORE_NODE,
      displayName: 'Ore Vein',
      sprite: 'buildings:ore_vein',
      yields: [{ item: CORE_ORE, quantity: 1 }],
      gatherTicks: secondsToTicks(12),
      // The longest regrow of the three: ore is the scarce one, and scarcity
      // here is time rather than a rarity roll — no hidden dice, and a player
      // can learn the cadence by watching it.
      regrowTicks: secondsToTicks(900),
      density: 0.03,
    },
  ];
  return nodes;
}
