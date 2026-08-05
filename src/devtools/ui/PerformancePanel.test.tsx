/**
 * @vitest-environment jsdom
 *
 * The performance panel. Phase-07.8h.
 *
 * ADR-018 §8 names this panel as the trap: "a 60-second history that repaints
 * at 60 Hz while nothing changes is a debug tool that makes the thing it
 * measures worse, and its own readings untrustworthy." So the assertions here
 * are mostly about COST — that it samples nothing while closed, samples slowly
 * while open, and goes completely still once its window is uniform.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SimulationControl } from '../../shared/simulation-control';
import { PERF_SAMPLE_MS, PERF_WINDOW_MS } from '../perf/series';

import { PerformancePanel } from './PerformancePanel';

interface FakeControl extends SimulationControl {
  fpsValue: number;
  frameValue: number;
}

function fakeSimulation(): FakeControl {
  const control: FakeControl = {
    fpsValue: 60,
    frameValue: 16,
    isPaused: () => false,
    pause: () => undefined,
    resume: () => undefined,
    step: () => undefined,
    tick: () => 0,
    ups: () => 20,
    fps: () => control.fpsValue,
    frameTimeMs: () => control.frameValue,
    setTimeScale: () => undefined,
    timeScale: () => 1,
  };
  return control;
}

function advance(ms: number): void {
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

describe('PerformancePanel', () => {
  it('samples nothing at all while closed', () => {
    const simulation = fakeSimulation();
    const spy = vi.spyOn(simulation, 'fps');
    render(<PerformancePanel visible={false} simulation={simulation} />);

    advance(PERF_WINDOW_MS);

    expect(screen.queryByTestId('performance-panel')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('stops sampling when it closes', () => {
    const simulation = fakeSimulation();
    const { rerender } = render(<PerformancePanel visible simulation={simulation} />);
    advance(PERF_SAMPLE_MS * 2);

    const spy = vi.spyOn(simulation, 'fps');
    rerender(<PerformancePanel visible={false} simulation={simulation} />);
    advance(PERF_WINDOW_MS);

    expect(spy).not.toHaveBeenCalled();
  });

  it('plots a graph per series', () => {
    render(<PerformancePanel visible simulation={fakeSimulation()} />);
    advance(PERF_SAMPLE_MS * 3);

    expect(screen.getByTestId('graph-fps')).toBeTruthy();
    expect(screen.getByTestId('graph-frame')).toBeTruthy();
  });

  it('grows the plot as samples arrive', () => {
    const simulation = fakeSimulation();
    render(<PerformancePanel visible simulation={simulation} />);

    advance(PERF_SAMPLE_MS);
    simulation.fpsValue = 30;
    advance(PERF_SAMPLE_MS);
    simulation.fpsValue = 45;
    advance(PERF_SAMPLE_MS);

    const points = screen.getByTestId('graph-fps').getAttribute('points') ?? '';
    expect(points.split(' ').length).toBeGreaterThanOrEqual(3);
  });

  it('holds a window of exactly sixty seconds', () => {
    const simulation = fakeSimulation();
    render(<PerformancePanel visible simulation={simulation} />);

    // Twice the window, with a changing value so nothing is skipped.
    for (let i = 0; i < (PERF_WINDOW_MS / PERF_SAMPLE_MS) * 2; i += 1) {
      simulation.fpsValue = i % 50;
      advance(PERF_SAMPLE_MS);
    }

    const points = (screen.getByTestId('graph-fps').getAttribute('points') ?? '').split(' ');
    expect(points).toHaveLength(PERF_WINDOW_MS / PERF_SAMPLE_MS);
  });

  it('goes completely still once the window is uniform (ADR-018 §8)', () => {
    // The idle case, and the one the ADR warns about: nothing is changing, so
    // every new sample produces the series that is already on screen and the
    // panel must stop committing entirely.
    const simulation = fakeSimulation();
    const { container } = render(<PerformancePanel visible simulation={simulation} />);

    // Fill the window with one constant value.
    advance(PERF_WINDOW_MS + PERF_SAMPLE_MS);
    const painted = container.innerHTML;

    advance(PERF_SAMPLE_MS * 20);

    expect(container.innerHTML).toBe(painted);
  });

  it('repaints again as soon as something moves', () => {
    const simulation = fakeSimulation();
    const { container } = render(<PerformancePanel visible simulation={simulation} />);
    advance(PERF_WINDOW_MS + PERF_SAMPLE_MS);
    const idle = container.innerHTML;

    simulation.fpsValue = 12;
    advance(PERF_SAMPLE_MS);

    expect(container.innerHTML).not.toBe(idle);
  });

  it('reports the current value beside each graph, so the shape has a scale', () => {
    const simulation = fakeSimulation();
    simulation.fpsValue = 42;
    render(<PerformancePanel visible simulation={simulation} />);
    advance(PERF_SAMPLE_MS);

    expect(screen.getByTestId('performance-panel').textContent).toContain('42');
  });

  it('is framed, which is what makes it interactive and movable', () => {
    render(<PerformancePanel visible simulation={fakeSimulation()} />);

    expect(screen.getByTestId('panel-perf').hasAttribute('data-interactive')).toBe(true);
  });
});
