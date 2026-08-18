/**
 * R-08, as a test instead of a promise. Phase-32 — ADR-041 §2.
 *
 * `STYLE_LOCK.md` R-08 says a colour outside `COLOR_PALETTE.md` is forbidden,
 * and until now nothing checked it. That was survivable while the palette held
 * 28 colours that one person had memorised. ADR-041 just added seventeen more
 * and the art phases are about to author the whole world set against them, so
 * the moment the rule actually matters is the moment before this file existed.
 *
 * The check is deliberately crude — every six-digit hex literal in the drawing
 * library must appear in the palette document. A crude check that runs is worth
 * more than a precise one that is a paragraph of prose in a style guide.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** Every `#rrggbb` in a file, upper-cased and de-duplicated. */
const hexes = (source: string): ReadonlySet<string> =>
  new Set((source.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((hex) => hex.toUpperCase()));

/**
 * Colours the document AUTHORISES — not every colour it mentions.
 *
 * `COLOR_PALETTE.md` records withdrawn proposals so the reasoning survives, and
 * a naive scan reads those as approved. The fenced regions are the difference
 * between "this colour is legal" and "this colour was considered and rejected".
 */
const authorised = (source: string): string =>
  source.replace(/<!-- palette-lock:ignore-start -->[\s\S]*?<!-- palette-lock:ignore-end -->/g, '');

const PALETTE = hexes(authorised(read('../docs/assets/COLOR_PALETTE.md')));

describe('the palette is locked to its document', () => {
  it.each(['../scripts/lib/pixel-art.mjs', '../scripts/lib/pixel-craft.mjs'])(
    '%s uses no colour outside COLOR_PALETTE.md',
    (library) => {
      const undocumented = [...hexes(read(library))].filter((hex) => !PALETTE.has(hex));

      expect(
        undocumented,
        `R-08: these colours are used by the drawing library but are not in ` +
          `docs/assets/COLOR_PALETTE.md. Either add them there by R-08's reviewed ` +
          `process, or use a documented colour: ${undocumented.join(', ')}`,
      ).toEqual([]);
    },
  );

  it('documents the colours ADR-041 §2 added, so the ADR is not aspirational', () => {
    // Named individually rather than counted: a count passes when someone adds
    // a different colour and drops one of these.
    for (const added of [
      '#7E5C3A', // Soil Rich
      '#6B4A31', // Timber Dark
      '#A87C4F', // Timber Warm
      '#D8BC93', // Birch Pale
      '#C4623F', // Roof Terracotta
      '#5E6E7A', // Roof Slate — the mill and kitchen stop wearing straw
      '#94836F', // Stone Warm — the brief forbids sterile grey
      '#EFE3C8', // Cream
      '#E38FA6', // Bloom Rose
      '#7FA8D8', // Bloom Blue
    ]) {
      expect(PALETTE, `ADR-041 §2 promised ${added}`).toContain(added);
    }
  });

  /**
   * R-09 by DISTANCE, not by equality.
   *
   * The first version of this test compared decorative colours against a list
   * of reserved ones for exact matches, and passed — while `#D95A4E` sat 33
   * units from Danger Red `#C8443C`, a colour §5 forbids in-world entirely.
   * Exact-match was the wrong question: nobody was ever going to reuse the
   * identical hex. The failure mode is a colour close enough that a player
   * reads a decoration as a signal.
   */
  const rgb = (hex: string): readonly [number, number, number] => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];

  const distance = (a: string, b: string): number => {
    const [ar, ag, ab] = rgb(a);
    const [br, bg, bb] = rgb(b);
    return Math.hypot(ar - br, ag - bg, ab - bb);
  };

  describe('decoration cannot be mistaken for a signal (R-09)', () => {
    /** `COLOR_PALETTE.md` §4, verbatim. Meaning is attached to these. */
    const RESERVED = [
      '#F2C24C', // Reward Gold
      '#FFE08A', // Gold Highlight
      '#E68436', // Carrot Orange
      '#CE6C22', // Pumpkin
      '#9B6FC4', // Rare Violet
      '#C9A6E8', // Rare Light
      '#C8443C', // Danger Red — forbidden in-world by §5
      '#8E2A26', // Danger Deep
    ];

    /**
     * READ FROM THE DOCUMENT, not listed here.
     *
     * A hardcoded list only guards the colours that existed when it was
     * written, and the whole point of this rule is the colour somebody adds in
     * phase 37 without thinking about §4. Deriving it means the next flower
     * has to answer the same question before it ships.
     */
    const DECORATIVE = [
      ...hexes(
        authorised(read('../docs/assets/COLOR_PALETTE.md'))
          .split('### 3.2d')[1]
          ?.split('### ')[0] ?? '',
      ),
      '#EFE3C8', // Cream — borrowed from §3.2c for white flowers
    ];

    /**
     * Below this, two colours read as the same thing on a 2 px mark at overlay
     * scale. The withdrawn Bloom Poppy scored 33 and Bloom Lilac 37, so the
     * threshold is set above both by enough that neither could be reinstated
     * by nudging a digit.
     */
    const MINIMUM = 45;

    it.each(DECORATIVE)('%s is far from every reserved accent', (decorative) => {
      const collisions = RESERVED.filter(
        (reserved) => distance(decorative, reserved) < MINIMUM,
      ).map((reserved) => `${reserved} (${distance(decorative, reserved).toFixed(0)})`);

      expect(
        collisions,
        `${decorative} is decorative and carries no meaning, but it is within ` +
          `${String(MINIMUM)} of a colour that does. Pick a different hue — the ` +
          `reserved accent is not the one that moves.`,
      ).toEqual([]);
    });

    it('rejects the two colours phase 32 withdrew', () => {
      // The regression this file exists for. If either is ever reinstated, the
      // rule above must fail on it rather than quietly accepting it.
      for (const [withdrawn, reserved] of [
        ['#D95A4E', '#C8443C'],
        ['#A98FD0', '#9B6FC4'],
      ] as const) {
        expect(distance(withdrawn, reserved)).toBeLessThan(MINIMUM);
        expect(PALETTE, `${withdrawn} was withdrawn and must stay out`).not.toContain(withdrawn);
      }
    });
  });
});
