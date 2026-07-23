/**
 * @vitest-environment jsdom
 *
 * The economy UI: shop, sell rows, worker panel, coin counter. Phase-06e.
 *
 * The UI never invents rules — buttons reflect slice data and submit ordinary
 * commands (ADR-010 §6). So these tests assert exactly that: prices come from
 * the slices, affordability disables what validation would reject, and every
 * click becomes the right command.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ok } from '../../../shared/result';
import { CommandSource, type Command } from '../../../sim/commands/types';
import { CORE_WHEAT, DEFAULT_STACK_SIZE } from '../../../sim/content/items';
import { stepSimulation } from '../../../sim/tick';
import { addItems } from '../../../sim/world/container';
import { addCoins } from '../../../sim/world/wallet';
import { createWorld, type World } from '../../../sim/world/world';
import { createSnapshotStore } from '../../bootstrap/snapshot-store';
import { createPlacementController } from '../placement';
import { createSeedSelection, type SeedSelection } from '../seed-selection';
import { AppProviders } from '../store-context';

import { InventoryPanel } from './InventoryPanel';
import { ShopPanel } from './ShopPanel';
import { WorkerPanel } from './WorkerPanel';

interface Harness {
  readonly submitted: Command[];
  readonly seeds: SeedSelection;
}

/** Mounts a panel against a settled world with a captured command stream. */
function mount(world: World, element: React.ReactNode): Harness {
  stepSimulation(world); // settle the first-tick slice corrections
  const store = createSnapshotStore(world.snapshots);
  const submitted: Command[] = [];
  const seeds = createSeedSelection();

  render(
    <StrictMode>
      <AppProviders
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
        seeds={seeds}
      >
        {element}
      </AppProviders>
    </StrictMode>,
  );

  return { submitted, seeds };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ShopPanel', () => {
  it('lists seeds at the fixed §3.1 prices from the slice', () => {
    const world = createWorld(1);
    mount(world, <ShopPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Shop' }));

    // 5/12/25/60 — the §3.1 seed-cost column, via the seed items' base price.
    expect(screen.getByText('5g')).toBeDefined();
    expect(screen.getByText('12g')).toBeDefined();
    expect(screen.getByText('25g')).toBeDefined();
    expect(screen.getByText('60g')).toBeDefined();
  });

  it('disables what the wallet cannot cover, exactly', () => {
    const world = createWorld(1); // 100 coins
    mount(world, <ShopPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Shop' }));

    const buttons = screen.getAllByRole('button', { name: '+10' });
    // Turnip ×10 = 50 (affordable); pumpkin ×10 = 600 (not). Rows render in
    // §3.1 order, so the first +10 is turnip and the last is pumpkin.
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[3] as HTMLButtonElement).disabled).toBe(true);
  });

  it('a buy click submits the ordinary buySeeds command', () => {
    const world = createWorld(1);
    const { submitted } = mount(world, <ShopPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Shop' }));

    fireEvent.click(screen.getAllByRole('button', { name: '+10' })[0] as HTMLElement);
    expect(submitted).toEqual([{ type: 'buySeeds', cropId: 'core:turnip', quantity: 10 }]);
  });

  it('the seed icon selects the crop the seed tool plants', () => {
    const world = createWorld(1);
    const { seeds } = mount(world, <ShopPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Shop' }));

    expect(seeds.selected()).toBe('core:turnip'); // the default
    fireEvent.click(screen.getByTitle('Plant wheat with the seed tool'));
    expect(seeds.selected()).toBe('core:wheat');
  });

  it('a building Build button arms placement, keeping its accessible name stable', () => {
    const world = createWorld(1);
    addCoins(world.wallet, 200);
    mount(world, <ShopPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Shop' }));

    const build = screen.getByRole('button', { name: 'Build Storage Shed' });
    fireEvent.click(build);
    expect(build.getAttribute('aria-pressed')).toBe('true');
    expect(build.textContent).toBe('Placing…');
    // The name survives arming — mid-flow the button stays findable.
    expect(screen.getByRole('button', { name: 'Build Storage Shed' })).toBe(build);
  });

  it('shows the next land expansion at its §6.3 cost and submits expandLand', () => {
    const world = createWorld(1);
    const { submitted } = mount(world, <ShopPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Shop' }));

    expect(screen.getByText('100g')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(submitted).toEqual([{ type: 'expandLand' }]);
  });
});

describe('WorkerPanel', () => {
  it('disables hiring a fresh farm cannot afford — the stage-2 gate, visible', () => {
    const world = createWorld(1); // 100 < hireCost(0) = 150
    mount(world, <WorkerPanel />);

    const hire = screen.getByRole('button', { name: /^Hire/ });
    expect((hire as HTMLButtonElement).disabled).toBe(true);
    expect(hire.textContent).toContain('150');
  });

  it('enables and submits once the wallet covers the cost', () => {
    const world = createWorld(1);
    addCoins(world.wallet, 100); // 200 total
    const { submitted } = mount(world, <WorkerPanel />);

    const hire = screen.getByRole('button', { name: /^Hire/ });
    expect((hire as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(hire);
    expect(submitted).toEqual([{ type: 'hireWorker' }]);
  });
});

describe('InventoryPanel sell rows', () => {
  it('shows the live price and submits sellItems for one and for all', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT, 7, DEFAULT_STACK_SIZE);
    const { submitted } = mount(world, <InventoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Inventory/ }));

    expect(screen.getByText('34g')).toBeDefined(); // wheat at multiplier 1.0
    fireEvent.click(screen.getByRole('button', { name: 'Sell 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(submitted).toEqual([
      { type: 'sellItems', itemId: 'core:wheat', quantity: 1 },
      { type: 'sellItems', itemId: 'core:wheat', quantity: 7 },
    ]);
  });

  it('marks a depressed price with the quiet amber down-arrow, never red', () => {
    const world = createWorld(1);
    addItems(world.inventory, CORE_WHEAT, 200, DEFAULT_STACK_SIZE);
    // Depress wheat before mounting: sell 100 through the real command path.
    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 100 },
      { source: CommandSource.Player },
    );
    mount(world, <InventoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Inventory/ }));

    // floor(34 × 0.8) = 27, marked as recovering.
    expect(screen.getByText('27g ↓')).toBeDefined();
    expect(screen.getByTitle('Price recovering — normally 34g')).toBeDefined();
  });
});
