/**
 * @vitest-environment jsdom
 *
 * The return summary and the save-failure notice. Phase-07e —
 * `GAME_DESIGN.md` §9.4 and `SAVE_FORMAT.md` §7.3 (criteria 20, 24).
 *
 * Both are the player-facing halves of the save system: one reports what
 * happened while the game was closed, the other reports that the game is not
 * being saved. Neither may ever steal focus (§10.1 rule 1).
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TICKS_PER_SECOND } from '../../../shared/constants';
import type { SaveWriteOutcome } from '../../../shared/ipc/contract';
import { createCompanionController, type CompanionBridge } from '../companion-controller';
import { createReturnSummary, type ReturnSummaryReport } from '../return-summary';
import { createSaveController, type SaveController } from '../save-controller';
import { AppProviders } from '../store-context';

import { ReturnSummary } from './ReturnSummary';
import { SaveNotice } from './SaveNotice';

interface BridgeState {
  readonly opacityPercent: number;
  readonly workMode: boolean;
  readonly clickThrough: boolean;
  readonly hidden: boolean;
}

const companionState = (workMode = false): BridgeState => ({
  opacityPercent: 100,
  workMode,
  clickThrough: false,
  hidden: false,
});

const report = (overrides: Partial<ReturnSummaryReport> = {}): ReturnSummaryReport => ({
  elapsedTicks: TICKS_PER_SECOND * 60 * 134,
  harvests: 42,
  coinsEarned: 812,
  blockedAfterTicks: null,
  ...overrides,
});

interface Harness {
  readonly save: SaveController;
  setWorkMode(active: boolean): void;
}

function mount(options: {
  report?: ReturnSummaryReport | null;
  write?: () => Promise<SaveWriteOutcome>;
}): Harness {
  let listener: ((next: BridgeState) => void) | null = null;
  const bridge: CompanionBridge = {
    setOpacity: () => Promise.resolve(companionState()),
    getState: () => Promise.resolve(companionState()),
    onStateChanged(next) {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };

  const save = createSaveController({
    write: options.write ?? (() => Promise.resolve({ ok: true })),
    defer: (run) => run(),
  });

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
        save={save}
        returnSummary={createReturnSummary(options.report ?? null)}
      >
        <ReturnSummary />
        <SaveNotice />
      </AppProviders>
    </StrictMode>,
  );

  return {
    save,
    setWorkMode(active) {
      act(() => {
        listener?.(companionState(active));
      });
    },
  };
}

afterEach(cleanup);

describe('the return summary (criterion 24)', () => {
  it('reports time away, harvests, and coins earned', () => {
    mount({ report: report() });

    const panel = screen.getByTestId('return-summary');
    expect(panel.textContent).toContain('Away for 2h 14m');
    expect(panel.textContent).toContain('42');
    expect(panel.textContent).toContain('812');
  });

  it('renders nothing when the gap did not earn a summary', () => {
    mount({ report: null });
    expect(screen.queryByTestId('return-summary')).toBeNull();
  });

  it('names what blocked progress, and when (§9.4)', () => {
    // The whole reason the blocker is reported: dead time becomes a legible
    // reason to build more storage.
    mount({
      report: report({
        elapsedTicks: TICKS_PER_SECOND * 60 * 60 * 8,
        blockedAfterTicks: TICKS_PER_SECOND * 60 * 134,
      }),
    });

    expect(screen.getByTestId('return-summary').textContent).toContain('Storage full after 2h 14m');
  });

  it('says nothing about blockers when nothing blocked', () => {
    mount({ report: report() });
    expect(screen.getByTestId('return-summary').textContent).not.toContain('Storage full');
  });

  it('is dismissible, and stays dismissed', () => {
    mount({ report: report() });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByTestId('return-summary')).toBeNull();
  });

  it('never steals focus (§10.1 rule 1)', () => {
    // A modal would have to take focus to be modal. Nothing here does — the
    // player can keep typing, clicking, and playing straight through it.
    mount({ report: report() });

    expect(screen.getByTestId('return-summary').getAttribute('role')).toBe('status');
    expect(document.activeElement).toBe(document.body);
  });
});

describe('work mode DEFERS the summary (ADR-014)', () => {
  it('hides it while work mode is on, then shows it again on the way out', () => {
    // "A summary suppressed by a hidden HUD must defer, not vanish."
    const harness = mount({ report: report() });
    expect(screen.getByTestId('return-summary')).toBeDefined();

    harness.setWorkMode(true);
    expect(screen.queryByTestId('return-summary')).toBeNull();

    harness.setWorkMode(false);
    expect(screen.getByTestId('return-summary')).toBeDefined();
  });

  it('a dismissal is permanent — work mode is not a way to un-read it', () => {
    const harness = mount({ report: report() });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    harness.setWorkMode(true);
    harness.setWorkMode(false);

    expect(screen.queryByTestId('return-summary')).toBeNull();
  });
});

describe('the save-failure notice (criterion 20)', () => {
  const failure: SaveWriteOutcome = {
    ok: false,
    error: 'EACCES: permission denied',
    path: 'C:\\Users\\p\\AppData\\Roaming\\dls\\saves\\slot-0.json',
  };

  const settle = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('stays silent while saves succeed', async () => {
    const harness = mount({ report: null });
    harness.save.requestSave();
    await settle();

    expect(screen.queryByTestId('save-notice')).toBeNull();
  });

  it('names the failure AND the path', async () => {
    const harness = mount({ report: null, write: () => Promise.resolve(failure) });
    harness.save.requestSave();
    await settle();

    const notice = screen.getByTestId('save-notice');
    expect(notice.textContent).toContain('EACCES: permission denied');
    expect(notice.textContent).toContain('slot-0.json');
    // It says the game is still running, because it is (§7.3).
    expect(notice.textContent).toContain('still running');
  });

  it('is announced as an alert — the one genuine error class', async () => {
    const harness = mount({ report: null, write: () => Promise.resolve(failure) });
    harness.save.requestSave();
    await settle();

    expect(screen.getByTestId('save-notice').getAttribute('role')).toBe('alert');
  });

  it('clears itself when a later save succeeds', async () => {
    // A transient full disk resolves without anyone clicking anything.
    let outcome: SaveWriteOutcome = failure;
    const harness = mount({ report: null, write: () => Promise.resolve(outcome) });

    harness.save.requestSave();
    await settle();
    expect(screen.getByTestId('save-notice')).toBeDefined();

    outcome = { ok: true };
    harness.save.requestSave();
    await settle();

    expect(screen.queryByTestId('save-notice')).toBeNull();
  });

  it('shows in work mode too — silence there would be misleading', async () => {
    const harness = mount({ report: null, write: () => Promise.resolve(failure) });
    harness.save.requestSave();
    await settle();
    harness.setWorkMode(true);

    expect(screen.getByTestId('save-notice')).toBeDefined();
  });
});
