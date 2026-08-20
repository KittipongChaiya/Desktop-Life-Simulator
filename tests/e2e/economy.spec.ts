/**
 * The full economic loop, end to end. Phase-06e.
 *
 * Drives the REAL app through every stage the phase built: buy seeds → plant →
 * grow (console-accelerated) → harvest → sell → hire → build → expand. Each
 * step travels the ordinary player command path; the assertions read the same
 * HUD the player does. This is the loop `GAME_DESIGN.md` §1's diagram draws,
 * exercised as one continuous session.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { plotCentreOnScreen, shoot, waitForDevTools } from './framing';
import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
/** The throwaway profile this spec runs on (07e — the app saves itself now). */
let session: IsolatedSession;

async function setCollapsed(collapsed: boolean): Promise<void> {
  const window = await app.firstWindow();
  await window.evaluate(async (value: boolean) => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(c: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(value);
  }, collapsed);
}

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

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await waitForDevTools(window);
  // Fund the session through the declared dev source — the loop's MECHANICS
  // are the subject here; pacing belongs to the 06f playthrough.
  await consoleCommand('money 5000');
});

test.afterEach(async () => {
  await session.dispose();
});

test('the full loop: buy, plant, grow, harvest, sell, hire, build, expand', async () => {
  const window = await app.firstWindow();
  const coins = window.locator('[title="Coins"]');
  await setCollapsed(false);

  // ── Buy seeds ──────────────────────────────────────────────────────────────
  await window.getByRole('button', { name: 'Shop' }).click();
  const shop = window.getByTestId('shop');
  await shop.getByRole('button', { name: '+10' }).first().click(); // turnip ×10, 50g
  await window.getByRole('button', { name: 'Shop' }).click(); // close, clear the world view

  // ── Till and plant the centre tile (tools 1 and 2; turnip is the default
  //    selected seed) ─────────────────────────────────────────────────────────
  const centre = await plotCentreOnScreen(window);
  await new Promise((resolve) => setTimeout(resolve, 300)); // let the world mount
  await window.keyboard.press('1');
  await window.mouse.click(centre.x, centre.y);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await window.keyboard.press('2');
  await window.mouse.click(centre.x, centre.y);
  await new Promise((resolve) => setTimeout(resolve, 150));

  // ── Grow: a turnip needs 1,800 ticks (§3.1); advance 2,000 through the
  //    console ────────────────────────────────────────────────────────────────
  await consoleCommand('tick 2000');

  // ── Harvest (tool 4) ──────────────────────────────────────────────────────
  await window.keyboard.press('4');
  await window.mouse.click(centre.x, centre.y);

  // The turnip lands in the inventory.
  const inventory = window.getByRole('button', { name: /^Inventory/ });
  await inventory.click();
  const panel = window.getByTestId('inventory');
  await expect(panel.getByText('Turnip', { exact: true })).toBeVisible();

  // ── Sell it at the live price ─────────────────────────────────────────────
  const readCoins = async (): Promise<number> =>
    Number((await coins.textContent())?.replaceAll(/[^0-9]/g, '') ?? '0');
  const before = await readCoins();
  // Read the price the ROW shows rather than assuming base: since phase-21
  // the town's demand swings it ±15% per world seed (ADR-033), and what this
  // asserts is the promise that matters — the panel's number is exactly what
  // the sale credits.
  const rowPrice = Number(
    ((await panel.getByText(/^\d+g/).first().textContent()) ?? '0').replaceAll(/[^0-9]/g, ''),
  );
  await panel.getByRole('button', { name: 'Sell 1' }).first().click();
  await expect.poll(readCoins).toBe(before + rowPrice);
  await inventory.click(); // close

  // ── Hire the first worker (150g — affordable thanks to the dev grant) ─────
  const workers = window.locator('[title="Workers hired"]');
  await window.getByRole('button', { name: /^Hire/ }).click();
  await expect(workers).toHaveText('1 worker');

  // ── Build a storage shed on a clear tile ──────────────────────────────────
  await window.getByRole('button', { name: 'Shop' }).click();
  await shop.getByRole('button', { name: 'Build Storage Shed' }).click();
  await window.mouse.click(centre.x + 64, centre.y); // two tiles east of centre
  // 40 base + the shed's 50; the 9 unplanted seeds hold one slot.
  await expect(inventory).toContainText('1/90');

  // ── Expand the plot ───────────────────────────────────────────────────────
  await expect(shop.getByText('(0 bought)')).toBeVisible();
  await shop.getByRole('button', { name: 'Expand' }).click();
  await expect(shop.getByText('(1 bought)')).toBeVisible();

  await shoot(app, 'test-results/economy-full-loop.png');
});

test('the tool bar arms a tool with the mouse, and planting works (07.5h regression)', async () => {
  // THE DEFECT THIS GUARDS. Clicking the ground does nothing unless a tool is
  // armed, and arming one used to be possible only by pressing `1`, `2`, or `4`
  // — stated in no interface anywhere. A player who bought seeds, saw them in
  // the inventory, and clicked the ground got silence with no clue what was
  // missing (reported from a real session, twice).
  const window = await app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();
  await waitForDevTools(window);

  const plant = window.getByRole('button', { name: /Plant/ });
  await expect(plant).toBeVisible();
  // The key is on the button, so the keyboard route is discoverable too.
  await expect(plant).toContainText('2');

  await expect(plant).toHaveAttribute('aria-pressed', 'false');
  await plant.click();
  await expect(plant).toHaveAttribute('aria-pressed', 'true');

  // Clicking it again disarms: the mouse can undo what the mouse did.
  await plant.click();
  await expect(plant).toHaveAttribute('aria-pressed', 'false');
});

test('a refused action says WHY, instead of looking like a dead click (07.5i)', async () => {
  // THE DEFECT THIS GUARDS. A rejected action produced only a brief amber tile
  // outline; execution-time rejections went to a devtools metric. Neither told
  // the player anything, so every wrong move read as "nothing happens" — which
  // is exactly how it was reported, three times.
  //
  // The assertion is that the game SPEAKS, not what it says: the exact wording
  // per error code is pinned in `action-feedback.test.ts`, and tying a live
  // click to one specific code would depend on where the starting plot happens
  // to sit on screen.
  const window = await app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();
  await waitForDevTools(window);

  // Arm Plant and click ground the player has not prepared — the single most
  // likely first thing a new player does.
  await window.getByRole('button', { name: /Plant/ }).click();
  await window.mouse.click(400, 150);

  const notice = window.getByTestId('action-notice');
  await expect(notice).toBeVisible();
  await expect(notice).not.toBeEmpty();
});

test('the tool bar shows the icons drawn for it back in phase-05.5 (07.5i)', async () => {
  // The art existed and went unused, because the toolbar it was drawn for did
  // not exist until 07.5h. `AtlasSprite` falls back to a blank box for a frame
  // name it cannot resolve, so a typo would render nothing and look deliberate
  // — asserting the background image is what distinguishes the two.
  const window = await app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();
  await waitForDevTools(window);

  const resolved = await window.evaluate(() => {
    const bar = document.querySelector('[data-testid="tool-bar"]');
    return [...(bar?.querySelectorAll('span') ?? [])]
      .map((span) => getComputedStyle(span).backgroundImage)
      .filter((image) => image !== 'none' && image !== '').length;
  });

  // One per tool.
  expect(resolved).toBeGreaterThanOrEqual(3);
});
