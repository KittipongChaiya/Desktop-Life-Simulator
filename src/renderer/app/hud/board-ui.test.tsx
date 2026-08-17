/**
 * @vitest-environment jsdom
 *
 * The notice board panel. Phase-20 — ADR-032, ADR-010 §6.
 *
 * The panel invents no rules: offers and progress come from the `contracts`
 * slice, buttons disable exactly where the validator would reject, and every
 * click becomes the right command with the right offer id.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { asContentId } from '../../../shared/ids';
import { ok } from '../../../shared/result';
import { acceptContract } from '../../../sim/commands/contract-commands';
import { CommandSource, type Command } from '../../../sim/commands/types';
import { stepSimulation } from '../../../sim/tick';
import { offersForDay } from '../../../sim/town/offers';
import { addItems } from '../../../sim/world/container';
import { createWorld, type World } from '../../../sim/world/world';
import { createSnapshotStore } from '../../bootstrap/snapshot-store';
import { createActionFeedback } from '../action-feedback';
import { createPlacementController } from '../placement';
import { createSeedSelection } from '../seed-selection';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';

import { BoardPanel } from './BoardPanel';

/** Mounts the panel against a settled world with a captured command stream. */
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
        <BoardPanel />
      </AppProviders>
    </StrictMode>,
  );

  return submitted;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BoardPanel', () => {
  it('lists today’s requests from the slice, with the requester named', () => {
    const world = createWorld(41);
    mount(world);
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));

    for (const offer of offersForDay(world, 0)) {
      const label = screen.getByText(
        (text) => text.includes(`asks for ${String(offer.quantity)}`),
        { exact: false, selector: 'span' },
      );
      expect(label).toBeDefined();
    }
  });

  it('accepting submits the command with the offer’s id', () => {
    const world = createWorld(41);
    const submitted = mount(world);
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));

    const offer = offersForDay(world, 0)[0];
    if (offer === undefined) throw new Error('no offer');
    const accepts = screen.getAllByRole('button', { name: /^Accept/ });
    fireEvent.click(accepts[0]!);

    expect(submitted).toEqual([{ type: 'acceptContract', offerId: offer.offerId }]);
  });

  it('Deliver stays disabled until the goods are actually held', () => {
    const world = createWorld(41);
    const offer = offersForDay(world, 0)[0];
    if (offer === undefined) throw new Error('no offer');
    acceptContract(world, offer.offerId);

    const submitted = mount(world);
    fireEvent.click(screen.getByRole('button', { name: /^Board/ }));

    const deliver = screen.getByRole('button', { name: /^Deliver/ });
    expect(deliver.hasAttribute('disabled')).toBe(true);
    fireEvent.click(deliver);
    expect(submitted).toEqual([]);
  });

  it('delivering submits once the held count reaches the ask', () => {
    const world = createWorld(41);
    const offer = offersForDay(world, 0)[0];
    if (offer === undefined) throw new Error('no offer');
    acceptContract(world, offer.offerId);
    addItems(world.inventory, asContentId(offer.item), offer.quantity, 999);

    const submitted = mount(world);
    fireEvent.click(screen.getByRole('button', { name: /^Board/ }));

    const deliver = screen.getByRole('button', { name: /^Deliver/ });
    expect(deliver.hasAttribute('disabled')).toBe(false);
    fireEvent.click(deliver);
    expect(submitted).toEqual([{ type: 'deliverContract', offerId: offer.offerId }]);
  });

  it('the toggle badges the docket count', () => {
    const world = createWorld(41);
    const offer = offersForDay(world, 0)[0];
    if (offer === undefined) throw new Error('no offer');
    acceptContract(world, offer.offerId);

    mount(world);
    expect(screen.getByRole('button', { name: 'Board · 1' })).toBeDefined();
  });
});
