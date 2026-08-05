/**
 * @vitest-environment jsdom
 *
 * The devtools root, and screenshot mode. Phase-07.8l.
 *
 * Screenshot mode's contract is one sentence — HIDE, DO NOT FORGET — and it is
 * the whole reason this file has a test. Hiding is easy to get right and easy
 * to get right in the wrong way: closing the panels would look identical in a
 * screenshot and be wrong the moment the developer wanted their layout back.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SimulationControl } from '../../shared/simulation-control';
import { createDevTools, type DevToolsHost } from '../host';

import { DevTools } from './DevTools';

afterEach(cleanup);

function fakeSimulation(): SimulationControl {
  return {
    isPaused: () => false,
    pause: () => undefined,
    resume: () => undefined,
    step: () => undefined,
    tick: () => 0,
    ups: () => 20,
    fps: () => 60,
    frameTimeMs: () => 16,
    setTimeScale: () => undefined,
    timeScale: () => 1,
  };
}

function mount(): DevToolsHost {
  const host = createDevTools({
    simulation: fakeSimulation(),
    appVersion: '0.0.0-test',
    reload: () => undefined,
  });
  render(<DevTools host={host} />);
  return host;
}

function press(key: string): void {
  act(() => {
    fireEvent.keyDown(window, { key });
  });
}

function pressScreenshot(): void {
  act(() => {
    fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });
  });
}

describe('DevTools keybinds', () => {
  it('opens and closes the overlay on F3', () => {
    mount();
    expect(screen.queryByTestId('debug-overlay')).toBeNull();

    press('F3');
    expect(screen.getByTestId('debug-overlay')).toBeTruthy();

    press('F3');
    expect(screen.queryByTestId('debug-overlay')).toBeNull();
  });

  it('opens each panel on its own key', () => {
    mount();

    press('F2');
    press('F5');
    press('F6');

    expect(screen.getByTestId('event-monitor')).toBeTruthy();
    expect(screen.getByTestId('command-monitor')).toBeTruthy();
    expect(screen.getByTestId('time-controls')).toBeTruthy();
  });
});

describe('screenshot mode', () => {
  it('hides every open panel at once', () => {
    mount();
    press('F3');
    press('F2');
    press('F6');

    pressScreenshot();

    expect(screen.queryByTestId('debug-overlay')).toBeNull();
    expect(screen.queryByTestId('event-monitor')).toBeNull();
    expect(screen.queryByTestId('time-controls')).toBeNull();
  });

  it('restores exactly the arrangement that was open', () => {
    // The property that makes it a screenshot mode rather than a close button:
    // F3 and F6 were open, F2 was not, and that is what comes back.
    mount();
    press('F3');
    press('F6');

    pressScreenshot();
    pressScreenshot();

    expect(screen.getByTestId('debug-overlay')).toBeTruthy();
    expect(screen.getByTestId('time-controls')).toBeTruthy();
    expect(screen.queryByTestId('event-monitor')).toBeNull();
  });

  it('suppresses the in-world overlays through the same switch', () => {
    const host = mount();
    press('F8');
    expect(host.renderDebug.chunks()).toBe(true);

    pressScreenshot();
    expect(host.renderDebug.chunks()).toBe(false);
    expect(host.renderDebug.screenshot()).toBe(true);

    pressScreenshot();
    expect(host.renderDebug.chunks()).toBe(true);
  });

  it('lets a panel opened during the mode appear on leaving it', () => {
    mount();
    pressScreenshot();

    press('F3');
    expect(screen.queryByTestId('debug-overlay')).toBeNull();

    pressScreenshot();
    expect(screen.getByTestId('debug-overlay')).toBeTruthy();
  });

  it('ignores the plain key, so typing "S" is not a mode change', () => {
    mount();
    press('F3');

    press('S');
    act(() => {
      fireEvent.keyDown(window, { key: 'S', shiftKey: true });
    });

    expect(screen.getByTestId('debug-overlay')).toBeTruthy();
  });
});
