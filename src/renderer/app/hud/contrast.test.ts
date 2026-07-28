/**
 * HUD contrast. Phase-07.5d — `fix/0.1/7.5.md` §Accessibility, criterion 6.
 *
 * The colour pairs below are the ones the shipped stylesheets actually use.
 * Keeping them here as a list is a deliberate trade: it can drift from the CSS,
 * but the alternative — parsing stylesheets and resolving the cascade — would
 * be a second rendering engine to maintain, and would still not know which
 * pairs ever appear together. A short, explicit list that a human updates is
 * more honest than an automated one that quietly measures nothing.
 *
 * WORST CASE ASSUMED: the panels are translucent plates over the player's
 * desktop, and the desktop can be white. Every ratio is therefore measured
 * over a WHITE backdrop, which is the least favourable case for the dark
 * plates this HUD uses. Passing here means passing on any wallpaper.
 */

import { describe, expect, it } from 'vitest';

import {
  CONTRAST_AA_LARGE,
  CONTRAST_AA_NON_TEXT,
  CONTRAST_AA_TEXT,
  contrastRatio,
  luminance,
  parseColor,
} from './contrast';

/** The least favourable desktop behind a translucent overlay. */
const WORST_BACKDROP = '#ffffff';

/** The one focus-ring colour, declared globally in `global.css`. */
const FOCUS_RING = '#6ea8fe';

/** Plate colours the panels are drawn on. */
const PLATE = {
  statusBar: 'rgb(18 20 26 / 88%)',
  panel: 'rgba(20, 22, 28, 0.9)',
  toast: 'rgba(20, 22, 28, 0.92)',
  errorNotice: 'rgba(38, 20, 22, 0.94)',
} as const;

describe('body text meets WCAG AA (4.5:1)', () => {
  it.each([
    ['status bar readout', '#e8ecf4', PLATE.statusBar],
    ['panel text', '#e8e8ec', PLATE.panel],
    ['companion toast', '#e8e8ec', PLATE.toast],
    ['save-failure notice', '#f4dcdc', PLATE.errorNotice],
    ['return summary', '#e8e8ec', PLATE.toast],
  ])('%s', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background, WORST_BACKDROP)).toBeGreaterThanOrEqual(
      CONTRAST_AA_TEXT,
    );
  });
});

describe('secondary and de-emphasised text still meets AA', () => {
  // Muted text is where contrast quietly fails: it is dimmed on purpose, and
  // "on purpose" is not a defence when it becomes unreadable.
  it.each([
    ['muted status columns', 'rgba(232, 232, 236, 0.62)', PLATE.statusBar],
    ['summary figure labels', 'rgba(232, 232, 236, 0.62)', PLATE.toast],
    ['notice detail', 'rgba(244, 220, 220, 0.82)', PLATE.errorNotice],
  ])('%s', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background, WORST_BACKDROP)).toBeGreaterThanOrEqual(
      CONTRAST_AA_TEXT,
    );
  });
});

describe('the accent colours', () => {
  it('the coin readout is legible on the status bar', () => {
    // Reward Gold is the one warm accent the bar carries, and the number it
    // colours is one of the three that matter most (`GAME_DESIGN.md` §10.1).
    expect(contrastRatio('#f2c24c', PLATE.statusBar, WORST_BACKDROP)).toBeGreaterThanOrEqual(
      CONTRAST_AA_TEXT,
    );
  });

  it('the blocker line reads as information, and reads at all', () => {
    expect(contrastRatio('#e3b341', PLATE.toast, WORST_BACKDROP)).toBeGreaterThanOrEqual(
      CONTRAST_AA_LARGE,
    );
  });
});

describe('interactive boundaries meet the non-text threshold (3:1)', () => {
  it('a focused control is distinguishable from an unfocused one', () => {
    // WCAG 2.2 §1.4.11: the focus indicator is a UI component boundary, and a
    // keyboard user who cannot see it cannot use the panel at all.
    expect(contrastRatio(FOCUS_RING, PLATE.panel, WORST_BACKDROP)).toBeGreaterThanOrEqual(
      CONTRAST_AA_NON_TEXT,
    );
  });
});

describe('the maths itself', () => {
  // A contrast helper that is wrong would pass every test above while
  // measuring nothing, so its own arithmetic is pinned against the values
  // WCAG states.
  it('black on white is 21:1, the defined maximum', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('a colour against itself is 1:1', () => {
    expect(contrastRatio('#7f7f7f', '#7f7f7f')).toBeCloseTo(1, 5);
  });

  it('is symmetric — order of arguments cannot change a ratio', () => {
    const forward = contrastRatio('#123456', '#abcdef');
    const backward = contrastRatio('#abcdef', '#123456');
    expect(forward).toBeCloseTo(backward, 10);
  });

  it('composites translucency over the backdrop, not against the void', () => {
    // A 50% white over black must measure as mid-grey, not as white.
    const composited = contrastRatio('rgba(255, 255, 255, 0.5)', '#000000', '#000000');
    expect(composited).toBeLessThan(contrastRatio('#ffffff', '#000000', '#000000'));
  });

  it('parses every notation the stylesheets use', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#e8e8ec').r).toBe(0xe8);
    expect(parseColor('rgba(20, 22, 28, 0.9)').a).toBeCloseTo(0.9, 5);
    expect(parseColor('rgb(18 20 26 / 88%)').r).toBe(18);
  });

  it('reads a PERCENTAGE alpha — the bug this suite caught on its first run', () => {
    // `Number('88%')` is NaN, and an NaN alpha propagates into an NaN ratio
    // that no threshold can catch: every assertion above passed vacuously
    // until this was fixed. The status bar uses exactly this notation.
    expect(parseColor('rgb(18 20 26 / 88%)').a).toBeCloseTo(0.88, 5);
    expect(contrastRatio('#e8ecf4', 'rgb(18 20 26 / 88%)', '#ffffff')).not.toBeNaN();
  });

  it('refuses a notation it does not understand rather than guessing', () => {
    // Silently returning black would make every ratio look excellent.
    expect(() => parseColor('hsl(200 50% 50%)')).toThrow();
  });

  it('luminance is ordered as perceived brightness', () => {
    expect(luminance(parseColor('#ffffff'))).toBeGreaterThan(luminance(parseColor('#808080')));
    expect(luminance(parseColor('#808080'))).toBeGreaterThan(luminance(parseColor('#000000')));
  });
});
