/**
 * The eight-hour unattended chain. Phase-26 — `PLAN.md` §5 criterion 1.
 *
 * > "A production chain runs unattended for 8 hours without jamming."
 *
 * This is that criterion as an executable test rather than a claim. Eight hours
 * at 20 Hz is 576,000 ticks — the same span `OFFLINE_CAP_TICKS` covers and the
 * same span `memory-longrun` uses — run for real, with nobody touching
 * anything.
 *
 * ## What "without jamming" is asserted to mean
 *
 * A stall is permitted and expected: a full downstream stops its upstream, and
 * that is correct behaviour (ADR-035 Rule E). A JAM is a stall that outlives
 * its cause. The distinction is testable in exactly one way — **production must
 * still be happening at the END of the run**, not merely at some point during
 * it. A chain that produced for ten minutes and then wedged would pass any
 * total-output assertion and fail this one.
 *
 * The chain is deliberately bottlenecked at the far end so it spends the run
 * genuinely stalling and recovering rather than running free: the kitchen is
 * slower than the mill, so the mill's output fills, hauling stops, the kitchen
 * drains it, and hauling resumes — thousands of times.
 *
 * ## One run, three claims
 *
 * The first draft ran the eight hours three times, once per claim, and took
 * about forty-five minutes. Everything asserted here can be sampled from a
 * single pass, so it is: the run is instrumented at intervals and the claims
 * are made against what it recorded. Cheaper, and strictly stronger — the three
 * claims now describe the *same* eight hours rather than three similar ones.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { OFFLINE_CAP_TICKS, WORLD_WIDTH } from '../src/shared/constants';
import type { BuildingId } from '../src/shared/ids';
import { reservedAtSource } from '../src/sim/ai/haul';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { setFactoryRecipe } from '../src/sim/commands/factory-commands';
import { addRoute } from '../src/sim/commands/haul-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { CORE_KITCHEN, CORE_MILL, CORE_STORAGE_SHED } from '../src/sim/content/buildings';
import { CORE_BREAD, CORE_FLOUR, CORE_WHEAT, DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { CORE_BAKE_BREAD, CORE_GRIND_FLOUR } from '../src/sim/content/recipes';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems, containerCount } from '../src/sim/world/container';
import { routesInOrder } from '../src/sim/world/route';
import { createWorld, type World } from '../src/sim/world/world';
import { longRunBudget } from './long-run-budget';

/** Eight hours at 20 Hz. */
const EIGHT_HOURS = OFFLINE_CAP_TICKS;

/** How often the run is sampled. Fine enough to locate a wedge, coarse enough to be cheap. */
const SAMPLE_TICKS = 12_000;

/**
 * Real 576,000-tick runs cost real time — five workers pathing a full chain is
 * minutes, not seconds. Stated explicitly rather than raised globally, so the
 * cost is attributed to the one test that incurs it (the v0.3 lesson: a runner
 * budget is not a game budget, and it gets headroom in the commit that needs
 * it).
 *
 * **Raised at the v0.5 RC, which is the commit that needed it.** Measured at
 * 687 s uninstrumented against the previous 900 s — 76% of the budget, which
 * is not headroom, it is a coin toss on a slower machine. v0.5 gave every
 * building a real footprint, so the obstacle map the crew paths around grew,
 * and the tick went 0.063 → 0.104 ms (`PERFORMANCE.md`).
 *
 * `longRunBudget` multiplies this under coverage, where the same run measured
 * 1,980 s. THIS NUMBER IS NOT A PERFORMANCE BUDGET — it detects a hang, and
 * the performance claim is measured separately in `PERFORMANCE.md`.
 */
const RUN_TIMEOUT_MS = longRunBudget(1_400_000);

interface Chain {
  readonly world: World;
  readonly shed: BuildingId;
  readonly mill: BuildingId;
  readonly kitchen: BuildingId;
}

