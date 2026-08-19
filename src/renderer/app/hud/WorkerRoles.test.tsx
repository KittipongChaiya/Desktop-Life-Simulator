/**
 * @vitest-environment jsdom
 *
 * Phase-14d — the role control.
 *
 * What matters here is that it DISPATCHES rather than writes. A schedule is
 * simulation state (ADR-024 §4), so this control must have no write path of
 * its own — the same validator that would reject a replayed command rejects
 * this one, and the test asserts the command rather than the effect.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Command } from '../../../sim/commands/types';
import type { WorkerView } from '../../../sim/snapshot/workers-slice';
import { createActionFeedback } from '../action-feedback';
import type { OverlayController } from '../overlay-controller';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';
import { createZonePaintingController } from '../zone-painting';

import { WorkerRoles } from './WorkerRoles';

const worker = (over: Partial<WorkerView> = {}): WorkerView => ({
  id: 1,
  tile: 100,
  toTile: 100,
  moveFraction: 0,
  facing: 'south',
  state: 'idle',
  task: null,
  energy: 100,
  role: 'core:farmhand',
  ...over,
});

function mount(workers: readonly WorkerView[], submit: (command: Command) => void): void {
  const store = {
    subscribe: () => () => undefined,
    get: (name: string) => (name === 'workers' ? workers : undefined),
    pump: () => undefined,
  };

  render(
    <StrictMode>
      <AppProviders
        zonePainting={createZonePaintingController()}
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={store as never}
        overlay={
          {
            isCollapsed: () => false,
            setCollapsed: vi.fn(),
            toggle: vi.fn(),
            subscribe: () => () => undefined,
            setPointerOverUi: vi.fn(),
            quit: vi.fn(),
          } as OverlayController
        }
        player={{ submit } as never}
      >
        <WorkerRoles />
      </AppProviders>
    </StrictMode>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the role control', () => {
  it('renders nothing when there are no workers', () => {
    mount([], vi.fn());
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows the role each worker is on', () => {
    mount([worker({ role: 'core:harvester' })], vi.fn());
    expect(screen.getByRole('combobox').value).toBe('core:harvester');
  });

  it('offers a Custom entry only for a schedule no role matches', () => {
    // Shown rather than snapping the dropdown to something the player never
    // chose — a worker who edited a schedule directly is not on a role.
    mount([worker({ role: null })], vi.fn());
    expect(screen.getByRole('option', { name: 'Custom' })).toBeDefined();

    cleanup();
    mount([worker({ role: 'core:farmhand' })], vi.fn());
    expect(screen.queryByRole('option', { name: 'Custom' })).toBeNull();
  });

  it('DISPATCHES a command rather than writing anything', () => {
    const submit = vi.fn();
    mount([worker()], submit);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'core:harvester' } });

    expect(submit).toHaveBeenCalledWith({
      type: 'assignRole',
      worker: 1,
      role: 'core:harvester',
    });
  });

  it('submits nothing when Custom is re-selected', () => {
    // "Custom" describes a state; it is not a role anyone can be assigned.
    const submit = vi.fn();
    mount([worker({ role: null })], submit);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } });

    expect(submit).not.toHaveBeenCalled();
  });

  it('gives every worker its own control', () => {
    mount([worker({ id: 1 }), worker({ id: 2 })], vi.fn());
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });
});
