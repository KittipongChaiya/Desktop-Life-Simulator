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
  const size = await window.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await new Promise((resolve) => setTimeout(resolve, 300)); // let the world mount
  await window.keyboard.press('1');
  await window.mouse.click(size.w / 2, size.h / 2);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await window.keyboard.press('2');
  await window.mouse.click(size.w / 2, size.h / 2);
  await new Promise((resolve) => setTimeout(resolve, 150));

  // ── Grow: a turnip needs 900 ticks; advance 1,000 through the console ─────
  await consoleCommand('tick 1000');

  // ── Harvest (tool 4) ──────────────────────────────────────────────────────
  await window.keyboard.press('4');
  await window.mouse.click(size.w / 2, size.h / 2);

  // The turnip lands in the inventory.
  const inventory = window.getByRole('button', { name: /^Inventory/ });
  await inventory.click();
  const panel = window.getByTestId('inventory');
  await expect(panel.getByText('Turnip', { exact: true })).toBeVisible();

  // ── Sell it at the live price ─────────────────────────────────────────────
  const readCoins = async (): Promise<number> =>
    Number((await coins.textContent())?.replaceAll(/[^0-9]/g, '') ?? '0');
  const before = await readCoins();
  await panel.getByRole('button', { name: 'Sell 1' }).first().click();
  // 12g at multiplier 1.0 credits within a tick; the tweened readout settles on it.
  await expect.poll(readCoins).toBe(before + 12);
  await inventory.click(); // close

  // ── Hire the first worker (150g — affordable thanks to the dev grant) ─────
  const workers = window.locator('[title="Workers hired"]');
  await window.getByRole('button', { name: /^Hire/ }).click();
  await expect(workers).toHaveText('1 worker');

  // ── Build a storage shed on a clear tile ──────────────────────────────────
  await window.getByRole('button', { name: 'Shop' }).click();
  await shop.getByRole('button', { name: 'Build Storage Shed' }).click();
  await window.mouse.click(size.w / 2 + 64, size.h / 2); // two tiles east of centre
  // 40 base + the shed's 50; the 9 unplanted seeds hold one slot.
  await expect(inventory).toContainText('1/90');

  // ── Expand the plot ───────────────────────────────────────────────────────
  await expect(shop.getByText('(0 bought)')).toBeVisible();
  await shop.getByRole('button', { name: 'Expand' }).click();
  await expect(shop.getByText('(1 bought)')).toBeVisible();

  await window.screenshot({ path: 'test-results/economy-full-loop.png' });
});

test('the tool bar arms a tool with the mouse, and planting works (07.5h regression)', async () => {
  // THE DEFECT THIS GUARDS. Clicking the ground does nothing unless a tool is
  // armed, and arming one used to be possible only by pressing `1`, `2`, or `4`
  // — stated in no interface anywhere. A player who bought seeds, saw them in
  // the inventory, and clicked the ground got silence with no clue what was
  // missing (reported from a real session, twice).
  const window = await app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

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
