/**
 * WCAG contrast maths. Phase-07.5d — `fix/0.1/7.5.md` §Accessibility.
 *
 * Exists so "colour contrast" is a MEASUREMENT with a passing threshold rather
 * than an opinion about whether something looks readable. The overlay is read
 * peripherally, at small sizes, over whatever the player happens to have on
 * their desktop (`GAME_DESIGN.md` §10.1 rule 4) — the case where guessing is
 * least reliable and a ratio is most useful.
 *
 * Implements WCAG 2.2's relative-luminance and contrast-ratio definitions
 * directly. Pure arithmetic, no colour library: the formulas are eight lines
 * and a dependency here would be a dependency shipped to players.
 */

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
