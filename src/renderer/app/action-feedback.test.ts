/**
 * Action feedback. Phase-07.5i.
 *
 * The defect: a rejected action said nothing a player could read, so every
 * wrong move looked like a broken click. Reported three times as "nothing
 * happens" before it was found.
 *
 * These tests are mostly about TOTALITY. A rejection that falls through to no
 * message would recreate the exact bug, so the mapping must answer for every
 * code the validator can produce — including ones added later.
 */

import { describe, expect, it, vi } from 'vitest';

import { appError, ErrorCode } from '../../shared/errors';

import { createActionFeedback, messageForRejection } from './action-feedback';

const error = (code: (typeof ErrorCode)[keyof typeof ErrorCode]) => appError(code, 'test');

describe('every rejection says something', () => {
  it.each(Object.values(ErrorCode))('%s produces a non-empty message', (code) => {
    // Totality is the point: silence is the bug.
    const message = messageForRejection(error(code));

    expect(message.length).toBeGreaterThan(0);
  });

  it('an unrecognised code still says something true', () => {
    // A code added later must not reintroduce silence.
    const message = messageForRejection(appError('something_new' as never, 'test'));

    expect(message.length).toBeGreaterThan(0);
  });

  it('names the FIX, not the rule', () => {
    // "till it first" is actionable; "tile is the wrong kind" is the
    // validator's vocabulary, not the player's.
    expect(messageForRejection(error(ErrorCode.TileWrongKind))).toContain('till');
    expect(messageForRejection(error(ErrorCode.MissingItem))).toContain('shop');
    expect(messageForRejection(error(ErrorCode.TileNotOwned))).toContain('expand');
  });

  it('distinguishes the cases a player will actually hit', () => {
    // Untilled ground and no seeds are the two most common failures, and they
    // need different answers — one is "till it", the other is "buy seeds".
    const wrongKind = messageForRejection(error(ErrorCode.TileWrongKind));
    const missing = messageForRejection(error(ErrorCode.MissingItem));

    expect(wrongKind).not.toBe(missing);
  });

  it('never leaks a code or an internal message to the player', () => {
    for (const code of Object.values(ErrorCode)) {
      const message = messageForRejection(appError(code, 'internal detail'));
      expect(message).not.toContain('internal detail');
      expect(message).not.toContain(code);
    }
  });
});

describe('the store', () => {
  it('starts silent — an idle farm has nothing to explain', () => {
    expect(createActionFeedback().message()).toBeNull();
  });

  it('reports a message and notifies', () => {
    const feedback = createActionFeedback();
    const listener = vi.fn();
    feedback.subscribe(listener);

    feedback.report(error(ErrorCode.TileWrongKind));

    expect(feedback.message()).toContain('till');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('newest wins — one slot, never a queue of stale complaints', () => {
    const feedback = createActionFeedback();

    feedback.report(error(ErrorCode.TileWrongKind));
    feedback.report(error(ErrorCode.MissingItem));

    expect(feedback.message()).toContain('seeds');
  });

  it('clears, and clearing twice notifies once', () => {
    const feedback = createActionFeedback();
    const listener = vi.fn();
    feedback.subscribe(listener);
    feedback.report(error(ErrorCode.InventoryFull));

    feedback.clear();
    feedback.clear();

    expect(feedback.message()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2); // one report, one clear
  });

  it('unsubscribes cleanly', () => {
    const feedback = createActionFeedback();
    const listener = vi.fn();
    feedback.subscribe(listener)();

    feedback.report(error(ErrorCode.InvalidIntent));

    expect(listener).not.toHaveBeenCalled();
  });
});
