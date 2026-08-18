/**
 * Expedition destinations. Phase-28 — ADR-038.
 *
 * Two properties carry this module, and both are about a player who closed the
 * game. **The haul is a function of the departure**, so an eight-hour absence
 * resolves to the same load the live run would have produced; and **it never
 * comes back empty**, because a trip that returned nothing would punish a
 * decision made an hour earlier.
 */

import { describe, expect, it } from 'vitest';

import { asContentId, asWorkerId } from '../../shared/ids';
import { WORKER_CARRY_CAPACITY } from '../world/worker';

import {
  createExpeditionRegistry,
  haulFor,
  HAUL_MAX,
  HAUL_MIN,
  isReachableDestination,
  returnTickOf,
  type ExpeditionDestination,
} from './expeditions';

const WHEAT = asContentId('core:wheat');
const WOOD = asContentId('core:wood');
const WORKER = asWorkerId(1);

/**
 * The declared yield the fixture uses.
 *
 * Chosen so the TOP of the band still fits a worker's hold: 12 × 1.25 = 15,
 * against a capacity of 20. A destination whose biggest haul overflows is
 * refused at registration, which the last block below is about.
 */
const YIELD = 12;

const destination = (overrides: Partial<ExpeditionDestination> = {}): ExpeditionDestination => ({
  id: asContentId('test:place'),
  displayName: 'Somewhere',
  sprite: 'buildings:tree',
  description: 'Over the hill.',
  travelTicks: 1_000,
  supplies: [{ item: WHEAT, quantity: 4 }],
  yields: [{ item: WOOD, quantity: YIELD }],
  requires: 'newcomer',
  ...overrides,
});

describe('what a destination must be to be registered', () => {
  it('accepts a well-formed one', () => {
    expect(isReachableDestination(destination())).toBe(true);
  });

  it('refuses one that takes no time', () => {
    // A trip that returns on the tick it left would let a player farm the haul
    // by sending the same worker over and over.
    expect(isReachableDestination(destination({ travelTicks: 0 }))).toBe(false);
    expect(isReachableDestination(destination({ travelTicks: -1 }))).toBe(false);
  });

  it('refuses a fractional travel time', () => {
    // Integers only (ADR-007 §7) — a fractional tick count is a comparison
    // that lands differently depending on how the gap was stepped.
    expect(isReachableDestination(destination({ travelTicks: 10.5 }))).toBe(false);
  });

  it('refuses one that brings nothing back', () => {
    expect(isReachableDestination(destination({ yields: [] }))).toBe(false);
  });

  it('refuses a non-positive quantity, in either direction', () => {
    expect(isReachableDestination(destination({ yields: [{ item: WOOD, quantity: 0 }] }))).toBe(
      false,
    );
    expect(isReachableDestination(destination({ supplies: [{ item: WHEAT, quantity: -1 }] }))).toBe(
      false,
    );
  });

  it('accepts one that costs nothing to outfit', () => {
    // Supplies are not the balancing lever — the WORKER is (§5) — so a
    // destination with no supply cost is legal content, not a mistake.
    expect(isReachableDestination(destination({ supplies: [] }))).toBe(true);
  });
});

describe('the haul is derived, not rolled', () => {
  it('gives the same load for the same departure, every time', () => {
    // THE ONE THAT MATTERS. This is what lets a closed game resolve exactly:
    // the answer does not depend on how many ticks were simulated.
    const place = destination();
    expect(haulFor(place, 4242, WORKER, 900)).toEqual(haulFor(place, 4242, WORKER, 900));
  });

  it('differs across departure ticks', () => {
    const place = destination();
    const loads = new Set(
      Array.from({ length: 40 }, (_, i) => haulFor(place, 4242, WORKER, i * 37)[0]?.quantity),
    );

    expect(loads.size).toBeGreaterThan(1);
  });

  it('differs between two workers who left on the same tick', () => {
    // The worker is folded into the mix so a crew sent out together does not
    // come home carrying identical loads.
    const place = destination();
    const loads = new Set(
      Array.from(
        { length: 20 },
        (_, i) => haulFor(place, 4242, asWorkerId(i + 1), 500)[0]?.quantity,
      ),
    );

    expect(loads.size).toBeGreaterThan(1);
  });

  it('differs between seeds', () => {
    const place = destination();
    const loads = new Set(
      Array.from({ length: 40 }, (_, i) => haulFor(place, i * 7919, WORKER, 500)[0]?.quantity),
    );

    expect(loads.size).toBeGreaterThan(1);
  });
});

