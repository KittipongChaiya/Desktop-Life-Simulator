/**
 * HUD panels must not cover each other's controls. Phase-07.9.
 *
 * THE BUG THIS FIXES. Both HUD columns anchored a second panel 36px below the
 * first — `top: 8px` and `top: 44px`, left and right — and the upper panel
 * opens DOWNWARD through the lower one. With Settings open, the Settings body
 * lay exactly over the inventory's rows, so every `Sell 1` and `All` button was
 * covered: visible, un-dimmed, and completely unclickable. Reported as "I am
 * unable to sell items directly from my inventory", and it is not a selling bug
 * at all — the command path was healthy the whole time, the clicks were landing
 * on the settings panel.
 *
 * The panels could never have coexisted: on a 220px overlay, the inventory's
 * 168px body plus the settings' 126px body plus two toggles is ~340px of
 * content in 220px of window.
 *
 * WHY THE INVARIANT AND NOT COORDINATES. Asserting "settings sits at x=1444"
 * would pass while some future third panel lands on top of the sell buttons.
 * What actually matters is that a control inside its own panel's visible area
 * is the thing the mouse would hit — so that is what is asserted, for every
 * control the HUD renders, with every panel open at once.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { waitForDevTools } from './framing';
import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
let session: IsolatedSession;

interface Occlusion {
  readonly control: string;
  readonly panel: string;
  readonly at: string;
  readonly blockedBy: string;
}

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await waitForDevTools(window);
});

test.afterEach(async () => {
  await session.dispose();
});

/** Runs a devtools console command (F1 toggles; the input autofocuses). */
async function consoleCommand(command: string): Promise<void> {
  const window = await app.firstWindow();
  await window.keyboard.press('F1');
  const input = window.getByLabel('Developer console input');
  await input.fill(command);
  await input.press('Enter');
  await window.keyboard.press('F1');
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/**
 * Every visible control that is covered by something outside its own panel.
 *
 * Controls scrolled out of their OWN panel's viewport are skipped: an internally
 * scrolled list is working as designed, and counting those would drown the real
 * signal in noise.
 */
async function occlusions(): Promise<Occlusion[]> {
  const window = await app.firstWindow();
  return window.evaluate(() => {
    const panelOf = (element: Element | null): string =>
      element?.closest('[data-testid]')?.getAttribute('data-testid') ?? 'app';

    /** The nearest ancestor that clips its overflow, if any. */
    const scrollerOf = (element: Element): Element | null => {
      let node: Element | null = element.parentElement;
      while (node !== null) {
        const overflow = getComputedStyle(node).overflowY;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return node;
        node = node.parentElement;
      }
      return null;
    };

    const found: Occlusion[] = [];

    for (const element of document.querySelectorAll('button, input')) {
      if (!(element instanceof HTMLElement) || element.offsetParent === null) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      // Skip anything scrolled out of its own list, or off the window entirely.
      const scroller = scrollerOf(element);
      if (scroller !== null) {
        const clip = scroller.getBoundingClientRect();
        if (y < clip.top || y > clip.bottom || x < clip.left || x > clip.right) continue;
      }
      if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) continue;

      const hit = document.elementFromPoint(x, y);
      if (hit === element || element.contains(hit)) continue;

      // The status bar's own collapse chevron sits under the inventory toggle,
      // in the top-right corner they both claim. That is a separate, older
      // overlap between the BAR and a panel rather than between two panels, it
      // predates this spec, and Space still collapses the overlay — so it is
      // reported rather than guarded here. Remove this skip when it is fixed.
      if (panelOf(element) === 'app-root') continue;

      found.push({
        control: (element.textContent ?? element.getAttribute('aria-label') ?? '')
          .trim()
          .slice(0, 30),
        panel: panelOf(element),
        at: `${String(Math.round(rect.x))},${String(Math.round(rect.y))}`,
        blockedBy: `${panelOf(hit)}: ${(hit?.textContent ?? '').trim().slice(0, 30)}`,
      });
    }

    return found;
  });
}

