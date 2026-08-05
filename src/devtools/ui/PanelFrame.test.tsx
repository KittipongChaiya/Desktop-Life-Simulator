/**
 * @vitest-environment jsdom
 *
 * Shared panel chrome. Phase-07.8n.
 *
 * Drag and resize are arithmetic on pointer deltas, which is easy to get subtly
 * wrong — an origin captured per move instead of per drag makes a panel
 * accelerate away under the pointer. Persistence is the other half: a layout
 * remembered wrongly is worse than one not remembered at all.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadLayout } from './panel-layout';
import { PanelFrame, type PanelFrameProps } from './PanelFrame';

const INITIAL = { x: 100, y: 60, width: 300, height: 200 };

beforeEach(() => {
  localStorage.clear();
  window.innerWidth = 1200;
  window.innerHeight = 500;
});

afterEach(cleanup);

function mount(props: Partial<PanelFrameProps> = {}): void {
  render(
    <PanelFrame id="test" title="Test Panel" visible initial={INITIAL} {...props}>
      <p>contents</p>
    </PanelFrame>,
  );
}

function frame(): HTMLElement {
  return screen.getByTestId('panel-test');
}

function drag(handle: HTMLElement, dx: number, dy: number): void {
  fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(window, { clientX: dx, clientY: dy });
  fireEvent.pointerUp(window);
}

describe('PanelFrame', () => {
  it('renders nothing while hidden', () => {
    mount({ visible: false });

    expect(screen.queryByTestId('panel-test')).toBeNull();
  });

  it('opens at its initial geometry', () => {
    mount();

    expect(frame().style.left).toBe('100px');
    expect(frame().style.width).toBe('300px');
  });

  it('shows its title, status and contents', () => {
    mount({ status: '12 rows' });

    expect(screen.getByText('Test Panel')).toBeTruthy();
    expect(screen.getByText('12 rows')).toBeTruthy();
    expect(screen.getByText('contents')).toBeTruthy();
  });

  it('marks itself interactive, for every panel that uses it', () => {
    mount();

    expect(frame().hasAttribute('data-interactive')).toBe(true);
  });
});

describe('dragging', () => {
  it('moves by the pointer delta', () => {
    mount();

    drag(screen.getByTestId('panel-test-bar'), 40, 25);

    expect(frame().style.left).toBe('140px');
    expect(frame().style.top).toBe('85px');
  });

  it('resizes by the pointer delta', () => {
    mount();

    drag(screen.getByTestId('panel-test-grip'), 50, 30);

    expect(frame().style.width).toBe('350px');
    expect(frame().style.height).toBe('230px');
  });

  it('measures from where the drag began, not from the last move', () => {
    // The acceleration bug: re-capturing the origin each move compounds the
    // delta, and the panel shoots off under the pointer.
    mount();

    fireEvent.pointerDown(screen.getByTestId('panel-test-bar'), { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 10, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 20, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 30, clientY: 0 });
    fireEvent.pointerUp(window);

    expect(frame().style.left).toBe('130px');
  });

  it('stops moving once the pointer is released', () => {
    mount();

    drag(screen.getByTestId('panel-test-bar'), 40, 0);
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400 });

    expect(frame().style.left).toBe('140px');
  });

  it('keeps the panel reachable when dragged off-screen', () => {
    mount();

    drag(screen.getByTestId('panel-test-bar'), 5_000, 5_000);

    expect(Number.parseInt(frame().style.left, 10)).toBeLessThanOrEqual(1200 - 32);
    expect(Number.parseInt(frame().style.top, 10)).toBeLessThanOrEqual(500 - 32);
  });
});

describe('remembering', () => {
  it('persists where it was dropped', () => {
    mount();

    drag(screen.getByTestId('panel-test-bar'), 40, 25);

    expect(loadLayout().panels['test']).toMatchObject({ x: 140, y: 85 });
  });

  it('does not write while the drag is still happening', () => {
    // A drag is a hundred moves and one decision; only the decision is saved.
    mount();
    const spy = vi.spyOn(Storage.prototype, 'setItem');

    fireEvent.pointerDown(screen.getByTestId('panel-test-bar'), { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 10, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 20, clientY: 0 });

    expect(spy).not.toHaveBeenCalled();

    fireEvent.pointerUp(window);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('reopens where it was left', () => {
    mount();
    drag(screen.getByTestId('panel-test-bar'), 40, 25);
    cleanup();

    mount();

    expect(frame().style.left).toBe('140px');
  });

  it('ignores a remembered position from a bigger screen', () => {
    localStorage.setItem(
      'devtools.layout.v1',
      JSON.stringify({
        panels: { test: { x: 9_000, y: 9_000, width: 300, height: 200 } },
        open: [],
      }),
    );

    mount();

    expect(Number.parseInt(frame().style.left, 10)).toBeLessThanOrEqual(1200 - 32);
  });
});

describe('search', () => {
  it('has no search box unless the panel wants one', () => {
    mount();

    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('reports what was typed', () => {
    const onSearch = vi.fn();
    mount({ onSearch });

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'till' } });

    expect(onSearch).toHaveBeenCalledWith('till');
  });
});

describe('closing', () => {
  it('closes without dragging the panel', () => {
    const onClose = vi.fn();
    mount({ onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Close Test Panel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(frame().style.left).toBe('100px');
  });
});