describe('the band, and its floor', () => {
  it('stays inside the declared band', () => {
    const place = destination();

    for (let tick = 0; tick < 3_000; tick += 1) {
      const quantity = haulFor(place, 4242, WORKER, tick)[0]?.quantity ?? 0;
      expect(quantity).toBeGreaterThanOrEqual(Math.floor(YIELD * HAUL_MIN));
      expect(quantity).toBeLessThanOrEqual(Math.floor(YIELD * HAUL_MAX));
    }
  });

  it('uses the whole band rather than clustering', () => {
    const place = destination();
    const seen = new Set<number>();
    for (let tick = 0; tick < 3_000; tick += 1) {
      seen.add(haulFor(place, 4242, WORKER, tick)[0]?.quantity ?? 0);
    }

    // 9..15 is the band for a declared 12. A hash that produced three values
    // would satisfy every bound above while feeling like a fixed reward.
    expect(seen.size).toBeGreaterThan(5);
  });

  it('never comes back empty, even for a yield of one', () => {
    // `floor(1 × 0.75)` is zero. A stated yield of one that arrives as nothing
    // is the failure outcome §4 refuses — a punished decision from an hour ago.
    const place = destination({ yields: [{ item: WOOD, quantity: 1 }] });

    for (let tick = 0; tick < 2_000; tick += 1) {
      expect(haulFor(place, 4242, WORKER, tick)[0]?.quantity).toBeGreaterThanOrEqual(1);
    }
  });

  it('brings back every declared item', () => {
    const place = destination({
      yields: [
        { item: WOOD, quantity: 8 },
        { item: WHEAT, quantity: 4 },
      ],
    });

    expect(haulFor(place, 4242, WORKER, 100).map((stack) => stack.item)).toEqual([WOOD, WHEAT]);
  });

  it('returns integer quantities', () => {
    const place = destination();
    for (let tick = 0; tick < 500; tick += 1) {
      for (const stack of haulFor(place, 4242, WORKER, tick)) {
        expect(Number.isInteger(stack.quantity)).toBe(true);
      }
    }
  });
});

describe('when it comes back', () => {
  it('is the departure plus the travel time', () => {
    expect(returnTickOf(destination({ travelTicks: 1_200 }), 5_000)).toBe(6_200);
  });
});

describe('the registry', () => {
  it('starts empty and takes a destination', () => {
    const registry = createExpeditionRegistry();
    expect(registry.size).toBe(0);

    expect(registry.register(destination()).ok).toBe(true);
    expect(registry.size).toBe(1);
  });
});

describe('a haul that could not be carried is refused at registration', () => {
  it('refuses a destination whose biggest haul overflows the hold', () => {
    // ADR-011 §7: a conserved quantity may never be silently discarded. A
    // worker leaves empty-handed and comes back carrying, so a haul that
    // cannot fit would have to drop the remainder. Refused where the author is
    // told, rather than discovered as items vanishing on a return.
    expect(
      isReachableDestination(
        destination({ yields: [{ item: WOOD, quantity: WORKER_CARRY_CAPACITY }] }),
      ),
    ).toBe(false);
  });

  it('measures against the TOP of the band, not the declared figure', () => {
    // A declared yield that just fits still overflows a quarter of the time.
    const justUnder = Math.floor(WORKER_CARRY_CAPACITY / HAUL_MAX);

    expect(
      isReachableDestination(destination({ yields: [{ item: WOOD, quantity: justUnder }] })),
    ).toBe(true);
    expect(
      isReachableDestination(destination({ yields: [{ item: WOOD, quantity: justUnder + 1 }] })),
    ).toBe(false);
  });

  it('sums across every declared item', () => {
    const half = Math.floor(WORKER_CARRY_CAPACITY / 2);
    expect(
      isReachableDestination(
        destination({
          yields: [
            { item: WOOD, quantity: half },
            { item: WHEAT, quantity: half },
          ],
        }),
      ),
    ).toBe(false);
  });
});
