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
 * `tests/economy-longrun.test.ts`, where the sale prices live — and since
 * phase-55 also, and more directly, in `tests/crop-curve.test.ts`, which
 * asserts the rate itself across all twelve crops rather than inferring it from
 * the order they happen to be registered in.
 */

import { describe, expect, it } from 'vitest';

import { secondsToTicks } from '../time/game-clock';

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
    // The v0.6 eight (phase-55), in registration order — which is the order
    // they are authored in, not the order of their durations. See below.
    { id: CORE_PEA, ticks: 1_200, seconds: 60 },
    { id: CORE_STRAWBERRY, ticks: 3_000, seconds: 150 },
    { id: CORE_LEEK, ticks: 4_800, seconds: 240 },
    { id: CORE_FLAX, ticks: 6_000, seconds: 300 },
    { id: CORE_TOMATO, ticks: 8_000, seconds: 400 },
    { id: CORE_CORN, ticks: 12_000, seconds: 600 },
    { id: CORE_CABBAGE, ticks: 15_000, seconds: 750 },
    { id: CORE_SQUASH, ticks: 18_000, seconds: 900 },
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

  it('gives every crop a distinct place on the duration ladder, or a stated tie', () => {
    // WHAT THIS USED TO ASSERT, and why it changed at phase-55.
    //
    // It walked the crops in REGISTRATION order and required each to be slower
    // than the last, on the reasoning that "§3.2's inversion is built on this
    // ordering: the slower crop is the more efficient one, so a rebalance that
    // reorders the table inverts the design."
    //
    // The reasoning is right and the assertion was a PROXY for it. With four
    // crops on one ladder, registration order and duration order were the same
    // list, so the proxy was free. With twelve they are not: the v0.6 eight are
    // appended after the v0.1 four, so the 60-second pea is registered after
    // the 1,200-second pumpkin and the old assertion fails on a table that is
    // perfectly well ordered.
    //
    // Reordering the registrations to restore the coincidence was the obvious
    // move and is the wrong one — registration order decides dense content
    // indices, and rearranging it to satisfy a test is how a test starts
    // dictating a data layout it does not understand.
    //
    // **§3.2 is now asserted directly**, against RATE rather than inferred from
    // order, in `tests/crop-curve.test.ts` — which is strictly stronger: it
    // catches a crop that is slower and also worse, which no ordering check
    // ever could.
    //
    // What is left here is the property registration order genuinely has: the
    // ladder has no accidental collisions. Two crops may share a duration, but
    // only deliberately — leek and wheat do, at 240 s, and that is the whole
    // point of the pair (`GAME_DESIGN.md` §3.1b): same time, same rate, half
    // the capital.
    const DELIBERATE_TIES: readonly (readonly string[])[] = [[CORE_LEEK, CORE_WHEAT]];

    const byDuration = new Map<number, string[]>();
    for (const crop of coreCrops()) {
      const ids = byDuration.get(crop.growthTicks) ?? [];
      ids.push(String(crop.id));
      byDuration.set(crop.growthTicks, ids);
    }

    for (const [ticks, ids] of byDuration) {
      if (ids.length === 1) continue;
      const sorted = [...ids].sort();
      const declared = DELIBERATE_TIES.some((tie) => [...tie].sort().join() === sorted.join());
      expect(
        declared,
        `${sorted.join(' and ')} both take ${String(ticks)} ticks. A shared duration is ` +
          `allowed only when it is the point — add the pair to DELIBERATE_TIES with the ` +
          `reason, or give one of them a different time.`,
      ).toBe(true);
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
