/**
 * @vitest-environment jsdom
 *
 * Companion toasts. Phase-01.8b (ADR-014; fix/0.1/1.8.md §Notifications).
 *
 * Toasts confirm mode toggles and quick-hide restores, in-overlay, and
 * dismiss themselves. One slot, never a queue; hiding itself never toasts
 * (the window is invisible — there is nobody to tell).
 *
 * Phase-15 gives the slot a SECOND occupant with a different lifetime: an
 * update announcement, which is a prompt rather than a receipt and therefore
 * waits to be dismissed (ADR-025 §5).
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateAnnouncement } from '../../../shared/ipc/contract';
import { DEFAULT_BINDINGS, ShortcutAction } from '../../../shared/shortcuts';
import { createActionFeedback } from '../action-feedback';
import { createCompanionController, type CompanionBridge } from '../companion-controller';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';
import { createUpdateController, type UpdateBridge } from '../update-controller';

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

interface Harness {
  emit(next: BridgeState): void;
  announce(announcement: UpdateAnnouncement): void;
}

function mount(): Harness {
  let listener: ((next: BridgeState) => void) | null = null;
  let announced: ((announcement: UpdateAnnouncement) => void) | null = null;

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

  const updateBridge: UpdateBridge = {
    getState: () => Promise.resolve({ currentVersion: '0.2.0', pinnedVersion: null }),
    setPinnedVersion: (version) =>
      Promise.resolve({ currentVersion: '0.2.0', pinnedVersion: version }),
    apply: () => Promise.resolve('started'),
    onAnnouncement(next) {
      announced = next;
      return () => {
        announced = null;
      };
    },
  };

  render(
    <StrictMode>
      <AppProviders
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={undefined as never}
        overlay={undefined as never}
        player={undefined as never}
        selection={undefined as never}
        placement={undefined as never}
        seeds={undefined as never}
        companion={createCompanionController(bridge)}
        update={createUpdateController(updateBridge)}
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
    announce(announcement) {
      act(() => {
        announced?.(announcement);
      });
    },
  };
}

/** Comfortably past the confirmation's 2,400 ms — a prompt must outlive it. */
const LONG_ENOUGH_TO_HAVE_EXPIRED_MS = 30_000;

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

describe('the update prompt (phase-15, ADR-025 §5)', () => {
  const OFFER: UpdateAnnouncement = { kind: 'offer', version: '0.2.1' };

  it('shows nothing until main announces something', () => {
    mount();
    expect(screen.queryByTestId('update-notice')).toBeNull();
  });

  it('names the version on offer', () => {
    const harness = mount();
    harness.announce(OFFER);

    expect(screen.getByTestId('update-notice').textContent).toContain('0.2.1');
  });

  it('shows a refusal in the words main sent', () => {
    // The wording belongs with the rule that produced it (`explainRefusal`);
    // this surface shows the message, it does not phrase one.
    const harness = mount();
    harness.announce({ kind: 'refusal', message: 'This version cannot open your farm.' });

    expect(screen.getByTestId('update-notice').textContent).toContain(
      'This version cannot open your farm.',
    );
  });

  it('does not expire — a prompt is not a receipt', () => {
    const harness = mount();
    harness.announce(OFFER);

    act(() => {
      vi.advanceTimersByTime(LONG_ENOUGH_TO_HAVE_EXPIRED_MS);
    });

    expect(screen.getByTestId('update-notice')).toBeDefined();
  });

  it('goes when dismissed, which is the only thing that clears it', () => {
    const harness = mount();
    harness.announce(OFFER);

    act(() => {
      screen.getByRole('button', { name: /dismiss/iu }).click();
    });

    expect(screen.queryByTestId('update-notice')).toBeNull();
  });

  it('takes the mouse, unlike a confirmation', () => {
    // A confirmation is pointer-transparent by construction; a prompt has to
    // receive the click that dismisses it, so it opts in to hit-testing.
    const harness = mount();
    harness.announce(OFFER);
    expect(screen.getByTestId('update-notice').hasAttribute('data-interactive')).toBe(true);

    harness.emit(state({ clickThrough: true }));
    expect(screen.getByTestId('companion-toast').hasAttribute('data-interactive')).toBe(false);
  });

  it('yields the slot to a confirmation, and takes it back when that expires', () => {
    // One slot, two lifetimes. The receipt answers something the player just
    // did and is gone in 2,400 ms; the prompt was never dismissed, so it
    // returns rather than being lost behind a hotkey press.
    const harness = mount();
    harness.announce(OFFER);

    harness.emit(state({ clickThrough: true }));
    expect(screen.getByTestId('companion-toast').textContent).toContain('Click-through on');
    expect(screen.queryByTestId('update-notice')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByTestId('update-notice')).toBeDefined();
  });

  it('is withheld in work mode, and returns when work mode ends', () => {
    // ADR-025 §5 forbids announcing in work mode, and main's announcer holds
    // an offer until the player is available. An offer already on screen when
    // work mode starts is the same rule arriving from the other direction:
    // it defers, it does not vanish (the ADR-014 return-summary precedent).
    const harness = mount();
    harness.announce(OFFER);

    harness.emit(state({ workMode: true }));
    expect(screen.queryByTestId('update-notice')).toBeNull();

    harness.emit(state({ workMode: false }));
    act(() => {
      vi.advanceTimersByTime(3_000); // past the "Work mode off" confirmation
    });
    expect(screen.getByTestId('update-notice')).toBeDefined();
  });
});

describe('the prompt can be acted on (phase-15, ADR-025 §5)', () => {
  const OFFER: UpdateAnnouncement = { kind: 'offer', version: '0.2.1' };

  it('offers to update and restart', () => {
    const harness = mount();
    harness.announce(OFFER);

    expect(screen.getByRole('button', { name: /update and restart/iu })).toBeDefined();
  });

  it('says the restart out loud, because that is the part that costs something', () => {
    // ADR-025 §5 is "never restart unasked". A button labelled only "Update"
    // would be asking for one thing and doing two.
    const harness = mount();
    harness.announce(OFFER);

    expect(screen.getByTestId('update-notice').textContent).toContain('restart');
  });

  it('reports that it is working once pressed', () => {
    const harness = mount();
    harness.announce(OFFER);

    act(() => {
      screen.getByRole('button', { name: /update and restart/iu }).click();
    });

    expect(screen.getByTestId('update-notice').textContent).toContain('Updating');
  });

  it('offers nothing to press on a refusal — there is nothing to install', () => {
    const harness = mount();
    harness.announce({ kind: 'refusal', message: 'This version cannot open your farm.' });

    expect(screen.queryByRole('button', { name: /update and restart/iu })).toBeNull();
    expect(screen.getByRole('button', { name: /dismiss/iu })).toBeDefined();
  });
});
