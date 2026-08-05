/**
 * @vitest-environment jsdom
 *
 * Time controls. Phase-07.8g.
 *
 * Every control here already existed on the loop — pause, resume, step, and a
 * validated time scale. What did not exist was any way to reach the scale from
 * the tooling, because `SimulationControl` declared everything BUT it. So the
 * panel is thin by design, and these tests are about the two things a thin
 * panel can still get wrong: calling the wrong control, and lying about the
 * state of one that something else changed.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SimulationControl } from '../../shared/simulation-control';

import { TimeControls } from './TimeControls';

const TICK_MS = 250;

interface FakeControl extends SimulationControl {
  paused: boolean;
  scale: number;
  ticks: number;
  readonly stepped: number[];
}

function fakeSimulation(): FakeControl {
  const control: FakeControl = {
    paused: false,
    scale: 1,
    ticks: 100,
    stepped: [],
    isPaused: () => control.paused,
    pause: () => {
      control.paused = true;
    },
    resume: () => {
      control.paused = false;
    },
    step: (count: number) => {
      control.stepped.push(count);
      control.ticks += count;
    },
    tick: () => control.ticks,
    ups: () => 20,
    fps: () => 60,
    frameTimeMs: () => 16,
    setTimeScale: (scale: number) => {
      control.scale = scale;
    },
    timeScale: () => control.scale,
  };
  return control;
}

function advance(ms = TICK_MS): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TimeControls', () => {
  it('renders nothing while hidden, and samples nothing either', () => {
    const simulation = fakeSimulation();
    const spy = vi.spyOn(simulation, 'tick');
    render(<TimeControls visible={false} simulation={simulation} />);

    advance(TICK_MS * 8);

    expect(screen.queryByTestId('time-controls')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the running state, the scale, and the tick', () => {
    render(<TimeControls visible simulation={fakeSimulation()} />);

    const panel = screen.getByTestId('time-controls').textContent ?? '';
    expect(panel).toContain('running');
    expect(panel).toContain('100');
  });

  it('pauses and resumes through the loop', () => {
    const simulation = fakeSimulation();
    render(<TimeControls visible simulation={simulation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(simulation.paused).toBe(true);

    advance();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(simulation.paused).toBe(false);
  });

  it('steps by one and by ten, which is the only way to move a paused world', () => {
    const simulation = fakeSimulation();
    render(<TimeControls visible simulation={simulation} />);

    fireEvent.click(screen.getByRole('button', { name: '+1' }));
    fireEvent.click(screen.getByRole('button', { name: '+10' }));

    expect(simulation.stepped).toEqual([1, 10]);
  });

  it('sets each offered scale, and marks the one in force', () => {
    const simulation = fakeSimulation();
    render(<TimeControls visible simulation={simulation} />);

    fireEvent.click(screen.getByRole('button', { name: '4×' }));
    expect(simulation.scale).toBe(4);

    advance();
    expect(screen.getByRole('button', { name: '4×' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '1×' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('offers 1× through 16×, the range the brief names', () => {
    render(<TimeControls visible simulation={fakeSimulation()} />);

    for (const scale of ['1×', '2×', '4×', '8×', '16×']) {
      expect(screen.getByRole('button', { name: scale })).toBeTruthy();
    }
  });

  it('reflects a pause it did not perform', () => {
    // The console can pause too. A panel that showed "running" because it was
    // not the one that pressed the button would be worse than no panel.
    const simulation = fakeSimulation();
    render(<TimeControls visible simulation={simulation} />);

    act(() => {
      simulation.pause();
    });
    advance();

    expect(screen.getByTestId('time-controls').textContent).toContain('paused');
  });

  it('goes quiet when the world does (ADR-018 §8)', () => {
    // Paused, nothing changes, so nothing is committed and the DOM is still.
    const simulation = fakeSimulation();
    simulation.paused = true;
    const { container } = render(<TimeControls visible simulation={simulation} />);

    advance();
    const painted = container.innerHTML;
    advance(TICK_MS * 8);

    expect(container.innerHTML).toBe(painted);
  });

  it('is framed, which is what makes it interactive and movable', () => {
    render(<TimeControls visible simulation={fakeSimulation()} />);

    expect(screen.getByTestId('panel-time').hasAttribute('data-interactive')).toBe(true);
  });
});
