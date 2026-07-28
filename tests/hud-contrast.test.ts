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

// ---------------------------------------------------------------------------
// WCAG 2.2 contrast maths.
//
// Lives HERE, beside the only thing that uses it, rather than in `src`. It is
// a verification tool, not shipped code: nothing in the running game asks for
// a contrast ratio, and a module under `src` that nothing imports is exactly
// the orphan `AI_RULES.md` Rule 6 forbids — the dependency cruiser said so.
//
// Implemented directly from the spec rather than pulled from a package: the
// formulas are eight lines, and a dependency here would ship to players.
// ---------------------------------------------------------------------------
/** WCAG 2.2 §1.4.3 — normal-size body text. */
export const CONTRAST_AA_TEXT = 4.5;
/** WCAG 2.2 §1.4.3 — large text (≥ 18.66 px bold, or ≥ 24 px). */
export const CONTRAST_AA_LARGE = 3;
/** WCAG 2.2 §1.4.11 — UI component boundaries and graphical objects. */
export const CONTRAST_AA_NON_TEXT = 3;

/** An `#rgb`, `#rrggbb`, `rgb(...)`, or `rgba(...)` colour as 0–255 channels. */
export interface Channels {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1. Used to composite over a backdrop before measuring. */
  readonly a: number;
}

/**
 * Parses the colour notations this project's stylesheets actually use.
 *
 * Deliberately narrow: it throws on anything it does not understand rather
 * than guessing, so a new notation fails the test that calls it instead of
 * silently measuring the wrong colour.
 */
export function parseColor(value: string): Channels {
  const text = value.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex !== null) {
    const digits = hex[1] ?? '';
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (rgb !== null) {
    // Both CSS forms appear in this project's stylesheets: the legacy
    // `rgba(r, g, b, a)` and the modern `rgb(r g b / a%)`. A percentage alpha
    // is why this parser is not just `Number()` — `Number('88%')` is NaN, and
    // an NaN alpha propagates silently into a NaN ratio that no threshold
    // can catch. It did exactly that on first run.
    const toNumber = (part: string): number =>
      part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : Number(part);

    const parts = (rgb[1] ?? '')
      .split(/[,/\s]+/)
      .filter(Boolean)
      .map(toNumber);
    const [r, g, b, a] = parts;
    if (r === undefined || g === undefined || b === undefined || parts.some(Number.isNaN)) {
      throw new Error(`unparseable colour: ${value}`);
    }
    return { r, g, b, a: a ?? 1 };
  }

  throw new Error(`unsupported colour notation: ${value}`);
}

/**
 * Composites a possibly-translucent colour over an opaque backdrop.
 *
 * Necessary rather than pedantic: almost every panel in this HUD is a
 * translucent dark plate over the player's desktop, so measuring its declared
 * colour would measure something that is never on screen.
 */
export function over(foreground: Channels, backdrop: Channels): Channels {
  const alpha = Math.min(1, Math.max(0, foreground.a));
  return {
    r: foreground.r * alpha + backdrop.r * (1 - alpha),
    g: foreground.g * alpha + backdrop.g * (1 - alpha),
    b: foreground.b * alpha + backdrop.b * (1 - alpha),
    a: 1,
  };
}

/** WCAG 2.2 relative luminance. */
export function luminance(color: Channels): number {
  const channel = (raw: number): number => {
    const value = raw / 255;
    return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/**
 * WCAG 2.2 contrast ratio, 1:1 to 21:1.
 *
 * Both colours are composited over `backdrop` first, so a translucent panel
 * and the text on it are both measured as they actually appear.
 */
export function contrastRatio(foreground: string, background: string, backdrop = '#000'): number {
  const base = parseColor(backdrop);
  const back = over(parseColor(background), base);
  const front = over(parseColor(foreground), back);

  const light = Math.max(luminance(front), luminance(back));
  const dark = Math.min(luminance(front), luminance(back));
  return (light + 0.05) / (dark + 0.05);
}

import { describe, expect, it } from 'vitest';

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
