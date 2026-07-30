/**
 * Overlay hit-testing. Phase-07.5g (regression).
 *
 * The bug: clicking a tile did nothing in the real app, because the world is
 * not a `[data-interactive]` element and hit-testing passed the mouse through
 * everywhere that was not one. Reproducible only with a real mouse — which is
 * exactly why the rule now lives in a pure function with a truth table.
 */

import { describe, expect, it } from 'vitest';

import { shouldCaptureMouse, type HitTestState } from './hit-test';

const state = (overrides: Partial<HitTestState> = {}): HitTestState => ({
  overInteractiveElement: false,
  collapsed: false,
  workMode: false,
  ...overrides,
});

describe('the expanded world is playable (the regression)', () => {
  it('KEEPS the mouse over the world when expanded', () => {
    // The whole bug in one assertion. `GAME_DESIGN.md` §10.1 rule 3: planting
    // and harvesting are one click from the expanded view — which requires the
    // click to arrive.
    expect(shouldCaptureMouse(state())).toBe(true);
  });

  it('keeps it over the world even though the world carries no data-interactive', () => {
    // The old rule asked only this question, and got the wrong answer.
    expect(shouldCaptureMouse(state({ overInteractiveElement: false }))).toBe(true);
  });
});

describe('a real control always wins', () => {
  it.each([
    ['expanded', {}],
    ['collapsed', { collapsed: true }],
    ['work mode', { workMode: true }],
  ])('keeps the mouse over an interactive element while %s', (_label, overrides) => {
    expect(shouldCaptureMouse(state({ ...overrides, overInteractiveElement: true }))).toBe(true);
  });
});

describe('the presence modes still reach the desktop', () => {
  it('passes the mouse through in WORK MODE — the mode exists to stay out of the way', () => {
    expect(shouldCaptureMouse(state({ workMode: true }))).toBe(false);
  });

  it('passes it through when COLLAPSED, outside the status bar', () => {
    // Collapsed is a status bar, not a game board.
    expect(shouldCaptureMouse(state({ collapsed: true }))).toBe(false);
  });

  it('work mode wins over expanded', () => {
    expect(shouldCaptureMouse(state({ collapsed: false, workMode: true }))).toBe(false);
  });

  it('work mode wins over collapsed too — the answer is the same either way', () => {
    expect(shouldCaptureMouse(state({ collapsed: true, workMode: true }))).toBe(false);
  });
});

describe('the table is total', () => {
  it('answers every combination without throwing', () => {
    // Eight states, all reachable: the overlay can be expanded or collapsed,
    // in work mode or not, over a control or not.
    for (const overInteractiveElement of [false, true]) {
      for (const collapsed of [false, true]) {
        for (const workMode of [false, true]) {
          const answer = shouldCaptureMouse({ overInteractiveElement, collapsed, workMode });
          expect(typeof answer).toBe('boolean');
        }
      }
    }
  });
});
