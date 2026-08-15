/**
 * Residents, derived. Phase-19 — ADR-031 §2.
 *
 * A resident's whole day is a pure function of `(content, seed, tick)`:
 * where they live is content, when they wake is the day phase, where they go
 * is a `mix32` hash over town stops, and how they get there is the static
 * town pathfinder. Nothing here reads a store, consumes `world.rng`, or
 * writes anything — so residents need no save fields, no migration, and no
 * catch-up: a loaded world's residents are wherever the clock says.
 *
 * The itinerary for one `(resident, day)` is generated as a list of LEGS —
 * indoors, walk, dwell — covering the day exactly, then memoised. Querying a
 * tick is a scan over a few dozen legs; the expensive part (routing) runs
 * once per leg per day and the routes themselves are content constants
 * (`pathfind.ts`).
 */

import { mix32 } from '../../shared/hash';
import { doorOf, RESIDENTS, TOWN_STOPS, type ResidentDefinition } from '../content/residents';
import { TOWN_PLACEMENTS } from '../content/town';
import { DayPhase, phaseStartTick } from '../time/game-clock';

import { townEnterTicks, townRoute, type TownPoint } from './pathfind';

/** What a resident's clock needs. `World` satisfies this structurally. */
export interface ResidentClock {
  readonly seed: number;
  readonly ticksPerDay: number;
}

/** Wake lands this far into dawn, plus a per-resident, per-day stagger. */
const WAKE_MIN_TICKS = 600; // 30 s after dawn — nobody is up at the stroke
const WAKE_RANGE_TICKS = 2_400; // …and the village wakes over two minutes

/** How long a resident lingers at a stop. */
const DWELL_MIN_TICKS = 600; // 30 s
const DWELL_RANGE_TICKS = 1_200; // …to 90 s

/** Heading home lands this far into dusk, per resident per day. */
const HOME_STAGGER_TICKS = 1_200;

interface WalkLeg {
  readonly kind: 'walk';
  readonly startTick: number;
  readonly endTick: number;
  readonly route: readonly TownPoint[];
  /** cumulative[i] = ticks after `startTick` at which route[i] is ENTERED. */
  readonly cumulative: readonly number[];
}

interface DwellLeg {
  readonly kind: 'dwell';
  readonly startTick: number;
  readonly endTick: number;
  readonly at: TownPoint;
}

interface IndoorsLeg {
  readonly kind: 'indoors';
  readonly startTick: number;
  readonly endTick: number;
}

type Leg = WalkLeg | DwellLeg | IndoorsLeg;

/** One resident at one tick, ready for projection. */
export interface ResidentMoment {
  readonly definition: ResidentDefinition;
  readonly indoors: boolean;
  readonly tile: TownPoint;
  readonly toTile: TownPoint;
  /** 0–1 progress from `tile` to `toTile`; 0 when standing. */
  readonly moveFraction: number;
}

/** The pool a resident's stops are drawn from: town stops plus the OTHER doors. */
function stopPool(resident: ResidentDefinition): readonly TownPoint[] {
  const doors = TOWN_PLACEMENTS.filter(
    (p) =>
      p.building === ('core:cottage' as string) &&
      !(p.x === resident.home.x && p.y === resident.home.y),
  ).map((p) => doorOf(p));
  return [...TOWN_STOPS, ...doors];
}

/** A walk leg from `from` to `to` starting at `startTick`; null if degenerate. */
function walkLeg(from: TownPoint, to: TownPoint, startTick: number): WalkLeg | null {
  const route = townRoute(from, to);
  if (route === null || route.length < 2) return null;

  const cumulative: number[] = [0];
  for (let i = 1; i < route.length; i += 1) {
    const step = route[i];
    cumulative.push((cumulative[i - 1] ?? 0) + (step === undefined ? 0 : townEnterTicks(step)));
  }
  const total = cumulative[cumulative.length - 1] ?? 0;
  return { kind: 'walk', startTick, endTick: startTick + total, route, cumulative };
}

/**
 * The whole day, as legs. Total by construction: every tick of the day falls
 * inside exactly one leg, ending — like it began — indoors.
 */
