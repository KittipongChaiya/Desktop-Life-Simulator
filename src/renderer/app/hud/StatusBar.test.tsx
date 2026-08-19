/**
 * @vitest-environment jsdom
 *
 * StatusBar tests. Phase-01 acceptance criterion 17.
 *
 * The zero-commit assertion is the enforcement mechanism for ADR-005 §2. If it
 * is ever deleted or skipped, that ADR has failed — a UI re-rendering at tick
 * rate looks completely normal while quietly burning the idle CPU budget the
 * whole product rests on (VISION.md §2.1).
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { Profiler, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TICKS_PER_SECOND } from '../../../shared/constants';
import { stepSimulationBy } from '../../../sim/tick';
import { createWorld } from '../../../sim/world/world';
import { createSnapshotStore, type SnapshotStore } from '../../bootstrap/snapshot-store';
import { createActionFeedback } from '../action-feedback';
import type { OverlayController } from '../overlay-controller';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';
import { createZonePaintingController } from '../zone-painting';

import { StatusBar } from './StatusBar';

function stubOverlay(collapsed = true): OverlayController {
  return {
    isCollapsed: () => collapsed,
    setCollapsed: vi.fn(),
    toggle: vi.fn(),
    subscribe: () => () => undefined,
    setPointerOverUi: vi.fn(),
    quit: vi.fn(),
  };
}

/**
 * Renders the StatusBar under a Profiler that counts commits.
 *
 * Returns void deliberately: React 19's ReactNode union includes Promise, so
 * returning the render result makes every discarded call look like a floating
 * promise to the linter.
 */
function mount(store: SnapshotStore, onRender: () => void, overlay = stubOverlay()): void {
  render(
    <StrictMode>
      <AppProviders
        zonePainting={createZonePaintingController()}
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={store}
        overlay={overlay}
      >
        <Profiler id="status" onRender={onRender}>
          <StatusBar />
        </Profiler>
      </AppProviders>
    </StrictMode>,
  );
}

afterEach(() => {
  // Vitest runs without globals, so testing-library's automatic cleanup never
  // registers. Without this, renders accumulate in document.body and queries
  // match elements from previous tests — a failure that only appears when the
  // suite runs together, never in isolation.
  cleanup();
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('shows uptime and tick count from the status slice', () => {
    const world = createWorld(1);
    stepSimulationBy(world, TICKS_PER_SECOND * 65);
    const store = createSnapshotStore(world.snapshots);

    mount(store, () => undefined);

    // Plain textContent rather than jest-dom matchers: the assertion is just
    // as clear and avoids a dependency for two checks (TECH_STACK.md §7.1).
    expect(screen.getByTitle('Simulation uptime').textContent).toBe('01:05');
    expect(screen.getByTitle('Simulation ticks elapsed').textContent).toBe('1,300 ticks');
  });

  it('exposes an accessible toggle', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    mount(store, () => undefined);

    expect(screen.getByRole('button', { name: 'Expand overlay' })).toBeDefined();
  });
});

describe('idle cost (criterion 17)', () => {
  it('does not commit while the world is static', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    let commits = 0;
    mount(store, () => {
      commits += 1;
    });

    const afterMount = commits;

    // 10 simulated seconds of frames with NO simulation advance.
    void act(() => {
      for (let frame = 0; frame < 600; frame += 1) {
        store.pump(frame * (1000 / 60));
      }
    });

    expect(commits).toBe(afterMount);
  });

  it('does not commit for ticks that change nothing observable', () => {
    const world = createWorld(1);
    // Settle the first tick before mounting: every slice documents a one-time
    // first-tick correction (inventory capacity, the 06d wallet balance), and
    // this test is about STEADY-STATE ticks, not the world coming up.
    stepSimulationBy(world, 1);
    const store = createSnapshotStore(world.snapshots);

    let commits = 0;
    mount(store, () => {
      commits += 1;
    });
    const afterMount = commits;

    // Under one second of ticks: uptimeSeconds never changes.
    void act(() => {
      stepSimulationBy(world, TICKS_PER_SECOND - 2);
      store.pump(1000);
    });

    expect(commits).toBe(afterMount);
  });

  it('commits about once per second while running, not once per tick', () => {
    const world = createWorld(1);
    const store = createSnapshotStore(world.snapshots);

    let commits = 0;
    mount(store, () => {
      commits += 1;
    });
    const afterMount = commits;

    // 5 seconds == 100 ticks. A bridge-less UI would commit 100 times.
    for (let second = 1; second <= 5; second += 1) {
      void act(() => {
        stepSimulationBy(world, TICKS_PER_SECOND);
        store.pump(second * 1000);
      });
    }

    const commitsWhileRunning = commits - afterMount;
    expect(commitsWhileRunning).toBeGreaterThan(0);
    expect(commitsWhileRunning).toBeLessThanOrEqual(6);
  });
});
