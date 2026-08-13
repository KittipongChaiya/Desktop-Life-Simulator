/**
 * Phase-15 — holding an offer until the player can be told about it.
 *
 * `update-policy.ts` decides WHAT may be offered and WHETHER now is a good
 * moment. Neither question needs memory. This one does: an offer made while
 * the player is busy has to survive until they are not, and it has to survive
 * without becoming a second announcement when they toggle work mode twice.
 */

import { describe, expect, it } from 'vitest';

import {
  announceVerdict,
  announceToPresence,
  NO_ANNOUNCEMENT,
  type AnnouncerState,
} from './update-announcer';
import type { UpdateVerdict } from './update-policy';

const BUSY = { hidden: false, workMode: true } as const;
const PRESENT = { hidden: false, workMode: false } as const;

const offer = (version = '0.2.1'): UpdateVerdict => ({ kind: 'offer', version });
const held: UpdateVerdict = { kind: 'hold', reason: 'halted' };
const refused: UpdateVerdict = {
  kind: 'refuse',
  refusal: {
    reason: 'save-is-newer',
    saveVersion: 6,
    targetVersion: 5,
    recoveryHint: 'backups/slot-0-v6-premigration.json',
  },
};

/** Runs a verdict into a fresh announcer and returns the whole step. */
function first(verdict: UpdateVerdict, presence: typeof PRESENT | typeof BUSY = PRESENT) {
  return announceVerdict(NO_ANNOUNCEMENT, verdict, presence);
}

describe('an offer reaches a player who is available', () => {
  it('announces immediately', () => {
    const step = first(offer());

    expect(step.announce).toEqual({ kind: 'offer', version: '0.2.1' });
  });

  it('says nothing at all about a hold', () => {
    // Every hold is silent by construction (`update-policy.ts`): the absence
    // of an announcement, never a message saying nothing happened.
    expect(first(held).announce).toBeNull();
  });

  it('announces a refusal, because that one is written for the player', () => {
    const step = first(refused);

    expect(step.announce?.kind).toBe('refusal');
    // The message comes from `explainRefusal`, so the wording lives with the
    // rule rather than being restated here.
    expect(step.announce?.kind === 'refusal' && step.announce.message).toContain('6');
  });
});

describe('an offer waits for a player who is busy', () => {
  it('holds the announcement rather than dropping it', () => {
    const step = first(offer(), BUSY);

    expect(step.announce).toBeNull();
    expect(step.state.pending).not.toBeNull();
  });

  it('delivers it the moment they are available again', () => {
    const waiting = first(offer(), BUSY).state;

    const step = announceToPresence(waiting, PRESENT);

    expect(step.announce).toEqual({ kind: 'offer', version: '0.2.1' });
  });

  it('keeps waiting while they are still busy', () => {
    const waiting = first(offer(), BUSY).state;

    expect(announceToPresence(waiting, BUSY).announce).toBeNull();
    expect(announceToPresence(waiting, BUSY).state.pending).not.toBeNull();
  });

  it('has nothing to deliver when nothing was pending', () => {
    expect(announceToPresence(NO_ANNOUNCEMENT, PRESENT).announce).toBeNull();
  });
});

describe('an announcement is delivered once per version, not once per opportunity', () => {
  it('does not repeat itself when presence toggles', () => {
    const told = first(offer()).state;

    // Leaving and re-entering work mode is not new information about 0.2.1.
    expect(announceToPresence(told, BUSY).announce).toBeNull();
    expect(announceToPresence(told, PRESENT).announce).toBeNull();
  });

  it('does not repeat itself when the same release is checked again', () => {
    const told = first(offer()).state;

    expect(announceVerdict(told, offer(), PRESENT).announce).toBeNull();
  });

  it('announces a genuinely newer release', () => {
    const told = first(offer('0.2.1')).state;

    const step = announceVerdict(told, offer('0.2.2'), PRESENT);

    expect(step.announce).toEqual({ kind: 'offer', version: '0.2.2' });
  });
});

describe('a halt reaches an offer that has not been shown yet', () => {
  it('drops a pending announcement when the release stops being offered', () => {
    // This is the halt's entire purpose (ADR-025 §6): stopping an in-flight
    // rollout before more installs take it. An offer queued behind work mode
    // and then announced anyway would be a halt that arrived too late for the
    // one player it could still have helped.
    const waiting: AnnouncerState = first(offer(), BUSY).state;

    const step = announceVerdict(waiting, held, BUSY);

    expect(step.state.pending).toBeNull();
    expect(announceToPresence(step.state, PRESENT).announce).toBeNull();
  });
});
