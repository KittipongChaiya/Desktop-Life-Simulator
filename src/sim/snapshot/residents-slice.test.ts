/**
 * Resident projection. Phase-19 — ADR-031 §4.
 *
 * What the boundary must hold: indoors residents are ABSENT (the sleeping
 * town publishes nothing), the projection is pure and touches no RNG (the
 * ADR-022 §1 stream discipline, applied to people), and the change test says
 * "unchanged" for the night-after-night empty slice.
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { DEFAULT_TICKS_PER_DAY } from '../../shared/constants';
import { DayPhase, phaseStartTick } from '../../sim/time/game-clock';
import { createWorld } from '../world/world';

import { projectResidents, residentsEqual } from './residents-slice';

const DAY = DEFAULT_TICKS_PER_DAY;
const NOON = Math.floor(DAY / 2);
const NIGHT = phaseStartTick(DayPhase.Night, DAY) + 1_000;

/** A projection source at an arbitrary tick, without stepping a world there. */
function sourceAt(tick: number): { seed: number; ticksPerDay: number; tick: number } {
  return { seed: 11, ticksPerDay: DAY, tick };
}

describe('projection', () => {
  it('projects the whole village at noon', () => {
    const views = projectResidents(sourceAt(NOON));
    expect(views).toHaveLength(4);
    for (const view of views) {
      expect(view.name.length).toBeGreaterThan(0);
      expect(view.moveFraction).toBeGreaterThanOrEqual(0);
      expect(view.moveFraction).toBeLessThan(1);
    }
  });

  it('projects nobody at night — the sleeping town is an empty slice', () => {
    expect(projectResidents(sourceAt(NIGHT))).toEqual([]);
  });

  it('night after night compares equal, so nothing republishes', () => {
    expect(
      residentsEqual(projectResidents(sourceAt(NIGHT)), projectResidents(sourceAt(NIGHT + 500))),
    ).toBe(true);
  });

  it('walking changes the projection tick over tick', () => {
    // Somewhere in the morning somebody is walking; scan a window and expect
    // at least one consecutive pair to differ (a village where nothing ever
    // moves is a mural, not a town).
    let observed = false;
    for (let tick = 4_000; tick < 12_000 && !observed; tick += 1) {
      observed = !residentsEqual(
        projectResidents(sourceAt(tick)),
        projectResidents(sourceAt(tick + 1)),
      );
    }
    expect(observed).toBe(true);
  });
});

describe('purity (ADR-031 §2, the ADR-022 stream rule)', () => {
  it('projecting a real world 500 times leaves its RNG untouched', () => {
    const world = createWorld(99);
    const before = world.rng.getState();

    for (let i = 0; i < 500; i += 1) projectResidents({ ...world, tick: i * 40 });

    expect(world.rng.getState()).toEqual(before);
  });

  it('the same tick projects identically', () => {
    expect(projectResidents(sourceAt(NOON))).toEqual(projectResidents(sourceAt(NOON)));
  });
});
