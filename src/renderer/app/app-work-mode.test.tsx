/**
 * @vitest-environment jsdom
 *
 * Work mode strips the interface to the living world. Phase-01.8c
 * (fix/0.1/1.8.md §5: hide all HUD panels; keep world, workers, crops,
 * buildings — the world itself is PixiJS and not React's concern, so React's
 * whole job in work mode is to get out of the way).
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ok } from '../../shared/result';
import { CommandSource, type Command } from '../../sim/commands/types';
import { stepSimulation } from '../../sim/tick';
import { createWorld } from '../../sim/world/world';
import { createSnapshotStore } from '../bootstrap/snapshot-store';

import { createActionFeedback } from './action-feedback';
import { App } from './App';
import { createCompanionController, type CompanionBridge } from './companion-controller';
import { createPlacementController } from './placement';
import { createReturnSummary } from './return-summary';
import { createSaveController } from './save-controller';
import { createSeedSelection } from './seed-selection';
import { AppProviders } from './store-context';
import { createToolSelection } from './tool-selection';
import { createUpdateController } from './update-controller';

interface BridgeState {
  readonly opacityPercent: number;
  readonly workMode: boolean;
  readonly clickThrough: boolean;
  readonly hidden: boolean;
}

const state = (overrides: Partial<BridgeState> = {}): BridgeState => ({
  opacityPercent: 100,
  workMode: false,
  clickThrough: false,
  hidden: false,
  volumePercent: 60,
  muted: true,
  ...overrides,
});

function mount(initial: BridgeState): { emit(next: BridgeState): void } {
  let listener: ((next: BridgeState) => void) | null = null;
  const bridge: CompanionBridge = {
    setOpacity: (percent) => Promise.resolve(state({ opacityPercent: percent })),
    getState: () => Promise.resolve(initial),
    onStateChanged(next) {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };

  const world = createWorld(1);
  stepSimulation(world);

  render(
    <StrictMode>
      <AppProviders
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={createSnapshotStore(world.snapshots)}
        overlay={
          {
            isCollapsed: () => false,
            setCollapsed: vi.fn(),
            toggle: vi.fn(),
            subscribe: () => () => undefined,
            setPointerOverUi: vi.fn(),
            quit: vi.fn(),
          } as never
        }
        player={{
          submit: (command: Command) =>
            ok({ id: 1, source: CommandSource.Player, dispatchedTick: 0, command }),
        }}
        selection={
          {
            selected: () => null,
            select: vi.fn(),
            subscribe: () => () => undefined,
          } as never
        }
        placement={createPlacementController()}
        seeds={createSeedSelection()}
        companion={createCompanionController(bridge)}
        update={createUpdateController({
          getState: () => Promise.resolve({ currentVersion: '0.2.0', pinnedVersion: null }),
          setPinnedVersion: (version) =>
            Promise.resolve({ currentVersion: '0.2.0', pinnedVersion: version }),
          onAnnouncement: () => () => undefined,
        })}
        save={createSaveController({
          write: () => Promise.resolve({ ok: true }),
          defer: (run) => run(),
        })}
        returnSummary={createReturnSummary(null)}
      >
        <App />
      </AppProviders>
    </StrictMode>,
  );

  return {
    emit(next) {
      act(() => {
        listener?.(next);
      });
    },
  };
}

afterEach(cleanup);

describe('App in work mode', () => {
  it('normal mode shows the status bar and the panels', () => {
    mount(state());

    expect(screen.getByTitle('Simulation uptime')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();
  });

  it('work mode strips every HUD surface — React gets out of the way', async () => {
    mount(state({ workMode: true }));
    // Hydration is async; the strip lands with it.
    await screen.findByTestId('app-root');

    expect(screen.queryByTitle('Simulation uptime')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Shop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Inventory/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /worker/i })).toBeNull();
  });

  it('leaving work mode brings the interface back', async () => {
    const harness = mount(state({ workMode: true }));
    await screen.findByTestId('app-root');
    expect(screen.queryByTitle('Simulation uptime')).toBeNull();

    harness.emit(state({ workMode: false }));
    expect(screen.getByTitle('Simulation uptime')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeDefined();
  });
});
