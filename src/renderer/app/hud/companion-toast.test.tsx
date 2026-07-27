/**
 * @vitest-environment jsdom
 *
 * Companion toasts. Phase-01.8b (ADR-014; fix/0.1/1.8.md §Notifications).
 *
 * Toasts confirm mode toggles and quick-hide restores, in-overlay, and
 * dismiss themselves. One slot, never a queue; hiding itself never toasts
 * (the window is invisible — there is nobody to tell).
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BINDINGS, ShortcutAction } from '../../../shared/shortcuts';
import { createCompanionController, type CompanionBridge } from '../companion-controller';
import { AppProviders } from '../store-context';

import { CompanionToast } from './CompanionToast';

interface BridgeState {
  readonly opacityPercent: number;
  readonly workMode: boolean;
  readonly clickThrough: boolean;
  readonly hidden: boolean;
}

const state = (overrides: Partial<BridgeState> = {}): BridgeState => ({
  opacityPercent: 100,
  workMode: false,
  clickThrough: false,
  hidden: false,
  volumePercent: 60,
  muted: true,
  ...overrides,
});

function mount(): { emit(next: BridgeState): void } {
  let listener: ((next: BridgeState) => void) | null = null;
  const bridge: CompanionBridge = {
    setOpacity: (percent) => Promise.resolve(state({ opacityPercent: percent })),
    getState: () => Promise.resolve(state()),
    onStateChanged(next) {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };

  render(
    <StrictMode>
      <AppProviders
        store={undefined as never}
        overlay={undefined as never}
        player={undefined as never}
        selection={undefined as never}
        placement={undefined as never}
        seeds={undefined as never}
        companion={createCompanionController(bridge)}
        save={undefined as never}
        returnSummary={undefined as never}
      >
        <CompanionToast />
      </AppProviders>
    </StrictMode>,
  );

  return {
    emit(next) {
      act(() => {
        listener?.(next);
      });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CompanionToast', () => {
  it('renders nothing until a companion transition happens', () => {
    mount();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces click-through mode with the way back out', () => {
    const harness = mount();
    harness.emit(state({ clickThrough: true }));

    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Click-through on');
    // The escape route comes from the one bindings table — never hardcoded.
    expect(toast.textContent).toContain(DEFAULT_BINDINGS[ShortcutAction.ClickThrough]);

    harness.emit(state({ clickThrough: false }));
    expect(screen.getByRole('status').textContent).toContain('Click-through off');
  });

  it('announces work mode with the way back out (01.8c)', () => {
    const harness = mount();
    harness.emit(state({ workMode: true }));

    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Work mode on');
    expect(toast.textContent).toContain(DEFAULT_BINDINGS[ShortcutAction.WorkMode]);

    harness.emit(state({ workMode: false }));
    expect(screen.getByRole('status').textContent).toContain('Work mode off');
  });

  it('announces a quick-hide restore, but never the hide itself', () => {
    const harness = mount();

    harness.emit(state({ hidden: true }));
    expect(screen.queryByRole('status')).toBeNull(); // invisible window — nobody to tell

    harness.emit(state({ hidden: false }));
    expect(screen.getByRole('status').textContent).toContain('Overlay restored');
  });

  it('dismisses itself', () => {
    const harness = mount();
    harness.emit(state({ clickThrough: true }));
    expect(screen.getByRole('status')).toBeDefined();

    act(() => {
      // Comfortably past TOAST_DURATION_MS (2400) — a literal because the
      // lint type service cannot follow imports from css-importing modules.
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a new toast replaces the current one — one slot, never a queue', () => {
    const harness = mount();
    harness.emit(state({ clickThrough: true }));
    harness.emit(state({ clickThrough: true, hidden: true }));
    harness.emit(state({ clickThrough: true, hidden: false }));

    const toasts = screen.getAllByRole('status');
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.textContent).toContain('Overlay restored');
  });

  it('an opacity change alone never toasts', () => {
    const harness = mount();
    harness.emit(state({ opacityPercent: 55 }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
