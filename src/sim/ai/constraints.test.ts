/**
 * Phase-14a — the filter stage, and the two rules it must not break.
 *
 * ADR-024's claim is that every future scheduling concept is a new constraint
 * rather than a new stage. Two things make that survivable rather than
 * aspirational, and both are tested here:
 *
 * 1. **Priority reorders, it never excludes** (§3). A player who sends a task
 *    kind to last must still see it done when nothing else remains.
 * 2. **Absent is unconstrained, empty is impossible.** "No zone" and "an empty
 *    zone" are different, and conflating them silently idles a farm.
 */

import { describe, expect, it } from 'vitest';

import { DayPhase } from '../time/game-clock';
import { WorkerTaskKind } from '../world/worker';

import {
  allowsWork,
  priorityOf,
  refusedBy,
  UNCONSTRAINED,
  WORK_CONSTRAINTS,
  type WorkCandidate,
} from './constraints';

const candidate = (over: Partial<WorkCandidate> = {}): WorkCandidate => ({
  kind: WorkerTaskKind.Harvest,
  tile: 100,
  phase: DayPhase.Day,
  ...over,
});

describe('an unconstrained worker may do anything', () => {
  it('allows every task kind, anywhere, at any phase', () => {
    for (const kind of [WorkerTaskKind.Harvest, WorkerTaskKind.Plant, WorkerTaskKind.Till]) {
      for (const phase of [DayPhase.Dawn, DayPhase.Day, DayPhase.Dusk, DayPhase.Night]) {
        expect(allowsWork(UNCONSTRAINED, candidate({ kind, phase }))).toBe(true);
      }
    }
  });
});

describe('permission — the task-kind constraint', () => {
  it('allows a permitted kind and refuses one left out', () => {
    const schedule = { taskKinds: [WorkerTaskKind.Harvest] };

    expect(allowsWork(schedule, candidate({ kind: WorkerTaskKind.Harvest }))).toBe(true);
    expect(allowsWork(schedule, candidate({ kind: WorkerTaskKind.Till }))).toBe(false);
  });

  it('refuses everything when the permitted set is EMPTY', () => {
    // Empty is not absent. A worker permitted no kinds may do nothing, which
    // is a legal thing to express and the reason ADR-024 §6 needs its
    // no-deadlock rules — the farm must keep re-planning around them.
    expect(allowsWork({ taskKinds: [] }, candidate())).toBe(false);
  });
});

describe('zone — the tile constraint', () => {
  it('allows a tile inside and refuses one outside', () => {
    const schedule = { zone: new Set([100, 101]) };

    expect(allowsWork(schedule, candidate({ tile: 100 }))).toBe(true);
    expect(allowsWork(schedule, candidate({ tile: 999 }))).toBe(false);
  });

  it('treats an empty zone as nowhere, not everywhere', () => {
    expect(allowsWork({ zone: new Set() }, candidate())).toBe(false);
    expect(allowsWork(UNCONSTRAINED, candidate())).toBe(true);
  });
});

describe('shift — the phase constraint', () => {
  it('allows a phase on shift and refuses one off it', () => {
    const schedule = { shift: [DayPhase.Day, DayPhase.Dusk] };

    expect(allowsWork(schedule, candidate({ phase: DayPhase.Day }))).toBe(true);
    expect(allowsWork(schedule, candidate({ phase: DayPhase.Night }))).toBe(false);
  });

  it('ignores the shift in a world with no phases at all', () => {
    // Refusing here would idle every worker in a world whose content declared
    // no day phases — a worse answer than ignoring a constraint that cannot
    // be evaluated.
    expect(allowsWork({ shift: [DayPhase.Day] }, candidate({ phase: undefined }))).toBe(true);
  });
});

describe('the declared evaluation order (ADR-024 §2)', () => {
  it('is stated once, in one place', () => {
    expect(WORK_CONSTRAINTS.map((c) => c.name)).toEqual(['permission', 'zone', 'shift']);
  });

  it('short-circuits on the first refusal, in that order', () => {
    // Constraints are pure predicates so order cannot change the OUTCOME; a
    // declared order is what keeps short-circuiting deterministic and
    // profiles comparable between runs.
    const refusedByAll = {
      taskKinds: [],
      zone: new Set<number>(),
      shift: [DayPhase.Night],
    };

    expect(refusedBy(refusedByAll, candidate())).toBe('permission');
    expect(refusedBy({ zone: new Set<number>(), shift: [DayPhase.Night] }, candidate())).toBe(
      'zone',
    );
    expect(refusedBy({ shift: [DayPhase.Night] }, candidate())).toBe('shift');
  });

  it('reports no refusal when everything allows', () => {
    expect(refusedBy(UNCONSTRAINED, candidate())).toBeNull();
  });
});

describe('priority is an ordering input, NOT a filter (ADR-024 §3)', () => {
  it('never refuses a task, however low it is ordered', () => {
    // The failure this rule exists to prevent: a deprioritised kind silently
    // never done, rather than done last.
    const schedule = { priority: [WorkerTaskKind.Plant, WorkerTaskKind.Harvest] };

    for (const kind of [WorkerTaskKind.Harvest, WorkerTaskKind.Plant, WorkerTaskKind.Till]) {
      expect(allowsWork(schedule, candidate({ kind })), kind).toBe(true);
    }
  });

  it('orders the kinds it names, first to last', () => {
    const schedule = { priority: [WorkerTaskKind.Till, WorkerTaskKind.Harvest] };

    expect(priorityOf(schedule, WorkerTaskKind.Till)).toBeLessThan(
      priorityOf(schedule, WorkerTaskKind.Harvest),
    );
  });

  it('sorts an unmentioned kind AFTER the ones named, never dropping it', () => {
    // A partial priority list is a legal thing for a player to express, and
    // every kind has to stay reachable.
    const schedule = { priority: [WorkerTaskKind.Till] };

    expect(priorityOf(schedule, WorkerTaskKind.Harvest)).toBeGreaterThan(
      priorityOf(schedule, WorkerTaskKind.Till),
    );
  });

  it('gives every kind the same rank when no priority is set', () => {
    for (const kind of [WorkerTaskKind.Harvest, WorkerTaskKind.Plant, WorkerTaskKind.Till]) {
      expect(priorityOf(UNCONSTRAINED, kind)).toBe(0);
    }
  });
});
