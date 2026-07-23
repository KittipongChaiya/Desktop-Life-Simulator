/**
 * The full economic loop, end to end. Phase-06e.
 *
 * Drives the REAL app through every stage the phase built: buy seeds → plant →
 * grow (console-accelerated) → harvest → sell → hire → build → expand. Each
 * step travels the ordinary player command path; the assertions read the same
 * HUD the player does. This is the loop `GAME_DESIGN.md` §1's diagram draws,
 * exercised as one continuous session.
 */

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let app: ElectronApplication;

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
  app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  // Fund the session through the declared dev source — the loop's MECHANICS
  // are the subject here; pacing belongs to the 06f playthrough.
  await consoleCommand('money 5000');
});

test.afterEach(async () => {
  await app.close();
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
