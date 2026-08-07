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
import { CORE_BUILDINGS, type BuildingDefinition } from '../../src/sim/content/buildings';
import {
  CORE_CARROT,
  CORE_PUMPKIN,
  CORE_TURNIP,
  CORE_WHEAT,
  type CropDefinition,
} from '../../src/sim/content/crops';
import {
  CORE_CARROT_SEED,
  CORE_PUMPKIN_SEED,
  CORE_TURNIP_SEED,
  CORE_WHEAT_SEED,
  DEFAULT_STACK_SIZE,
  type ItemDefinition,
} from '../../src/sim/content/items';
import {
  CORE_GRASS,
  CORE_PATH,
  CORE_STONE,
  CORE_WATER,
  type TileKindDefinition,
} from '../../src/sim/content/tile-kinds';
import { secondsToTicks } from '../../src/sim/time/game-clock';

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
      seasons: [],
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
      seasons: [],
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
      seasons: [],
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

/** Registers the v0.1 buildings — the `GAME_DESIGN.md` §5 table, exactly. */
export function coreBuildings(): readonly BuildingDefinition[] {
  return CORE_BUILDINGS;
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