/** shed(wheat) → mill(flour) → kitchen(bread), fully routed, five workers. */
function buildChain(wheat: number): Chain {
  const world = createWorld(2026);
  world.wallet.coins = 1_000_000;
  const centre = 32 * WORLD_WIDTH + 30;

  // Buildings have FOOTPRINTS since phase-41 (ADR-042 §3): the shed is 2x2,
  // the mill 3x3, the kitchen 3x2. The old layout put them two or three tiles
  // apart on one row, which was fine when each was a single tile and now either
  // overlaps or runs off the 8x8 starting plot (cols 28-35, rows 28-35). These
  // origins are the bottom-left of each footprint and do not collide.
  expect(placeBuilding(world, 31 * WORLD_WIDTH + 28, CORE_STORAGE_SHED).ok).toBe(true);
  const shed = [...world.buildings.keys()].at(-1)!;
  expect(placeBuilding(world, 31 * WORLD_WIDTH + 31, CORE_MILL).ok).toBe(true);
  const mill = [...world.buildings.keys()].at(-1)!;
  expect(placeBuilding(world, 35 * WORLD_WIDTH + 28, CORE_KITCHEN).ok).toBe(true);
  const kitchen = [...world.buildings.keys()].at(-1)!;

  expect(setFactoryRecipe(world, mill, CORE_GRIND_FLOUR).ok).toBe(true);
  expect(setFactoryRecipe(world, kitchen, CORE_BAKE_BREAD).ok).toBe(true);

  // The two links of the chain. Nothing else moves goods.
  expect(addRoute(world, shed, mill, CORE_WHEAT).ok).toBe(true);
  expect(addRoute(world, mill, kitchen, CORE_FLOUR).ok).toBe(true);

  addItems(world.buildingStorage.get(shed)!, CORE_WHEAT, wheat, DEFAULT_STACK_SIZE);
  for (let i = 0; i < 5; i += 1) expect(hireWorker(world, centre + 10 + i).ok).toBe(true);

  return { world, shed, mill, kitchen };
}

/**
 * Every unit the chain holds, weighted in wheat: 1 wheat, 2 per flour, 4 per
 * bread. A craft is an exchange at these rates, so the total can only fall by
 * what is in flight inside a factory — never rise.
 */
function wheatUnits(chain: Chain): number {
  const containers = [
    chain.world.buildingStorage.get(chain.shed)!,
    chain.world.factories.get(chain.mill)!.input,
    chain.world.factories.get(chain.mill)!.output,
    chain.world.factories.get(chain.kitchen)!.input,
    chain.world.factories.get(chain.kitchen)!.output,
    chain.world.inventory,
    ...[...chain.world.workers.values()].map((worker) => worker.carrying),
  ];

  let total = 0;
  for (const [item, weight] of [
    [CORE_WHEAT, 1],
    [CORE_FLOUR, 2],
    [CORE_BREAD, 4],
  ] as const) {
    for (const container of containers) total += containerCount(container, item) * weight;
  }
  return total;
}

describe('criterion 1 — a production chain runs 8 hours unattended without jamming', () => {
  it(
    'produces to the very end, never over-reserves, and conserves what it touched',
    () => {
      // Enough wheat that the chain is never starved of raw input: this test is
      // about jamming, not about running out.
      const chain = buildChain(6_000);
      const routes = routesInOrder(chain.world.routes);
      const unitsAtStart = wheatUnits(chain);

      const breadAt: number[] = [];
      for (let elapsed = 0; elapsed < EIGHT_HOURS; elapsed += SAMPLE_TICKS) {
        stepSimulationBy(chain.world, SAMPLE_TICKS);

        // CLAIM 2, checked at every sample rather than at the end: a
        // reservation never exceeds what its source actually holds. Because
        // reservations are derived from tasks (ADR-036 as amended), this also
        // proves the derivation stays sound across thousands of task churns.
        for (const route of routes) {
          const source =
            chain.world.buildingStorage.get(route.from) ??
            chain.world.factories.get(route.from)!.output;
          expect(reservedAtSource(chain.world, route)).toBeLessThanOrEqual(
            containerCount(source, route.item),
          );
        }

        breadAt.push(containerCount(chain.world.factories.get(chain.kitchen)!.output, CORE_BREAD));
      }

      // CLAIM 1 — still producing at the end, not merely at some point. A
      // chain that wedged would have a flat tail, and the last quarter of the
      // samples is where that shows.
      const quarter = Math.floor(breadAt.length / 4);
      const atThreeQuarters = breadAt[breadAt.length - quarter - 1] ?? 0;
      const atEnd = breadAt.at(-1) ?? 0;

      expect(breadAt[0] ?? 0, 'nothing was produced early in the run').toBeGreaterThan(0);
      expect(atEnd, 'production stopped before the run ended').toBeGreaterThan(atThreeQuarters);

      // CLAIM 3 — conservation. In-flight crafts hold value in neither
      // container, so the end state can be short by at most one craft's inputs
      // per factory (2 wheat + 2 flour = 6 units). It can never be OVER.
      const unitsAtEnd = wheatUnits(chain);
      expect(unitsAtEnd).toBeLessThanOrEqual(unitsAtStart);
      expect(unitsAtEnd).toBeGreaterThanOrEqual(unitsAtStart - 6);
    },
    RUN_TIMEOUT_MS,
  );
});