test("no HUD panel covers another panel's controls, with everything open", async () => {
  const window = await app.firstWindow();
  await consoleCommand('money 50000');
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(c: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(false);
  });

  // Stock the inventory so the sell rows exist to be covered, and hire a worker
  // so the worker list has rows of its own.
  await window.getByRole('button', { name: 'Shop' }).click();
  const plus = window.getByTestId('shop').getByRole('button', { name: '+10' });
  for (let i = 0, n = await plus.count(); i < n; i += 1) {
    await plus.nth(i).click();
  }
  await window.getByRole('button', { name: /^Hire/ }).click();

  // Everything the player can open, open at once — the state a real session
  // reaches simply by not closing things.
  for (const name of [/^Inventory/, 'Settings'] as const) {
    await window.getByRole('button', { name }).first().click();
  }
  // The left column has the same two-anchor structure (workers at top 8, shop
  // at top 44), so its panel has to be open for this to mean anything.
  const workers = window.getByTestId('worker-panel').getByRole('button', { name: /worker/ });
  await workers.click();

  const covered = await occlusions();
  expect(covered, `covered controls:\n${JSON.stringify(covered, null, 2)}`).toEqual([]);
});

test('every sell button is clickable while the settings panel is open', async () => {
  // The reported bug, at its narrowest: this is the exact sequence a player
  // performs — open settings, leave it open, go to sell.
  const window = await app.firstWindow();
  await consoleCommand('money 50000');
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(c: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(false);
  });

  await window.getByRole('button', { name: 'Shop' }).click();
  const plus = window.getByTestId('shop').getByRole('button', { name: '+10' });
  for (let i = 0, n = await plus.count(); i < n; i += 1) {
    await plus.nth(i).click();
  }
  await window.getByRole('button', { name: 'Shop' }).click();

  await window.getByRole('button', { name: 'Settings' }).click();
  await window.getByRole('button', { name: /^Inventory/ }).click();

  const inventory = window.getByTestId('inventory');
  const sell = inventory.getByRole('button', { name: 'Sell 1' });
  expect(await sell.count()).toBeGreaterThan(0);

  // Every one of them is the thing the mouse would actually hit. This is the
  // assertion the bug would have failed: the buttons were all present, all
  // enabled, and all underneath the settings panel.
  const unreachable = await window.evaluate(() => {
    const panel = document.querySelector('[data-testid="inventory"] [class*="panel"]');
    const clip = panel?.getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid="inventory"] button')]
      .filter((button) => /^(Sell 1|All)$/.test((button.textContent ?? '').trim()))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const y = rect.top + rect.height / 2;
        // A row scrolled out of the panel's OWN viewport is working as designed
        // — the list scrolls. The invariant is about a control that is on show
        // and still cannot be hit, which is what the settings panel caused.
        if (clip !== undefined && (y < clip.top || y > clip.bottom)) return false;
        return document.elementFromPoint(rect.left + rect.width / 2, y) !== button;
      })
      .map(
        (button) =>
          `${(button.textContent ?? '').trim()} @${String(Math.round(button.getBoundingClientRect().y))}`,
      );
  });

  expect(unreachable).toEqual([]);

  // And a real sale through a real click. Asserted on the slot count rather
  // than the coin readout: coins TWEEN, so a mid-animation reading is a number
  // the wallet never held, while `used/total` steps exactly when the stack goes.
  const toggle = window.getByRole('button', { name: /^Inventory/ });
  const usedSlots = async (): Promise<number> =>
    Number((/·\s*(\d+)\s*\//.exec((await toggle.textContent()) ?? '') ?? [])[1] ?? -1);

  const before = await usedSlots();
  expect(before).toBeGreaterThan(0);

  // "All" empties the stack, which removes it — one slot, deterministically.
  await inventory.getByRole('button', { name: 'All' }).first().click({ timeout: 5_000 });
  await expect.poll(usedSlots).toBe(before - 1);
});
