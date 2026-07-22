/**
 * Worker selection store. Phase-04c.
 */

import { describe, expect, it, vi } from 'vitest';

import { createWorkerSelection } from './worker-selection';

describe('createWorkerSelection', () => {
  it('starts with nothing selected', () => {
    expect(createWorkerSelection().selected()).toBeNull();
  });

  it('selects and clears', () => {
    const selection = createWorkerSelection();
    selection.select(3);
    expect(selection.selected()).toBe(3);
    selection.select(null);
    expect(selection.selected()).toBeNull();
  });

  it('notifies subscribers on a real change only', () => {
    const selection = createWorkerSelection();
    const listener = vi.fn();
    selection.subscribe(listener);

    selection.select(1);
    selection.select(1); // unchanged — must not notify again
    selection.select(2);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const selection = createWorkerSelection();
    const listener = vi.fn();
    const off = selection.subscribe(listener);
    off();
    selection.select(9);
    expect(listener).not.toHaveBeenCalled();
  });
});
