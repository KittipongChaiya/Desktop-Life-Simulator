/**
 * Phase-10b — ADR-020 §3's republish rule, and the projection under it.
 *
 * The republish count is the whole point of this slice. A `timeOfDay` field
 * would pass every projection test below and still be a defect, so the test
 * that matters here counts publications across a full simulated day rather
 * than asserting what the projection contains.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_DAYS_PER_SEASON, DEFAULT_TICKS_PER_DAY } from '../../shared/constants';
import { stepSimulationBy } from '../tick';
import { DAY_PHASES, DayPhase, phaseStartTick } from '../time/game-clock';
import { createWorld } from '../world/world';

import { projectTime, timeEquals } from './time-slice';

const DAY = DEFAULT_TICKS_PER_DAY;
const YEAR: readonly string[] = ['core:spring', 'core:summer', 'core:autumn', 'core:winter'];

describe('projecting the calendar', () => {
  it('reports day zero at tick zero', () => {
    expect(
      projectTime({
        tick: 0,
        ticksPerDay: DAY,
        daysPerSeason: DEFAULT_DAYS_PER_SEASON,
        seasons: YEAR,
      }),
    ).toEqual({ day: 0, phase: DayPhase.Dawn, season: 'core:spring' });
  });

  it('counts days from the world start, not from one', () => {
    expect(
      projectTime({
        tick: DAY,
        ticksPerDay: DAY,
        daysPerSeason: DEFAULT_DAYS_PER_SEASON,
        seasons: YEAR,
      }).day,
    ).toBe(1);
    expect(
      projectTime({
        tick: DAY * 40 + 5,
        ticksPerDay: DAY,
        daysPerSeason: DEFAULT_DAYS_PER_SEASON,
        seasons: YEAR,
      }).day,
    ).toBe(40);
  });

  it('reads the day length from the world, not a constant', () => {
    // The frozen-per-world rule (ADR-020 §2) is only real if the projection
    // honours it; reading the default here would renumber another world's days.
    expect(
      projectTime({
        tick: 100,
        ticksPerDay: 50,
        daysPerSeason: DEFAULT_DAYS_PER_SEASON,
        seasons: YEAR,
      }).day,
    ).toBe(2);
  });

  it('carries a named phase, never a fraction of a day', () => {
    const view = projectTime({
      tick: DAY / 2,
      ticksPerDay: DAY,
      daysPerSeason: DEFAULT_DAYS_PER_SEASON,
      seasons: YEAR,
    });

    expect(DAY_PHASES).toContain(view.phase);
    expect(Object.keys(view).sort()).toEqual(['day', 'phase', 'season']);
  });
});

describe('a world whose content registered no seasons', () => {
  it('reports no season rather than inventing one', () => {
    expect(
      projectTime({ tick: 0, ticksPerDay: DAY, daysPerSeason: 7, seasons: [] }).season,
    ).toBeUndefined();
  });
});

describe('the change test', () => {
  it('holds two equal views equal', () => {
    expect(
      timeEquals(
        { day: 3, phase: DayPhase.Dusk, season: undefined },
        { day: 3, phase: DayPhase.Dusk, season: undefined },
      ),
    ).toBe(true);
  });

  it('separates a phase change', () => {
    expect(
      timeEquals(
        { day: 3, phase: DayPhase.Dusk, season: undefined },
        { day: 3, phase: DayPhase.Night, season: undefined },
      ),
    ).toBe(false);
  });

  it('separates a day change', () => {
    expect(
      timeEquals(
        { day: 3, phase: DayPhase.Dawn, season: undefined },
        { day: 4, phase: DayPhase.Dawn, season: undefined },
      ),
    ).toBe(false);
  });
});

describe('republishing over a full simulated day', () => {
  it('republishes exactly once per phase boundary, on a static farm', () => {
    // The ADR-020 §Validation acceptance, stated against the real tick loop
    // rather than a projection loop — the defect it guards against is the
    // snapshot SYSTEM publishing too often, which a pure-function test cannot
    // see.
    const world = createWorld(7);
    // Settle the first tick before counting. Every slice documents a one-time
    // first-tick correction, and phase-11c gave this one its own: the initial
    // value is seeded with an EMPTY season list, because the seasons a world
    // runs on are its own frozen list and `createSnapshotState` has no world
    // to ask. The correction is one republish at world start, not one per tick.
    stepSimulationBy(world, 1);
    const before = world.snapshots.time.version;

    stepSimulationBy(world, DAY);

    expect(world.snapshots.time.version - before).toBe(DAY_PHASES.length);
  });

  it('leaves the version untouched across a run inside one phase', () => {
    const world = createWorld(7);
    const dusk = phaseStartTick(DayPhase.Dusk, DAY);

    stepSimulationBy(world, dusk + 1);
    const settled = world.snapshots.time.version;

    // Well inside dusk, which runs from 0.7 to 0.8 of the day — 2,400 ticks.
    stepSimulationBy(world, 1000);

    expect(world.snapshots.time.version).toBe(settled);
  });

  it('publishes the phase the world is actually in', () => {
    const world = createWorld(7);
    stepSimulationBy(world, phaseStartTick(DayPhase.Night, DAY));

    expect(world.snapshots.time.value.phase).toBe(DayPhase.Night);
    expect(world.snapshots.time.value.day).toBe(0);
  });

  it('crosses midnight into the next day', () => {
    const world = createWorld(7);
    stepSimulationBy(world, DAY);

    expect(world.snapshots.time.value).toEqual({
      day: 1,
      phase: DayPhase.Dawn,
      season: 'core:spring',
    });
  });
});
