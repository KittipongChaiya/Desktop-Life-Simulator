/**
 * @vitest-environment jsdom
 *
 * The factory panel. Phase-25 — ADR-035, ADR-010 §6.
 *
 * The behaviour worth pinning is not the layout — it is that a stalled factory
 * SAYS why. ADR-035 Rule B makes a blocked factory ordinary and silent in the
 * simulation, which is correct there and illegible on its own; this panel is
 * the only place a player learns that a chain stopped because an output filled.
 *
 * Mounted against a REAL world rather than a stubbed slice, so the projection
 * under test is the one the game publishes.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ok } from '../../../shared/result';
import { placeBuilding } from '../../../sim/commands/building-commands';
import { setFactoryRecipe } from '../../../sim/commands/factory-commands';
import { CommandSource, type Command } from '../../../sim/commands/types';
import { CORE_MILL } from '../../../sim/content/buildings';
import { CORE_FLOUR, CORE_WHEAT, DEFAULT_STACK_SIZE } from '../../../sim/content/items';
import { CORE_GRIND_FLOUR } from '../../../sim/content/recipes';
import { stepSimulation } from '../../../sim/tick';
import { addItems } from '../../../sim/world/container';
import { createWorld, type World } from '../../../sim/world/world';
import { createSnapshotStore } from '../../bootstrap/snapshot-store';
import { createActionFeedback } from '../action-feedback';
import { createPlacementController } from '../placement';
import { createSeedSelection } from '../seed-selection';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';

import { FactoryPanel } from './FactoryPanel';

/** A world with a mill, its recipe set, and `wheat` delivered. */
function millWorld(wheat: number, outputFlour = 0): World {
  const world = createWorld(17);
  world.wallet.coins = 100_000;
  if (!placeBuilding(world, 32 * 80 + 32, CORE_MILL).ok) throw new Error('mill must place');
  const id = [...world.buildings.keys()].at(-1)!;
  if (!setFactoryRecipe(world, id, CORE_GRIND_FLOUR).ok) throw new Error('recipe must set');

  const factory = world.factories.get(id)!;
  addItems(factory.input, CORE_WHEAT, wheat, DEFAULT_STACK_SIZE);
  if (outputFlour > 0) addItems(factory.output, CORE_FLOUR, outputFlour, DEFAULT_STACK_SIZE);
  return world;
}

function mount(world: World): Command[] {
  stepSimulation(world);
  const store = createSnapshotStore(world.snapshots);
  const submitted: Command[] = [];

  render(
    <StrictMode>
      <AppProviders
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={store}
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
          submit: (command: Command) => {
            submitted.push(command);
            return ok({ id: 1, source: CommandSource.Player, dispatchedTick: 0 });
          },
        }}
        selection={undefined as never}
        placement={createPlacementController()}
        seeds={createSeedSelection()}
      >
        <FactoryPanel />
      </AppProviders>
    </StrictMode>,
  );

  return submitted;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FactoryPanel', () => {
  it('shows nothing at all before a factory is built', () => {
    // A player who has not met the system is not shown a panel for it.
    mount(createWorld(17));
    expect(screen.queryByRole('button', { name: /Factories/ })).toBeNull();
  });

  it('counts how many are running', () => {
    mount(millWorld(10));
    expect(screen.getByRole('button', { name: /Factories · 1\/1/ })).toBeTruthy();
  });

  it('says WHY a factory is idle rather than leaving it blank', () => {
    // THE reason this panel exists: Rule B makes this silent in the sim, so a
    // player watching a stopped chain would otherwise have nothing to go on.
    mount(millWorld(0));
    fireEvent.click(screen.getByRole('button', { name: /Factories/ }));

    expect(screen.getByText('Waiting for materials')).toBeTruthy();
  });

  it('distinguishes a full output from missing materials', () => {
    mount(millWorld(10, DEFAULT_STACK_SIZE * 4));
    fireEvent.click(screen.getByRole('button', { name: /Factories/ }));

    expect(screen.getByText('Output full')).toBeTruthy();
  });

  it('asks an unset factory to be given something to make', () => {
    const world = millWorld(10);
    const id = [...world.buildings.keys()].at(-1)!;
    setFactoryRecipe(world, id, null);

    mount(world);
    fireEvent.click(screen.getByRole('button', { name: /Factories/ }));

    expect(screen.getByText('Choose what to make')).toBeTruthy();
  });

  it('reports progress on an accessible progressbar', () => {
    mount(millWorld(10));
    fireEvent.click(screen.getByRole('button', { name: /Factories/ }));

    const bar = screen.getByRole('progressbar');
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThan(100);
  });

  it('shows what the factory is holding', () => {
    mount(millWorld(6));
    fireEvent.click(screen.getByRole('button', { name: /Factories/ }));

    // Two consumed by the craft that started on the first tick.
    expect(screen.getByText(/Wheat ×4/)).toBeTruthy();
  });

  it('stops a factory through an ordinary command', () => {
    // No privileged write path (ADR-010 §6) — the panel submits exactly what
    // the worker AI would submit through the same dispatcher.
    //
    // The id is READ from the world rather than written as 1: the town is
    // founded before any player building, so the mill's id depends on how many
    // buildings `foundTown` placed (ADR-030 §3).
    const world = millWorld(10);
    const mill = [...world.buildings.keys()].at(-1)!;
    const submitted = mount(world);
    fireEvent.click(screen.getByRole('button', { name: /Factories/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(submitted).toEqual([{ type: 'setFactoryRecipe', building: mill, recipeId: null }]);
  });
});
