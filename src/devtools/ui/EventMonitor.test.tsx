/**
 * @vitest-environment jsdom
 *
 * The event monitor panel. Phase-07.8e.
 *
 * It subscribes to the ring rather than polling it, so it re-renders exactly
 * when an event is observed and never otherwise (criterion 9) — the ring's
 * entries change identity only when its contents do, which is what makes
 * `useSyncExternalStore` correct here.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createEventRing, type EventRing } from '../events/ring';

import { EventMonitor } from './EventMonitor';

afterEach(cleanup);

function ringWith(...names: readonly string[]): EventRing {
  const ring = createEventRing(50);
  names.forEach((name, index) => {
    ring.record(name, index + 1, { tile: index });
  });
  return ring;
}

describe('EventMonitor', () => {
  it('renders nothing while hidden', () => {
    render(<EventMonitor visible={false} ring={ringWith('tileTilled')} />);

    expect(screen.queryByTestId('event-monitor')).toBeNull();
  });

  it('lists what was observed, newest first', () => {
    render(<EventMonitor visible ring={ringWith('tileTilled', 'cropPlanted', 'itemSold')} />);

    const rows = screen.getAllByTestId('event-row');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('itemSold'),
      expect.stringContaining('cropPlanted'),
      expect.stringContaining('tileTilled'),
    ]);
  });

  it('says how many it observed and how many it is showing', () => {
    const ring = createEventRing(2);
    for (let i = 0; i < 5; i += 1) ring.record('tileTilled', i, { tile: i });

    render(<EventMonitor visible ring={ring} />);

    // 5 seen, 2 retained. Reporting only the 2 would hide the eviction.
    expect(screen.getByTestId('event-monitor-heading').textContent).toContain('5');
    expect(screen.getByTestId('event-monitor-heading').textContent).toContain('2');
  });

  it('filters a type out, and back in', () => {
    render(<EventMonitor visible ring={ringWith('tileTilled', 'itemSold')} />);
    expect(screen.getAllByTestId('event-row')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /itemSold/ }));
    expect(screen.getAllByTestId('event-row')).toHaveLength(1);
    expect(screen.getByTestId('event-row').textContent).toContain('tileTilled');

    fireEvent.click(screen.getByRole('button', { name: /itemSold/ }));
    expect(screen.getAllByTestId('event-row')).toHaveLength(2);
  });

  it('updates when an event is observed while it is open', () => {
    const ring = ringWith('tileTilled');
    render(<EventMonitor visible ring={ring} />);
    expect(screen.getAllByTestId('event-row')).toHaveLength(1);

    act(() => {
      ring.record('cropHarvested', 9, { tile: 3 });
    });

    expect(screen.getAllByTestId('event-row')).toHaveLength(2);
  });

  it('marks itself interactive, so clicking a filter is not a click on the farm', () => {
    // Found by the E2E, not by reasoning: with a tool armed, clicking a chip
    // tilled the tile behind the panel. `pointer-actions` treats any press
    // that did not start over a `[data-interactive]` element as a tile action,
    // and `hit-test` passes the mouse to the desktop over anything else.
    render(<EventMonitor visible ring={ringWith('tileTilled')} />);

    expect(screen.getByTestId('event-monitor').hasAttribute('data-interactive')).toBe(true);
  });

  it('says plainly when it has seen nothing', () => {
    render(<EventMonitor visible ring={createEventRing(10)} />);

    expect(screen.getByTestId('event-monitor').textContent).toContain('No events observed');
  });

  it('clears on request', () => {
    const ring = ringWith('tileTilled', 'itemSold');
    render(<EventMonitor visible ring={ring} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryAllByTestId('event-row')).toHaveLength(0);
    expect(ring.observed()).toBe(0);
  });

  it('shows the tick and the payload, which is why the row exists', () => {
    const ring = createEventRing(10);
    ring.record('itemSold', 512, { item: 'core:wheat', quantity: 3 });

    render(<EventMonitor visible ring={ring} />);

    const row = screen.getByTestId('event-row').textContent ?? '';
    expect(row).toContain('512');
    expect(row).toContain('core:wheat');
  });
});
