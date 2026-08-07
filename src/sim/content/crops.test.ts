/**
 * Crop content tests — the growth table and the stage curve.
 *
 * Durations are BALANCE, and balance is the thing a later session is most
 * likely to nudge without noticing what it costs. Two properties are load
 * bearing and pinned here:
 *
 *   1. The authored durations equal `GAME_DESIGN.md` §3.1, tick for tick. The
 *      table is the authority; this is the assertion that keeps code and
 *      document from drifting apart silently.
 *   2. Every crop actually SHOWS all four stages — each occupies a real span of
 *      ticks, in order, with no stage skipped. A crop that jumps seed → mature
 *      is a crop the player never watches grow, which is the whole point of
 *      staged growth (§3.3, ADR-001 §1).
 *
 * The coins-per-second ORDERING that makes absence optimal (§3.2) is pinned in
 * `tests/economy-longrun.test.ts`, where the sale prices live.
 */

import { describe, expect, it } from 'vitest';

import { secondsToTicks } from '../time/game-clock';

import {
  CORE_CARROT,
  CORE_PUMPKIN,
  CORE_TURNIP,
  CORE_WHEAT,
  isMature,
  stageFor,
  CropStage,
  STAGE_THRESHOLDS,
  type CropDefinition,
} from './crops';
import { createInstalledRegistries } from './installed';

function coreCrops(): readonly CropDefinition[] {
  const registry = createInstalledRegistries().crops;
  return registry.all();
}

/** The §3.1 table, in the order it is registered. */
const TABLE: readonly { readonly id: string; readonly ticks: number; readonly seconds: number }[] =
  [
    { id: CORE_TURNIP, ticks: 1_800, seconds: 90 },
    { id: CORE_WHEAT, ticks: 4_800, seconds: 240 },
    { id: CORE_CARROT, ticks: 9_600, seconds: 480 },
    { id: CORE_PUMPKIN, ticks: 24_000, seconds: 1_200 },
  ];

describe('the §3.1 growth table', () => {
  it('authors every crop at its documented duration', () => {
    const durations = coreCrops().map((crop) => ({ id: crop.id, ticks: crop.growthTicks }));

    expect(durations).toEqual(TABLE.map(({ id, ticks }) => ({ id, ticks })));
  });

  it('states those durations in whole seconds of simulated time', () => {
    // Ticks are the authored unit (ADR-007 §7); the seconds column of the table
    // must be the same number, not a rounded restatement of it.
    for (const row of TABLE) {
      expect(secondsToTicks(row.seconds)).toBe(row.ticks);
    }
  });

  it('keeps the durations strictly increasing across the table', () => {
    // §3.2's inversion is built on this ordering: the slower crop is the more
    // efficient one, so a rebalance that reorders the table inverts the design.
    const ticks = coreCrops().map((crop) => crop.growthTicks);

    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
  });
});

describe('the stage curve (§3.3)', () => {
  it('shows all four stages, in order, each for a real span of ticks', () => {
    for (const crop of coreCrops()) {
      const spans = [0, 0, 0, 0];
      let previous = CropStage.Seed;

      for (let elapsed = 0; elapsed < crop.growthTicks; elapsed += 1) {
        const stage = stageFor(crop, elapsed);
        expect(stage).toBeGreaterThanOrEqual(previous); // never regresses
        spans[stage] = (spans[stage] ?? 0) + 1;
        previous = stage;
      }

      // Seed, sprout and growing each get real screen time; mature begins the
      // tick growth completes, which the next assertion covers.
      expect(spans.slice(0, 3).every((span) => span > 0)).toBe(true);
      expect(stageFor(crop, crop.growthTicks)).toBe(CropStage.Mature);
    }
  });

  it('starts each stage at its documented fraction of the whole', () => {
    for (const crop of coreCrops()) {
      for (const [stage, fraction] of STAGE_THRESHOLDS.entries()) {
        const start = Math.ceil(crop.growthTicks * fraction);
        expect(stageFor(crop, start)).toBe(stage);
      }
    }
  });

  it('matures exactly at growthTicks, never a tick before', () => {
    for (const crop of coreCrops()) {
      expect(isMature(crop, crop.growthTicks - 1)).toBe(false);
      expect(isMature(crop, crop.growthTicks)).toBe(true);
    }
  });
});
