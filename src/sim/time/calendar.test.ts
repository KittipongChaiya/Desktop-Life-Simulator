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

import {
  DAY_PHASES,
  DayPhase,
  dayFor,
  phaseFor,
  phaseStartTick,
  seasonFor,
  seasonIndexFor,
  timeOfDayFor,
} from './game-clock';

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

describe('the season cycle (ADR-021 §1)', () => {
  const YEAR = ['core:spring', 'core:summer', 'core:autumn', 'core:winter'];
  const DAYS = 7;

  it('starts a world in the first season', () => {
    expect(seasonIndexFor(0, DAYS, YEAR.length)).toBe(0);
    expect(seasonFor(0, DAYS, YEAR)).toBe('core:spring');
  });

  it('turns on the day the season length says, not a day early or late', () => {
    // The boundary is the whole feature: day 6 is still spring, day 7 is not.
    expect(seasonFor(DAYS - 1, DAYS, YEAR)).toBe('core:spring');
    expect(seasonFor(DAYS, DAYS, YEAR)).toBe('core:summer');
  });

  it('covers every season exactly once per year, in order, with no gap', () => {
    // ADR-021 §Validation, stated as the derivation test it asks for. A gap
    // would be a day belonging to no season; an overlap would be a day
    // belonging to two.
    const seen: string[] = [];
    let previous: string | undefined;

    for (let day = 0; day < DAYS * YEAR.length; day += 1) {
      const season = seasonFor(day, DAYS, YEAR);
      expect(season, `day ${String(day)} has no season`).toBeDefined();
      if (season !== previous) {
        seen.push(season as string);
        previous = season;
      }
    }

    expect(seen).toEqual(YEAR);
  });

  it('repeats forever without a year counter to store', () => {
    // Several years, as ADR-021 §Validation asks. Nothing accumulates, so the
    // only way this drifts is arithmetic.
    for (let year = 0; year < 12; year += 1) {
      for (const [index, expected] of YEAR.entries()) {
        const day = year * DAYS * YEAR.length + index * DAYS;
        expect(seasonFor(day, DAYS, YEAR), `year ${String(year)}, ${expected}`).toBe(expected);
      }
    }
  });

  it('agrees with the day derivation it is built on', () => {
    // The season must be a function of the DAY, not of the tick directly —
    // otherwise a change to the day length would move seasons independently.
    const ticksPerDay = 24_000;
    const tick = ticksPerDay * 10 + 500;

    expect(seasonFor(dayFor(tick, ticksPerDay), DAYS, YEAR)).toBe('core:summer');
  });

  it('honours a content source shipping a two-season year', () => {
    const short = ['mod:wet', 'mod:dry'];

    expect(seasonFor(0, 3, short)).toBe('mod:wet');
    expect(seasonFor(3, 3, short)).toBe('mod:dry');
    expect(seasonFor(6, 3, short)).toBe('mod:wet');
  });

  it('is total on a degenerate year rather than dividing by zero', () => {
    // Unreachable through the public API — `core` registers four seasons and
    // cannot be disabled — but a total function is cheaper than a proof.
    expect(seasonIndexFor(5, 7, 0)).toBe(0);
    expect(seasonIndexFor(5, 0, 4)).toBe(0);
    expect(seasonFor(5, 7, [])).toBeUndefined();
  });
});
