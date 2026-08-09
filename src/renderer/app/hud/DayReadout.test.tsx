/**
 * @vitest-environment jsdom
 *
 * Phase-10b — the `time` slice's consumer, and the cost of reading it.
 *
 * The republish count is asserted against the simulation in
 * `src/sim/snapshot/time-slice.test.ts`. What is asserted HERE is the half that
 * test cannot see: that a slice republishing four times a day produces four
 * React commits, rather than the subscription or the throttle turning it back
 * into per-tick work. Both halves are needed — ADR-005 §2's guarantee spans the
 * boundary between them.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { Profiler, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DAYS_PER_SEASON,
  DEFAULT_TICKS_PER_DAY,
  UI_UPDATE_HZ,
} from '../../../shared/constants';
import { stepSimulationBy } from '../../../sim/tick';
import { DayPhase, phaseStartTick } from '../../../sim/time/game-clock';
import { createWorld } from '../../../sim/world/world';
import { createSnapshotStore, type SnapshotStore } from '../../bootstrap/snapshot-store';
import { createActionFeedback } from '../action-feedback';
import type { OverlayController } from '../overlay-controller';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';

import { DayReadout } from './DayReadout';

const DAY = DEFAULT_TICKS_PER_DAY;

function stubOverlay(): OverlayController {
  return {
    isCollapsed: () => true,
    setCollapsed: vi.fn(),
    toggle: vi.fn(),
    subscribe: () => () => undefined,
    setPointerOverUi: vi.fn(),
    quit: vi.fn(),
  };
}

function mount(store: SnapshotStore, onRender: () => void): void {
  render(
    <StrictMode>
      <AppProviders
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={store}
        overlay={stubOverlay()}
      >
        <Profiler id="day" onRender={onRender}>
          <DayReadout />
        </Profiler>
      </AppProviders>
    </StrictMode>,
  );
}

/** Advances the sim and lets the store deliver, as a real frame would. */
function advance(store: SnapshotStore, world: ReturnType<typeof createWorld>, ticks: number): void {
  void act(() => {
    stepSimulationBy(world, ticks);
    // Past the throttle window, so a pending notification is never withheld
    // for a reason this test is not about.
    store.pump(world.tick * (1000 / UI_UPDATE_HZ));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('what the player reads', () => {
  it('shows the first day as day 1, not day 0', () => {
    const world = createWorld(1);
    // One tick, so the slice holds the world's own season rather than the
    // season-less value `createSnapshotState` seeds it with.
    stepSimulationBy(world, 1);
    mount(createSnapshotStore(world.snapshots), () => undefined);

    expect(screen.getByTitle('In-game day and time of day').textContent).toBe(
      'Day 1 · Dawn · Spring',
    );
  });

  it('names the phase the world is in', () => {
    const world = createWorld(1);
    stepSimulationBy(world, phaseStartTick(DayPhase.Dusk, DAY));
    mount(createSnapshotStore(world.snapshots), () => undefined);

    expect(screen.getByTitle('In-game day and time of day').textContent).toBe(
      'Day 1 · Dusk · Spring',
    );
  });

  it('follows the world across a phase boundary', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);
    mount(store, () => undefined);

    advance(store, world, phaseStartTick(DayPhase.Night, DAY));

    expect(screen.getByTitle('In-game day and time of day').textContent).toBe(
      'Day 1 · Night · Spring',
    );
  });

  it('rolls over to the next day at midnight', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);
    mount(store, () => undefined);

    advance(store, world, DAY);

    expect(screen.getByTitle('In-game day and time of day').textContent).toBe(
      'Day 2 · Dawn · Spring',
    );
  });
});

describe('idle cost across a full day (ADR-005 §2)', () => {
  it('commits four times over a day, not once per tick', () => {
    // A weather period longer than the run, so this counts phase changes
    // rather than phase changes plus weather changes (phase-12d).
    const world = createWorld(1, { ticksPerWeatherPeriod: 1_000_000_000 });
    // Settle the first tick before mounting: the time slice corrects its
    // seeded (season-less) value once at world start, and this test is about
    // STEADY-STATE ticks.
    stepSimulationBy(world, 1);
    const store = createSnapshotStore(world.snapshots);

    let commits = 0;
    mount(store, () => {
      commits += 1;
    });
    const afterMount = commits;

    // A full day, delivered in chunks small enough that the throttle can never
    // coalesce two phase changes into one notification — otherwise a passing
    // count would prove nothing.
    for (let elapsed = 0; elapsed < DAY; elapsed += DAY / 100) {
      advance(store, world, DAY / 100);
    }

    // A full day beyond the settling tick.
    expect(world.tick).toBe(DAY + 1);
    expect(commits - afterMount).toBe(4);
  });

  it('does not commit while the phase holds', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);
    // Land inside a phase, not on its edge.
    stepSimulationBy(world, phaseStartTick(DayPhase.Day, DAY) + 100);

    let commits = 0;
    mount(store, () => {
      commits += 1;
    });
    const afterMount = commits;

    advance(store, world, 1000);

    expect(commits).toBe(afterMount);
  });
});

describe('the season in the readout (phase-11c)', () => {
  it('names the season alongside the day and phase', () => {
    const world = createWorld(1);
    world.tick = DEFAULT_TICKS_PER_DAY * DEFAULT_DAYS_PER_SEASON * 2 + 100;
    stepSimulationBy(world, 1);
    mount(createSnapshotStore(world.snapshots), () => undefined);

    expect(screen.getByTitle('In-game day and time of day').textContent).toContain('Autumn');
  });

  it('omits it entirely in a world whose content registered no seasons', () => {
    // Not "Season: none" — a world without seasons should read as a world
    // that simply has a day, which is what v0.2 looked like one phase ago.
    const world = createWorld(1, { seasons: [] });
    stepSimulationBy(world, 1);
    mount(createSnapshotStore(world.snapshots), () => undefined);

    expect(screen.getByTitle('In-game day and time of day').textContent).toBe('Day 1 · Dawn');
  });
});
