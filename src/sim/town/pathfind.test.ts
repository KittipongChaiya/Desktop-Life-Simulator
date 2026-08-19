/**
 * The town pathfinder. Phase-19 — ADR-031 §3.
 *
 * The properties that make derived residents sound: every place an itinerary
 * can name is reachable from every other (a null route would strand a whole
 * day), routes never leave town ground (a route through farm land would make
 * a derived position depend on the player's buildings), and the same inputs
 * return the same route forever.
 */

import { describe, expect, it } from 'vitest';

import { TOWN_MIN_X } from '../../shared/constants';
import { doorOf, RESIDENTS, TOWN_STOPS } from '../content/residents';
import { TOWN_PLACEMENTS } from '../content/town';

import { isTownWalkable, townEnterTicks, townRoute } from './pathfind';

/** Every place an itinerary can name: stops and all four doors. */
const PLACES = [...TOWN_STOPS, ...RESIDENTS.map((r) => doorOf(r.home))];

describe('the content stands on walkable ground', () => {
  it('every stop and every door is walkable town land', () => {
    for (const place of PLACES) {
      expect(isTownWalkable(place), `(${String(place.x)}, ${String(place.y)})`).toBe(true);
    }
  });

  it('every resident home is a cottage in the layout', () => {
    const cottages = new Set(
      TOWN_PLACEMENTS.filter((p) => p.building === ('core:cottage' as string)).map(
        (p) => `${String(p.x)},${String(p.y)}`,
      ),
    );
    for (const resident of RESIDENTS) {
      expect(cottages.has(`${String(resident.home.x)},${String(resident.home.y)}`)).toBe(true);
    }
  });
});

describe('routes are total over the places (ADR-031 §3)', () => {
  it('every place reaches every other place', () => {
    for (const from of PLACES) {
      for (const to of PLACES) {
        const route = townRoute(from, to);
        expect(
          route,
          `no route (${String(from.x)},${String(from.y)}) → (${String(to.x)},${String(to.y)})`,
        ).not.toBeNull();
      }
    }
  });

  it('routes never leave town ground and never cross a building', () => {
    for (const from of PLACES) {
      for (const to of PLACES) {
        for (const step of townRoute(from, to) ?? []) {
          expect(step.x).toBeGreaterThanOrEqual(TOWN_MIN_X);
          expect(isTownWalkable(step)).toBe(true);
        }
      }
    }
  });

  it('steps are orthogonally adjacent — nobody teleports', () => {
    const route = townRoute(doorOf(RESIDENTS[0]!.home), TOWN_STOPS[9]!) ?? [];
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1]!;
      const b = route[i]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
  });
});

describe('determinism and cost', () => {
  it('the same route comes back forever', () => {
    // Coordinates follow the phase-45 layout: the road runs along y=33 and the
    // plaza spans y=31..34.
    const a = townRoute({ x: 64, y: 33 }, { x: 73, y: 34 });
    const b = townRoute({ x: 64, y: 33 }, { x: 73, y: 34 });
    expect(a).toEqual(b);
  });

  it('prefers the street: the road walk stays on path tiles', () => {
    // From the road's west end to the well's west side, the whole shortest
    // route is street — path tiles cost less, so A* must keep to them.
    const route = townRoute({ x: 64, y: 33 }, { x: 70, y: 33 }) ?? [];
    expect(route.length).toBeGreaterThan(1);
    const pathTicks = townEnterTicks({ x: 65, y: 33 });
    for (const step of route.slice(1)) {
      expect(townEnterTicks(step)).toBe(pathTicks);
    }
  });

  it('refuses endpoints off town ground', () => {
    expect(townRoute({ x: 32, y: 33 }, { x: 70, y: 33 })).toBeNull(); // farm
    // The well stands at (71,33) since phase-45; a building tile is blocked,
    // so it can never be an endpoint.
    expect(townRoute({ x: 70, y: 33 }, { x: 71, y: 33 })).toBeNull();
  });
});
