/**
 * Memory growth over an accelerated 8-hour session. Phase-07 acceptance
 * criterion 26; `PERFORMANCE.md` §10.1 ("> 25 MB over an accelerated 8-hour
 * simulation" fails the gate).
 *
 * The scenario is the reference save — the committed `v1-mature-farm.json`,
 * loaded through the real pipeline — so the measurement is of a farm that
 * actually exists rather than an empty world where nothing can leak.
 *
 * WHAT WOULD FAIL THIS: a collection that grows with PLAYTIME rather than
 * world size (`SAVE_FORMAT.md` §3.4 names that as the hazard) — an unpruned
 * event log, a task history, per-tick snapshots retained, a subscriber set
 * that never unsubscribes. Eight hours at 20 Hz is 576,000 ticks, which is
 * long enough for any per-tick retention to be unmistakable against the
 * ceiling.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { loadWorld } from '../src/persistence/load';
import { OFFLINE_CAP_TICKS } from '../src/shared/constants';
import { stepSimulationBy } from '../src/sim/tick';
import type { World } from '../src/sim/world/world';

/** `PERFORMANCE.md` §10.1. */
const GROWTH_CEILING_BYTES = 25 * 1024 * 1024;

/** Ticks in eight hours — the same span the offline cap covers. */
const EIGHT_HOURS_TICKS = OFFLINE_CAP_TICKS;

/** Stepped in chunks so no single call holds an unbounded intermediate. */
const CHUNK_TICKS = 20_000;

function referenceWorld(): World {
  const path = join(__dirname, 'fixtures', 'saves', 'v1-mature-farm.json');
  const loaded = loadWorld(JSON.parse(readFileSync(path, 'utf8')), null);
  if (!loaded.ok) throw new Error(`reference save did not load: ${loaded.error.message}`);
  return loaded.value.world;
}

/**
 * A collection this process can actually force.
 *
 * Enabled from inside rather than through a runner flag, so the gate cannot
 * be silently downgraded by a config change: an uncollected heap reading is
 * garbage plus live data, which measures the scheduler, not a leak.
 */
function forceCollection(): void {
  setFlagsFromString('--expose_gc');
  try {
    (runInNewContext('gc') as () => void)();
    (runInNewContext('gc') as () => void)();
  } finally {
    setFlagsFromString('--no-expose_gc');
  }
}

/** Heap in use once everything collectable has been collected. */
function settledHeapBytes(): number {
  forceCollection();
  return process.memoryUsage().heapUsed;
}

/**
 * Real 8-hour scenarios cost real time: 576,000 ticks of three workers
 * pathing across a stocked 16×16 plot runs for minutes, not seconds. Stated
 * as an explicit timeout rather than raised globally, so the cost is
 * attributed to the one gate that incurs it.
 *
 * RAISED FROM 300s IN PHASE-27, and the reason is worth recording because it
 * is the second time: this is a RUNNER budget, not a game budget. ADR-037
 * widened the grid from 80 to 112 columns — 1.4× the tiles for A* to consider
 * and for worker scans to walk — so the same 576,000 ticks cost more wall
 * clock. Under a full-suite load the run took 308s against the old 300s
 * allowance and timed out, while passing comfortably in isolation.
 *
 * The MEASUREMENT is untouched: the 25 MB ceiling this gate exists to enforce
 * is exactly where it was. Only the time the runner is allowed to take has
 * moved, which is the v0.3 lesson applied on schedule — "budgets that measure
 * the runner, not the game, should gain headroom in the same commit that adds
 * a tick system", and a grid widening is that in every respect that matters
 * here.
 */
const EIGHT_HOUR_RUN_TIMEOUT_MS = 900_000;

/*
 * RAISED 600 s -> 900 s AT PHASE 61, with the measurement that justified it.
 *
 * This timed out at 605 s inside the full v0.6 suite. Measured alone on an idle
 * machine it takes **502 s and passes**, and the memory ceiling it exists to
 * check — 25 MB of growth over 576,000 ticks — is not the thing that failed:
 * heap growth was inside budget, the runner simply ran out of patience.
 *
 * 502 s against a 600 s budget is 84% of the allowance spent before anything
 * else on the machine competes, and a full suite reliably adds about a fifth
 * (`tests/long-run-budget.ts` records the same effect on `catch-up.test.ts`).
 * The margin was gone; this restores it.
 *
 * **Why the runner and not the game.** The header above already fixed this
 * rule: "the runner, not the game, should gain headroom in the same commit that
 * adds a tick system". v0.6 added no system, but it roughly doubled the content
 * the tick loop resolves — twelve crops against four, twenty-nine items against
 * thirteen — and that is the same argument for the same reason. What the
 * simulation actually costs is measured deliberately, uninstrumented, in
 * `PERFORMANCE.md`; a timeout here detects a hang.
 */

describe('memory growth over 8 accelerated hours (criterion 26)', () => {
  it(
    'stays under the 25 MB ceiling on the reference farm',
    () => {
      const world = referenceWorld();

      // Warm first: the first few thousand ticks allocate the steady-state
      // structures (task objects, path buffers) that a baseline taken at tick
      // zero would wrongly count as growth.
      stepSimulationBy(world, CHUNK_TICKS);
      const before = settledHeapBytes();

      for (let done = CHUNK_TICKS; done < EIGHT_HOURS_TICKS; done += CHUNK_TICKS) {
        stepSimulationBy(world, Math.min(CHUNK_TICKS, EIGHT_HOURS_TICKS - done));
      }

      const growth = settledHeapBytes() - before;

      expect(world.tick).toBeGreaterThanOrEqual(EIGHT_HOURS_TICKS);
      expect(growth).toBeLessThan(GROWTH_CEILING_BYTES);
    },
    EIGHT_HOUR_RUN_TIMEOUT_MS,
  );
});
