/**
 * `GAME_DESIGN.md` §3.2, as an assertion. Phase-55 — ADR-046 §4.
 *
 * §3.2 is the single most important balance decision in the game, and it is
 * stated there in one sentence:
 *
 * > Longer crops yield strictly better coins-per-second. This is the opposite
 * > of most active games and is the single most important balance decision in
 * > v0.1: **it makes going away the optimal strategy.**
 *
 * Four versions and twelve crops later, nothing had ever checked it. It held by
 * inspection while there were four crops on one obvious ladder; it will not
 * keep holding by inspection now that there are twelve, and the failure mode is
 * silent — a crop priced slightly wrong makes patience mildly suboptimal, no
 * test notices, and `VISION.md` §2.2 quietly stops being true of the economy
 * that implements it.
 *
 * ## Why this is separate from the census
 *
 * `content-census.test.ts` R-02 asks whether any crop is DOMINATED — a
 * property of one season's menu, which is about whether the player has a
 * choice. This asks whether the whole table still slopes the right way, which
 * is about whether the game still rewards absence. They fail for different
 * reasons and would want different fixes, so they are different tests.
 *
 * ## What it does not assert
 *
 * Any particular price. ADR-046 §4 delegates balance for v0.6 and ADR-044 sets
 * the standard: a change needs a measurement behind it. Pinning the numbers
 * here would convert every legitimate tuning pass into a test edit, which is
 * how a guard becomes a nuisance and then becomes a `.skip`.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { createInstalledRegistries } from '../src/sim/content/installed';

const content = createInstalledRegistries();

/** Coins a harvest is worth at base price, before the dynamic multiplier. */
function harvestValue(crop: {
  readonly harvestYield: readonly { item: string; quantity: number }[];
}): number {
  let total = 0;
  for (const stack of crop.harvestYield) {
    const item = content.items.get(stack.item as never);
    if (item.ok) total += item.value.basePrice * stack.quantity;
  }
  return total;
}

interface Row {
  readonly id: string;
  readonly ticks: number;
  readonly seedCost: number;
  readonly value: number;
  /** What §3.2 measures: profit per tile per tick. */
  readonly rate: number;
}

function table(): Row[] {
  return content.crops
    .all()
    .map((crop) => {
      const value = harvestValue(crop);
      return {
        id: String(crop.id),
        ticks: crop.growthTicks,
        seedCost: crop.seedCost,
        value,
        rate: (value - crop.seedCost) / crop.growthTicks,
      };
    })
    .sort((a, b) => a.ticks - b.ticks || a.rate - b.rate);
}

describe('GAME_DESIGN.md §3.2 — patience pays', () => {
  it('a longer crop never earns a worse rate than a shorter one', () => {
    const rows = table();
    const regressions: string[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const shorter = rows[i - 1];
      const longer = rows[i];
      if (shorter === undefined || longer === undefined) continue;
      // Equal growth times are allowed to tie — leek and wheat deliberately do
      // (`GAME_DESIGN.md` §3.1b): identical time, identical rate, different
      // capital. Only a LONGER crop paying LESS breaks §3.2.
      if (longer.ticks > shorter.ticks && longer.rate < shorter.rate) {
        regressions.push(
          `${longer.id} (${String(longer.ticks)}t, ${longer.rate.toFixed(5)}/t) earns less than ` +
            `${shorter.id} (${String(shorter.ticks)}t, ${shorter.rate.toFixed(5)}/t)`,
        );
      }
    }

    expect(
      regressions,
      'GAME_DESIGN.md §3.2: longer crops must yield strictly better coins-per-second, ' +
        'because that is what makes going away the optimal strategy (VISION.md §2.2):\n  ' +
        regressions.join('\n  '),
    ).toEqual([]);
  });

  it('the slowest crop still pays meaningfully better than the fastest', () => {
    // §3.2 quantifies the promise: "nearly twice as much for a fraction of the
    // attention". A table that technically slopes upward but flattens to a few
    // percent would satisfy the test above and break the promise, so the SPREAD
    // is asserted as well as the ordering.
    //
    // The bound is 1.5x rather than the 1.82x v0.1 measured, because v0.6 added
    // crops at both ends and the ends are what set the ratio. It is a floor on
    // the promise, not a target.
    const rows = table();
    const fastest = rows[0];
    const slowest = rows[rows.length - 1];
    expect(fastest, 'no crops registered').toBeDefined();
    expect(slowest).toBeDefined();

    const spread = (slowest?.rate ?? 0) / (fastest?.rate ?? 1);
    expect(
      spread,
      `the patience premium has flattened to ${spread.toFixed(2)}x — ` +
        `${String(fastest?.id)} earns ${(fastest?.rate ?? 0).toFixed(5)}/tick and ` +
        `${String(slowest?.id)} earns ${(slowest?.rate ?? 0).toFixed(5)}/tick`,
    ).toBeGreaterThan(1.5);
  });

  it('seed cost rises with the crop it buys, so patience still needs capital', () => {
    // §3.2's counterweight: "pumpkin seeds cost 12x turnip seeds, so early
    // players cannot access the efficient crops. Progression is therefore about
    // affording patience."
    //
    // Asserted against the RATE rather than against growth time, because that
    // is what the sentence is about — a crop that earns more per tick must cost
    // more to start. The leek is why: it is long AND cheap, which is fine
    // precisely because its rate is low.
    const rows = [...table()].sort((a, b) => a.rate - b.rate);
    const inversions: string[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const worse = rows[i - 1];
      const better = rows[i];
      if (worse === undefined || better === undefined) continue;
      if (better.rate > worse.rate && better.seedCost < worse.seedCost) {
        inversions.push(
          `${better.id} earns more per tick than ${worse.id} and costs less to plant ` +
            `(${String(better.seedCost)} vs ${String(worse.seedCost)})`,
        );
      }
    }

    expect(
      inversions,
      'a crop that earns a better rate must cost more to start, or patience stops ' +
        'needing capital and GAME_DESIGN.md §3.2’s counterweight is gone:\n  ' +
        inversions.join('\n  '),
    ).toEqual([]);
  });

  it('prints the table, so a rebalance can be read rather than recomputed', () => {
    console.table(
      table().map((row) => ({
        crop: row.id,
        seconds: row.ticks / 20,
        seed: row.seedCost,
        sell: row.value,
        'coins/sec': ((row.value - row.seedCost) / (row.ticks / 20)).toFixed(3),
      })),
    );
    expect(table().length).toBeGreaterThan(0);
  });
});
