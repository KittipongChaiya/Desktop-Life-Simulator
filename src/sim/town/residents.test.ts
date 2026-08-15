/**
 * Derived residents. Phase-19 — ADR-031 §2.
 *
 * The properties the whole design rests on: the day is TOTAL (every tick
 * answers, well-formed), the town sleeps at night and is awake at midday,
 * movement is continuous (adjacent tiles, never a teleport), days differ
 * (routine, not loops), and the derivation is pure — same inputs, same
 * answer, no RNG anywhere near it.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_TICKS_PER_DAY } from '../../shared/constants';
import { RESIDENTS } from '../content/residents';
import { DayPhase, phaseStartTick } from '../time/game-clock';

import { isTownWalkable } from './pathfind';
import { itineraryFor, residentAt, residentsAt, type ResidentClock } from './residents';

const CLOCK: ResidentClock = { seed: 20_260_815, ticksPerDay: DEFAULT_TICKS_PER_DAY };

const DAY = CLOCK.ticksPerDay;
const NIGHT_START = phaseStartTick(DayPhase.Night, DAY);

describe('the day is total', () => {
  it('legs cover every tick of the day exactly, indoors at both ends', () => {
    for (const [index, resident] of RESIDENTS.entries()) {
      for (const day of [0, 1, 7]) {
        const legs = itineraryFor(CLOCK, resident, index, day);

        expect(legs[0]?.kind).toBe('indoors');
        expect(legs[legs.length - 1]?.kind).toBe('indoors');
        expect(legs[0]?.startTick).toBe(day * DAY);
        expect(legs[legs.length - 1]?.endTick).toBe((day + 1) * DAY);

        for (let i = 1; i < legs.length; i += 1) {
          expect(legs[i]?.startTick, `gap before leg ${String(i)}`).toBe(legs[i - 1]?.endTick);
        }
      }
    }
  });

  it('answers any tick with a well-formed moment on walkable ground', () => {
    for (let tick = 0; tick < DAY * 2; tick += 487) {
      for (const moment of residentsAt(CLOCK, tick)) {
        expect(isTownWalkable(moment.tile)).toBe(true);
        expect(isTownWalkable(moment.toTile)).toBe(true);
        expect(moment.moveFraction).toBeGreaterThanOrEqual(0);
        expect(moment.moveFraction).toBeLessThan(1);
      }
    }
  });
});

describe('the rhythm of the day (PLAN.md §4 — believable schedules)', () => {
  it('everyone is indoors through the night', () => {
    for (const day of [0, 1, 2]) {
      for (let offset = NIGHT_START; offset < DAY; offset += 401) {
        for (const moment of residentsAt(CLOCK, day * DAY + offset)) {
          expect(moment.indoors, `${moment.definition.displayName} out at night`).toBe(true);
        }
      }
    }
  });

  it('everyone is out and about at midday', () => {
    for (const day of [0, 1, 2]) {
      for (const moment of residentsAt(CLOCK, day * DAY + Math.floor(DAY / 2))) {
        expect(moment.indoors, `${moment.definition.displayName} indoors at noon`).toBe(false);
      }
    }
  });

  it('wakes are staggered — the village does not march out in step', () => {
    const wakes = RESIDENTS.map(
      (resident, index) => itineraryFor(CLOCK, resident, index, 0)[0]?.endTick,
    );
    expect(new Set(wakes).size).toBeGreaterThan(1);
  });

  it('two days differ — routine, not a loop', () => {
    const noon = Math.floor(DAY / 2);
    const dayA = residentsAt(CLOCK, noon).map((m) => [m.tile.x, m.tile.y]);
    const dayB = residentsAt(CLOCK, DAY + noon).map((m) => [m.tile.x, m.tile.y]);
    expect(dayA).not.toEqual(dayB);
  });
});

describe('movement is continuous', () => {
  it('a resident moves at most one tile per tick, always to a neighbour', () => {
    const resident = RESIDENTS[0]!;
    let previous = residentAt(CLOCK, resident, 0, 6_000);
    for (let tick = 6_001; tick < 12_000; tick += 1) {
      const next = residentAt(CLOCK, resident, 0, tick);
      const dx = Math.abs(next.tile.x - previous.tile.x);
      const dy = Math.abs(next.tile.y - previous.tile.y);
      expect(dx + dy, `jump at tick ${String(tick)}`).toBeLessThanOrEqual(1);
      previous = next;
    }
  });
});

describe('purity (ADR-031 §2)', () => {
  it('the same tick answers identically, every time', () => {
    for (const tick of [0, 7_777, 12_345, 19_000]) {
      expect(residentsAt(CLOCK, tick)).toEqual(residentsAt(CLOCK, tick));
    }
  });

  it('different seeds get different days', () => {
    const other: ResidentClock = { seed: 7, ticksPerDay: DAY };
    const noon = Math.floor(DAY / 2);
    const a = residentsAt(CLOCK, noon).map((m) => [m.tile.x, m.tile.y]);
    const b = residentsAt(other, noon).map((m) => [m.tile.x, m.tile.y]);
    expect(a).not.toEqual(b);
  });
});
