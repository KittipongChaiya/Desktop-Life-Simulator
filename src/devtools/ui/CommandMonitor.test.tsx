/**
 * @vitest-environment jsdom
 *
 * The command monitor panel. Phase-07.8f.
 *
 * Subscribes to the ring rather than polling it, for the reason the event
 * monitor does. It deliberately does NOT show a live queue depth: that would
 * need a timer, and the depth is already on the F3 overlay. Each row carries
 * the depth at the moment of its own dispatch instead, which is the more
 * diagnostic number and costs nothing to keep.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CommandOutcome, createCommandRing, type CommandRing } from '../commands/ring';

import { CommandMonitor } from './CommandMonitor';

afterEach(cleanup);

function record(ring: CommandRing, type: string, outcome: CommandOutcome, detail = ''): void {
  ring.record({
    type,
    source: 'player',
    outcome,
    detail,
    tick: 12,
    dispatchMs: 0.5,
    queueDepth: 2,
  });
}

function ringWith(...outcomes: readonly CommandOutcome[]): CommandRing {
  const ring = createCommandRing(50);
  outcomes.forEach((outcome, index) => {
    record(ring, `command${String(index)}`, outcome);
  });
  return ring;
}

describe('CommandMonitor', () => {
  it('renders nothing while hidden', () => {
    render(<CommandMonitor visible={false} ring={ringWith(CommandOutcome.Accepted)} />);

    expect(screen.queryByTestId('command-monitor')).toBeNull();
  });

  it('lists what it observed, newest first', () => {
    const ring = createCommandRing(10);
    record(ring, 'tillTile', CommandOutcome.Accepted);
    record(ring, 'plantCrop', CommandOutcome.Rejected, 'missing_item');

    render(<CommandMonitor visible ring={ring} />);

    const rows = screen.getAllByTestId('command-row');
    expect(rows[0]?.textContent).toContain('plantCrop');
    expect(rows[1]?.textContent).toContain('tillTile');
  });

  it('reports the tally, not merely what it still holds', () => {
    const ring = createCommandRing(1);
    record(ring, 'a', CommandOutcome.Accepted);
    record(ring, 'b', CommandOutcome.Rejected);
    record(ring, 'c', CommandOutcome.Failed);

    render(<CommandMonitor visible ring={ring} />);
    const heading = screen.getByTestId('command-monitor-heading').textContent ?? '';

    expect(heading).toContain('3');
    expect(heading).toMatch(/1.*accepted/);
    expect(heading).toMatch(/1.*rejected/);
    expect(heading).toMatch(/1.*failed/);
  });

  it('shows why a command was refused, which is the whole point of the row', () => {
    const ring = createCommandRing(10);
    record(ring, 'plantCrop', CommandOutcome.Rejected, 'tile_not_owned');

    render(<CommandMonitor visible ring={ring} />);

    expect(screen.getByTestId('command-row').textContent).toContain('tile_not_owned');
  });

  it('filters by outcome, and back', () => {
    render(
      <CommandMonitor visible ring={ringWith(CommandOutcome.Accepted, CommandOutcome.Rejected)} />,
    );
    expect(screen.getAllByTestId('command-row')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /accepted/ }));
    expect(screen.getAllByTestId('command-row')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /accepted/ }));
    expect(screen.getAllByTestId('command-row')).toHaveLength(2);
  });

  it('updates when a command is observed while it is open', () => {
    const ring = ringWith(CommandOutcome.Accepted);
    render(<CommandMonitor visible ring={ring} />);

    act(() => {
      record(ring, 'sellItems', CommandOutcome.Failed);
    });

    expect(screen.getAllByTestId('command-row')).toHaveLength(2);
  });

  it('marks itself interactive, so clicking a filter is not a click on the farm', () => {
    // The defect 07.8e found the hard way. Every interactive devtools panel
    // carries this or its clicks become tile actions.
    render(<CommandMonitor visible ring={ringWith(CommandOutcome.Accepted)} />);

    expect(screen.getByTestId('command-monitor').hasAttribute('data-interactive')).toBe(true);
  });

  it('says plainly when it has seen nothing', () => {
    render(<CommandMonitor visible ring={createCommandRing(10)} />);

    expect(screen.getByTestId('command-monitor').textContent).toContain('No commands observed');
  });

  it('clears on request', () => {
    const ring = ringWith(CommandOutcome.Accepted, CommandOutcome.Failed);
    render(<CommandMonitor visible ring={ring} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryAllByTestId('command-row')).toHaveLength(0);
    expect(ring.tally()).toEqual({ accepted: 0, rejected: 0, failed: 0 });
  });
});