export function itineraryFor(
  clock: ResidentClock,
  resident: ResidentDefinition,
  residentIndex: number,
  day: number,
): readonly Leg[] {
  const h = (k: number): number => mix32(mix32(mix32(clock.seed, residentIndex + 1), day), k) >>> 0;

  const dayStart = day * clock.ticksPerDay;
  const dayEnd = dayStart + clock.ticksPerDay;
  const wake = dayStart + WAKE_MIN_TICKS + (h(0) % WAKE_RANGE_TICKS);
  const headHome =
    dayStart + phaseStartTick(DayPhase.Dusk, clock.ticksPerDay) + (h(1) % HOME_STAGGER_TICKS);

  const door = doorOf(resident.home);
  const pool = stopPool(resident);
  const legs: Leg[] = [{ kind: 'indoors', startTick: dayStart, endTick: wake }];

  let cursor = wake;
  let at = door;
  let k = 2;
  while (cursor < headHome) {
    const stop = pool[h(k) % pool.length] ?? door;
    k += 1;

    const walk = walkLeg(at, stop, cursor);
    if (walk !== null) {
      legs.push(walk);
      cursor = walk.endTick;
      at = stop;
    }

    const dwell = DWELL_MIN_TICKS + (h(k) % DWELL_RANGE_TICKS);
    k += 1;
    legs.push({ kind: 'dwell', startTick: cursor, endTick: cursor + dwell, at });
    cursor += dwell;
  }

  const home = walkLeg(at, door, cursor);
  if (home !== null) {
    legs.push(home);
    cursor = home.endTick;
  }
  legs.push({ kind: 'indoors', startTick: cursor, endTick: dayEnd });

  return legs;
}

/**
 * Itineraries are pure in (seed, ticksPerDay, resident, day); the memo is a
 * cache over a pure function, never state (ADR-031 §2). Bounded: cleared
 * wholesale when it grows past a few days of population.
 */
const memo = new Map<string, readonly Leg[]>();
const MEMO_LIMIT = 64;

function memoisedItinerary(
  clock: ResidentClock,
  resident: ResidentDefinition,
  residentIndex: number,
  day: number,
): readonly Leg[] {
  const key = `${String(clock.seed)}:${String(clock.ticksPerDay)}:${String(residentIndex)}:${String(day)}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;

  const legs = itineraryFor(clock, resident, residentIndex, day);
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, legs);
  return legs;
}

/** Where one resident is at `tick`. Pure; total for any non-negative tick. */
export function residentAt(
  clock: ResidentClock,
  resident: ResidentDefinition,
  residentIndex: number,
  tick: number,
): ResidentMoment {
  const day = Math.floor(tick / clock.ticksPerDay);
  const legs = memoisedItinerary(clock, resident, residentIndex, day);
  const door = doorOf(resident.home);

  for (const leg of legs) {
    if (tick < leg.startTick || tick >= leg.endTick) continue;

    if (leg.kind === 'indoors') {
      return { definition: resident, indoors: true, tile: door, toTile: door, moveFraction: 0 };
    }
    if (leg.kind === 'dwell') {
      return {
        definition: resident,
        indoors: false,
        tile: leg.at,
        toTile: leg.at,
        moveFraction: 0,
      };
    }

    const elapsed = tick - leg.startTick;
    // The segment being crossed: the last i with cumulative[i] <= elapsed.
    let i = 0;
    while (i + 1 < leg.cumulative.length && (leg.cumulative[i + 1] ?? Infinity) <= elapsed) {
      i += 1;
    }
    const tile = leg.route[i] ?? door;
    const next = leg.route[i + 1];
    if (next === undefined) {
      return { definition: resident, indoors: false, tile, toTile: tile, moveFraction: 0 };
    }
    const segmentStart = leg.cumulative[i] ?? 0;
    const segmentLength = (leg.cumulative[i + 1] ?? segmentStart + 1) - segmentStart;
    return {
      definition: resident,
      indoors: false,
      tile,
      toTile: next,
      moveFraction: (elapsed - segmentStart) / segmentLength,
    };
  }

  // A tick outside every leg cannot happen for a well-formed day; answering
  // "indoors" is a better failure than a throw inside projection (handled
  // over asserted, CODE_STYLE.md §1.2).
  return { definition: resident, indoors: true, tile: door, toTile: door, moveFraction: 0 };
}

/** Every resident at `tick`, in content order. */
export function residentsAt(clock: ResidentClock, tick: number): readonly ResidentMoment[] {
  return RESIDENTS.map((resident, index) => residentAt(clock, resident, index, tick));
}
