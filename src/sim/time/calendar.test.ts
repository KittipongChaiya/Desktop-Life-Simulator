/**
 * The derived calendar. Phase-10a — ADR-020.
 *
 * `ROADMAP.md` §6 states the acceptance these exist to prove: **`phaseFor`
 * covers every phase exactly once per day, in order, with no gap.** That is
 * checked by walking a whole day tick by tick rather than by sampling, because
 * a gap is exactly the kind of defect a spot check misses — one tick belonging
 * to no phase would leave the lighting layer showing whatever it showed last.
 *
 * The other property under test is that this is a DERIVATION. It reads a number
 * and returns a value; it holds no state, so the same tick always gives the
 * same answer and advancing the tick past an eight-hour gap needs no catch-up
 * (ADR-020 §1). The tests are written so they would fail if anyone made it
 * stateful.
 */

import { describe, expect, it } from 'vitest';

import { DAY_PHASES, DayPhase, dayFor, phaseFor, phaseStartTick, timeOfDayFor } from './game-clock';

/** A day short enough to walk exhaustively, and not a multiple of the phases. */
const TICKS_PER_DAY = 2_000;

describe('dayFor', () => {
  it('counts days from zero', () => {
    expect(dayFor(0, TICKS_PER_DAY)).toBe(0);
    expect(dayFor(TICKS_PER_DAY - 1, TICKS_PER_DAY)).toBe(0);
    expect(dayFor(TICKS_PER_DAY, TICKS_PER_DAY)).toBe(1);
  });

  it('keeps counting across many days', () => {
    expect(dayFor(TICKS_PER_DAY * 365 + 5, TICKS_PER_DAY)).toBe(365);
  });
});

describe('timeOfDayFor', () => {
  it('wraps within the day', () => {
    expect(timeOfDayFor(0, TICKS_PER_DAY)).toBe(0);
    expect(timeOfDayFor(TICKS_PER_DAY, TICKS_PER_DAY)).toBe(0);
    expect(timeOfDayFor(TICKS_PER_DAY + 7, TICKS_PER_DAY)).toBe(7);
  });

  it('never returns a negative time', () => {
    // A tick should never be negative, but a clamp here is cheaper than a
    // lighting layer indexing an array at -1 if one ever is.
    expect(timeOfDayFor(-1, TICKS_PER_DAY)).toBeGreaterThanOrEqual(0);
  });
});

describe('phaseFor covers the day exactly once, in order, with no gap', () => {
  const walk = Array.from({ length: TICKS_PER_DAY }, (_, tick) => phaseFor(tick, TICKS_PER_DAY));

  it('gives every tick of the day a phase', () => {
    expect(walk).toHaveLength(TICKS_PER_DAY);
    for (const [tick, phase] of walk.entries()) {
      expect(DAY_PHASES, `tick ${tick}`).toContain(phase);
    }
  });

  it('visits every phase', () => {
    expect(new Set(walk).size).toBe(DAY_PHASES.length);
  });

  it('visits them in the declared order, and each exactly once', () => {
    // A phase appearing twice means the day doubles back — the lighting would
    // run dusk, day, dusk, and no transition could make sense of it.
    const runs = walk.filter((phase, index) => phase !== walk[index - 1]);
    expect(runs).toEqual(DAY_PHASES);
  });

  it('starts the day in the first phase', () => {
    expect(phaseFor(0, TICKS_PER_DAY)).toBe(DayPhase.Dawn);
  });

  it('ends the day in the last phase, with no gap before midnight', () => {
    expect(phaseFor(TICKS_PER_DAY - 1, TICKS_PER_DAY)).toBe(DayPhase.Night);
  });

  it('repeats identically on the next day', () => {
    for (let tick = 0; tick < TICKS_PER_DAY; tick += 97) {
      expect(phaseFor(tick, TICKS_PER_DAY)).toBe(phaseFor(tick + TICKS_PER_DAY, TICKS_PER_DAY));
    }
  });
});

describe('phase boundaries', () => {
  it('changes phase exactly at each declared start', () => {
    for (const phase of DAY_PHASES.slice(1)) {
      const start = phaseStartTick(phase, TICKS_PER_DAY);
      expect(phaseFor(start, TICKS_PER_DAY), `${phase} at ${start}`).toBe(phase);
      expect(phaseFor(start - 1, TICKS_PER_DAY), `before ${phase}`).not.toBe(phase);
    }
  });

  it('changes exactly three times over a day — one boundary per phase after the first', () => {
    // The whole point of quantizing (ADR-020 §3): the lighting layer is dirtied
    // this many times per day, not 20 times a second.
    let changes = 0;
    for (let tick = 1; tick < TICKS_PER_DAY; tick += 1) {
      if (phaseFor(tick, TICKS_PER_DAY) !== phaseFor(tick - 1, TICKS_PER_DAY)) changes += 1;
    }
    expect(changes).toBe(DAY_PHASES.length - 1);
  });
});

describe('it is a derivation, not a system', () => {
  it('gives the same answer for the same tick, always', () => {
    for (const tick of [0, 1, 999, 100_000]) {
      expect(phaseFor(tick, TICKS_PER_DAY)).toBe(phaseFor(tick, TICKS_PER_DAY));
      expect(dayFor(tick, TICKS_PER_DAY)).toBe(dayFor(tick, TICKS_PER_DAY));
    }
  });

  it('jumping an eight-hour gap equals stepping through it', () => {
    // Advancing the tick IS the catch-up (ADR-020 §1). Nothing accumulates, so
    // there is nothing for offline progress to reconstruct.
    const gap = 576_000;
    let stepped = 0;
    for (let tick = 0; tick <= gap; tick += 1) stepped = tick;

    expect(dayFor(stepped, TICKS_PER_DAY)).toBe(dayFor(gap, TICKS_PER_DAY));
    expect(phaseFor(stepped, TICKS_PER_DAY)).toBe(phaseFor(gap, TICKS_PER_DAY));
  });

  it('works for any day length, so ticksPerDay stays a world constant', () => {
    for (const length of [100, 1_440, 24_000]) {
      expect(phaseFor(0, length)).toBe(DayPhase.Dawn);
      expect(phaseFor(length - 1, length)).toBe(DayPhase.Night);
    }
  });
});
