/**
 * Phase-14a — the three-stage pipeline against a real world.
 *
 * `constraints.test.ts` checks the vocabulary in isolation. What is checked
 * here is that the pipeline HONOURS it: that a constrained worker is filtered
 * rather than stopped, that priority reorders without excluding, and that a
 * worker constrained out of everything keeps re-planning and resumes the
 * instant the world changes (ADR-024 §6, `GAME_DESIGN.md` §4.2).
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../src/shared/geometry';
import { selectTask } from '../src/sim/ai/worker-tasks';
import { UNCONSTRAINED, type WorkerSchedule } from '../src/sim/ai/constraints';
import { CORE_TURNIP } from '../src/sim/content/crops';
import { DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { tillTile } from '../src/sim/commands/crop-commands';
import { addItems } from '../src/sim/world/container';
import { WorkerTaskKind } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

import type { TileIndex } from '../src/shared/ids';

const HOME: TileIndex = toIndexUnchecked(30, 30);

/** A farm with seeds and a row of tilled ground — work of two kinds available. */
function farm(seed = 3): World {
  const world = createWorld(seed);
  const turnip = world.cropRegistry.get(CORE_TURNIP);
  if (!turnip.ok) throw new Error('setup failed');
  addItems(world.inventory, turnip.value.seedItem, 100, DEFAULT_STACK_SIZE);

  for (let x = 28; x < 34; x += 1) tillTile(world, toIndexUnchecked(x, 30));
  return world;
}

const pick = (world: World, schedule: WorkerSchedule = UNCONSTRAINED) =>
  selectTask(world, HOME, new Set(), schedule);

describe('the filter stage changes what is offered, not whether anything is', () => {
  it('offers planting to an unconstrained worker', () => {
    expect(pick(farm())?.kind).toBe(WorkerTaskKind.Plant);
  });

  it('offers tilling instead when planting is not permitted', () => {
    // Filtered, not stopped: the worker moves to other work rather than idling.
    const task = pick(farm(), { taskKinds: [WorkerTaskKind.Till] });

    expect(task).not.toBeNull();
    expect(task?.kind).toBe(WorkerTaskKind.Till);
  });

  it('offers only tiles inside the zone', () => {
    const inside = toIndexUnchecked(29, 30);
    const task = pick(farm(), { zone: new Set([inside]) });

    expect(task?.tile).toBe(inside);
  });

  it('offers nothing while the worker is off shift', () => {
    // A legal state, and the reason ADR-024 §6 exists: the farm must keep
    // re-planning around it rather than treating it as a stall.
    const world = farm();
    const offShift = pick(world, { shift: [] });

    expect(offShift).toBeNull();
  });
});

describe('a worker constrained out of everything (ADR-024 §6)', () => {
  it('resumes the instant the constraint changes, with nothing else touched', () => {
    // No command, no world change — only the schedule. The acceptance is that
    // re-planning continues rather than needing a nudge.
    const world = farm();

    expect(pick(world, { taskKinds: [] })).toBeNull();
    expect(pick(world, UNCONSTRAINED)).not.toBeNull();
  });

  it('resumes the instant the WORLD changes, with the schedule untouched', () => {
    // The mirror case: a zone whose only tile has no work, which gains some.
    //
    // The tile must be OWNED — discovery only enumerates owned tiles, so a
    // zone pointing outside the plot is empty for a reason that has nothing
    // to do with scheduling, and the first version of this test proved that
    // instead of what it meant to.
    const only = toIndexUnchecked(29, 30);
    const world = createWorld(9); // no seeds
    tillTile(world, only); // tilled, so no tilling left and nothing to plant
    const schedule: WorkerSchedule = { zone: new Set([only]) };

    expect(pick(world, schedule)).toBeNull();

    const turnip = world.cropRegistry.get(CORE_TURNIP);
    if (!turnip.ok) throw new Error('setup failed');
    addItems(world.inventory, turnip.value.seedItem, 10, DEFAULT_STACK_SIZE);

    expect(pick(world, schedule)?.kind).toBe(WorkerTaskKind.Plant);
  });
});

describe('priority reorders and never excludes (ADR-024 §3)', () => {
  it('brings a deprioritised-elsewhere kind first when asked', () => {
    const world = farm();

    expect(pick(world)?.kind).toBe(WorkerTaskKind.Plant);
    expect(pick(world, { priority: [WorkerTaskKind.Till] })?.kind).toBe(WorkerTaskKind.Till);
  });

  it('STILL performs a kind ordered last when nothing else is available', () => {
    // The acceptance `ROADMAP.md` §10 states, and the failure the rule exists
    // to prevent: a player who sends tilling to last should see it done when
    // there is nothing else, not see it never done.
    const world = createWorld(9); // no seeds, so planting is impossible
    for (let x = 28; x < 32; x += 1) tillTile(world, toIndexUnchecked(x, 30));

    const task = pick(world, { priority: [WorkerTaskKind.Harvest, WorkerTaskKind.Plant] });

    expect(task?.kind).toBe(WorkerTaskKind.Till);
  });

  it('is stable — the same world and schedule choose the same task', () => {
    const world = farm();
    const schedule: WorkerSchedule = { priority: [WorkerTaskKind.Till] };
    const first = pick(world, schedule);

    for (let call = 0; call < 20; call += 1) {
      expect(pick(world, schedule)).toEqual(first);
    }
  });
});

describe('an absent schedule is the behaviour that shipped', () => {
  it('chooses identically with no schedule and with an empty one', () => {
    // The optional parameter is what made this a non-breaking change: a
    // worker with no schedule is filtered by nothing.
    const world = farm();

    expect(selectTask(world, HOME, new Set())).toEqual(pick(world, UNCONSTRAINED));
  });
});
