/**
 * The return summary's state and formatting. Phase-07e — `GAME_DESIGN.md`
 * §9.4, acceptance criterion 24.
 */

import { describe, expect, it, vi } from 'vitest';

import { RETURN_SUMMARY_MIN_TICKS, TICKS_PER_SECOND } from '../../shared/constants';

import {
  createReturnSummary,
  formatBlocker,
  formatTimeAway,
  type ReturnSummaryReport,
} from './return-summary';

const report = (overrides: Partial<ReturnSummaryReport> = {}): ReturnSummaryReport => ({
  elapsedTicks: TICKS_PER_SECOND * 60 * 30,
  harvests: 42,
  coinsEarned: 812,
  blockedAfterTicks: null,
  ...overrides,
});

describe('the 60-second gate', () => {
  it('holds a report for a gap that earns one', () => {
    const summary = createReturnSummary(report());
    expect(summary.report()?.harvests).toBe(42);
  });

  it('holds nothing for a gap under a minute', () => {
    // An ordinary relaunch. A summary here is an interruption, not news.
    const summary = createReturnSummary(report({ elapsedTicks: RETURN_SUMMARY_MIN_TICKS - 1 }));
    expect(summary.report()).toBeNull();
  });

  it('shows at exactly the threshold', () => {
    const summary = createReturnSummary(report({ elapsedTicks: RETURN_SUMMARY_MIN_TICKS }));
    expect(summary.report()).not.toBeNull();
  });

  it('holds nothing when there was no catch-up at all', () => {
    expect(createReturnSummary(null).report()).toBeNull();
  });
});

describe('dismissal', () => {
  it('clears the report and notifies', () => {
    const summary = createReturnSummary(report());
    const listener = vi.fn();
    summary.subscribe(listener);

    summary.dismiss();

    expect(summary.report()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second dismissal notifies nobody', () => {
    const summary = createReturnSummary(report());
    const listener = vi.fn();
    summary.subscribe(listener);

    summary.dismiss();
    summary.dismiss();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes cleanly', () => {
    const summary = createReturnSummary(report());
    const listener = vi.fn();
    summary.subscribe(listener)();

    summary.dismiss();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('formatTimeAway', () => {
  const minutes = (n: number): number => TICKS_PER_SECOND * 60 * n;

  it.each([
    [minutes(8), '8m'],
    [minutes(60), '1h'],
    [minutes(134), '2h 14m'],
    [minutes(60 * 8), '8h'],
  ])('renders %i ticks as %s', (ticks, expected) => {
    expect(formatTimeAway(ticks)).toBe(expected);
  });

  it('falls back to seconds below a minute', () => {
    expect(formatTimeAway(TICKS_PER_SECOND * 30)).toBe('30s');
  });

  it('never renders negative time', () => {
    expect(formatTimeAway(-500)).toBe('0s');
  });
});

describe('formatBlocker', () => {
  it('says when progress stopped, not merely that it did (§9.4)', () => {
    // Away 8 hours; storage filled 2h 14m in. "Storage was full" alone says
    // nothing about whether that cost ten minutes or seven hours.
    const line = formatBlocker(
      report({
        elapsedTicks: TICKS_PER_SECOND * 60 * 60 * 8,
        blockedAfterTicks: TICKS_PER_SECOND * 60 * 134,
      }),
    );

    expect(line).toBe('Storage full after 2h 14m');
  });

  it('says nothing when nothing blocked', () => {
    expect(formatBlocker(report())).toBeNull();
  });
});
