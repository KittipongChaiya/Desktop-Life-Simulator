/**
 * @vitest-environment jsdom
 *
 * The gain hook. Phase-07.5b.
 *
 * Shared by the coin popup and the inventory flash, so its edges are worth
 * pinning once: only increases speak, a run of gains reads as one continuous
 * acknowledgement, and it always falls silent again.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GAIN_VISIBLE_MS, useGain } from './use-gain';

function Probe({ value }: { readonly value: number }): React.ReactNode {
  return <span data-testid="gain">{useGain(value)}</span>;
}

const shown = (): string => screen.getByTestId('gain').textContent ?? '';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useGain', () => {
  it('says nothing on the first render — a starting balance is not a gain', () => {
    render(<Probe value={500} />);
    expect(shown()).toBe('0');
  });

  it('reports the size of an increase', () => {
    const view = render(<Probe value={100} />);
    act(() => view.rerender(<Probe value={112} />));

    expect(shown()).toBe('12');
  });

  it('falls silent on its own', () => {
    // The property that keeps a popup from becoming permanent furniture.
    const view = render(<Probe value={100} />);
    act(() => view.rerender(<Probe value={112} />));

    act(() => {
      vi.advanceTimersByTime(GAIN_VISIBLE_MS + 1);
    });

    expect(shown()).toBe('0');
  });

  it('stays silent on a DECREASE — spending was deliberate', () => {
    // Buying seeds and hiring workers are things the player chose. The
    // feedback here is for value arriving while they looked elsewhere.
    const view = render(<Probe value={100} />);
    act(() => view.rerender(<Probe value={40} />));

    expect(shown()).toBe('0');
  });

  it('a later gain replaces an earlier one, and restarts the clock', () => {
    // A run of sales must read as one acknowledgement, not a stutter.
    const view = render(<Probe value={100} />);
    act(() => view.rerender(<Probe value={110} />));

    act(() => {
      vi.advanceTimersByTime(GAIN_VISIBLE_MS - 100);
    });
    act(() => view.rerender(<Probe value={125} />));
    expect(shown()).toBe('15');

    // The original timer would have fired by now; the new one has not.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(shown()).toBe('15');
  });

  it('an unchanged value never speaks, however often it re-renders', () => {
    const view = render(<Probe value={100} />);
    act(() => view.rerender(<Probe value={100} />));
    act(() => view.rerender(<Probe value={100} />));

    expect(shown()).toBe('0');
  });
});
