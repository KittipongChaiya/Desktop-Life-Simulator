/**
 * Interactive panels must be clickable. Phase-07.5g (regression).
 *
 * `App.module.css` states the contract: the UI root is pointer-transparent, so
 * "elements that should receive clicks set `pointer-events: auto` themselves
 * and carry `data-interactive` for hit-testing". TWO declarations, in two
 * different files, that must agree.
 *
 * They stopped agreeing. The return summary shipped with `data-interactive`
 * and no `pointer-events: auto`, which meant its Dismiss button was not a hit
 * target at all: the panel appeared, announced eight hours of offline
 * progress, and could never be closed. Nothing caught it — a jsdom test does
 * not apply CSS modules, and Playwright synthesises clicks inside the renderer
 * where `pointer-events` is the only gate that matters and the panel's own
 * `data-testid` still resolves.
 *
 * So this test reads the SOURCE. That is crude, and it is the only place the
 * two halves of the contract are visible together: a component's JSX and its
 * sibling stylesheet. It cannot check that the selector matches the element it
 * is applied to, but it does catch the failure that actually happened.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const HUD = join(__dirname, '..', 'src', 'renderer', 'app', 'hud');

/** Components that claim to be interactive, by declaring `data-interactive`. */
function interactiveComponents(): { name: string; css: string }[] {
  return (
    readdirSync(HUD)
      .filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))
      .map((file) => ({ file, source: readFileSync(join(HUD, file), 'utf8') }))
      // The attribute in JSX, not the word in a comment: CompanionToast
      // documents at length that it is deliberately NOT interactive.
      .filter((entry) => /<[^>]*\sdata-interactive[\s/>]/.test(entry.source))
      .map((entry) => {
        const name = entry.file.replace(/\.tsx$/, '');
        return { name, css: join(HUD, `${name}.module.css`) };
      })
  );
}

describe('every panel that claims `data-interactive`', () => {
  const components = interactiveComponents();

  it('finds the panels at all — a passing-because-empty suite is worthless', () => {
    // If the attribute or the directory is ever renamed, this suite would
    // silently verify nothing. Pinned so that failure is loud.
    expect(components.length).toBeGreaterThanOrEqual(5);
  });

  it.each(components)('$name opts back into pointer events', ({ css }) => {
    // The exact bug: `data-interactive` without `pointer-events: auto` is a
    // panel the player can see and cannot touch.
    expect(readFileSync(css, 'utf8')).toContain('pointer-events: auto');
  });
});

describe('panels that are deliberately untouchable', () => {
  it.each([['CompanionToast'], ['SaveNotice']])(
    '%s neither claims interactivity nor opts into pointer events',
    (name) => {
      // The other half of the contract. These two report; they never ask. A
      // toast that intercepted a click would flip the very hit-testing state
      // it is confirming, and a save-failure notice must not block the farm
      // underneath it.
      const source = readFileSync(join(HUD, `${name}.tsx`), 'utf8');
      const css = readFileSync(join(HUD, `${name}.module.css`), 'utf8');

      expect(/<[^>]*\sdata-interactive[\s/>]/.test(source)).toBe(false);
      expect(css).toContain('pointer-events: none');
    },
  );
});
