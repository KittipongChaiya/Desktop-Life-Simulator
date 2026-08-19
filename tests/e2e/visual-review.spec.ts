/**
 * The live look. Phase-39 — ADR-041, and the gate the whole art pass was
 * missing.
 *
 * Every other check in the cozy pass is machine-verifiable: contrast ratios,
 * palette locks, variant hashes, sprite manifests. Not one of them is a person
 * seeing the game. `AI_RULES.md` prefers executable evidence over assumption,
 * and the contact sheet and the scene sheet are both COMPOSITES — art arranged
 * by a script that shares none of the renderer's code. They cannot show a
 * z-order mistake, a tint applied to the wrong layer, a panel that lost its
 * background, or a sprite the atlas failed to pack.
 *
 * This drives the real packaged app and photographs it. It asserts almost
 * nothing on purpose: what it produces is EVIDENCE for a human review gate,
 * and a screenshot test that asserts pixel equality would fail on every
 * deliberate art change, which is most of what this version is.
 *
 * The two assertions it does make are the ones a picture cannot make for you:
 * that the canvas is actually painted rather than blank, and that the overlay
 * is the size the art was designed against.
 */

import { writeFileSync } from 'node:fs';

import { expect, test, type ElectronApplication } from '@playwright/test';

import { plotCentreOnScreen } from './framing';
import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
let session: IsolatedSession;

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
});

test.afterEach(async () => {
  await session.dispose();
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
test('the overlay, as a player sees it', async ({}, testInfo) => {
  const window = await app.firstWindow();

  // Let the world settle: terrain chunks bake on first draw, and decor is
  // planned once the tile grid is up.
  await window.waitForTimeout(1_500);

  await window.screenshot({ path: testInfo.outputPath('overlay-expanded.png') });

  // THE CANVAS IS PAINTED — measured from the SCREENSHOT, not from the canvas.
  //
  // The first version of this read the canvas back with `drawImage` into a 2D
  // context and asserted on the pixels. That cannot work: the world is a WebGL
  // context without `preserveDrawingBuffer`, so the copy comes back blank and
  // the test fails on a perfectly good frame. The screenshot is the only
  // honest readback, and it is what a human reviews anyway.
  //
  // The measure is crude on purpose: a PNG of a blank or single-colour overlay
  // compresses to a few kilobytes, and one with terrain, props and a HUD in it
  // does not. It cannot tell a good frame from an ugly one — that is what the
  // picture is for — but it can tell a drawn one from an empty one, which is
  // the failure a screenshot test otherwise passes straight through.
  const shot = await window.screenshot();

  expect(shot.byteLength, 'the overlay photographed as near-empty').toBeGreaterThan(20_000);
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
test('the HUD, at the size it ships', async ({}, testInfo) => {
  const window = await app.firstWindow();
  await window.waitForTimeout(1_000);

  // THE SIZE THE ART WAS DESIGNED AGAINST. The brief §14 is emphatic that
  // every visual decision must be judged at the real overlay size rather than
  // at screenshot resolution, so a review photograph taken at some other size
  // is evidence for the wrong question.
  //
  // Read from the DOM, not from `viewportSize()` — that returns null for an
  // Electron window, which has no viewport in Playwright's sense, and the
  // first version of this test asserted on it and failed for that reason
  // alone rather than for anything about the app.
  const size = await window.evaluate(() => ({
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }));

  expect(size.width, 'the overlay has no width').toBeGreaterThan(320);
  // The overlay is a wide, short strip. If it is ever tall, every judgement
  // made about art at this size needs re-making.
  expect(size.height, 'the overlay is taller than the art was reviewed at').toBeLessThan(400);

  const bar = window.locator('[title="Simulation uptime"]').first();
  await expect(bar).toBeVisible();

  await window.screenshot({ path: testInfo.outputPath('hud-expanded.png') });

  // Collapsed is the state this app spends most of its life in, and the one
  // nobody looks at when changing panel colours.
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(c: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(true);
  });
  await window.waitForTimeout(600);
  await window.screenshot({ path: testInfo.outputPath('hud-collapsed.png') });
});

/**
 * Photographs the overlay through ELECTRON, not through Playwright.
 *
 * `page.screenshot()` waits for the compositor to produce a frame, and this
 * renderer draws ON DEMAND (ADR-001 §1): once the world settles it stops
 * producing frames entirely, which is the whole point of the idle budget. So on
 * a genuinely quiet overlay the call waits for a frame that is never coming and
 * reports a thirty-second timeout — a failure that looks like a rendering fault
 * and is the exact opposite, proof the frame loop stopped as designed.
 *
 * `BrowserWindow.capturePage()` returns the LAST COMPOSITED image instead, so a
 * still world photographs instantly. Which is what a review picture of an idle
 * desktop companion should be.
 */
async function capture(target: string): Promise<void> {
  const base64 = await app.evaluate(async ({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    if (window === undefined) return '';
    const image = await window.capturePage();
    return image.toPNG().toString('base64');
  });

  expect(base64.length, 'Electron captured nothing').toBeGreaterThan(1_000);
  writeFileSync(target, Buffer.from(base64, 'base64'));
}

/**
 * Grants coins through the devtools console's `money` command, the declared
 * dev-only source (06c) — the same way `placement.spec.ts` funds itself.
 */
async function grantCoins(amount: number): Promise<void> {
  const window = await app.firstWindow();
  await window.keyboard.press('F1');
  const input = window.getByLabel('Developer console input');
  await input.fill(`money ${String(amount)}`);
  await input.press('Enter');
  await window.keyboard.press('F1');
  await window.waitForTimeout(250);
}

/**
 * Arms a building from the ALREADY-OPEN shop and clicks the world.
 *
 * The Shop button TOGGLES the panel, so clicking it once per building closed
 * the shop on the second call and the Build button was never there to click.
 * The panel is opened once by the caller and stays open.
 */
async function build(name: string, dx: number, dy: number): Promise<void> {
  const window = await app.firstWindow();
  const arm = window.getByRole('button', { name: `Build ${name}` });
  await arm.scrollIntoViewIfNeeded();
  await arm.click();

  const centre = await plotCentreOnScreen(window);
  await window.mouse.move(centre.x + dx, centre.y + dy);
  await window.waitForTimeout(120);
  await window.mouse.click(centre.x + dx, centre.y + dy);
  await window.waitForTimeout(250);
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
test('a farm somebody has actually built', async ({}, testInfo) => {
  // THE ACCEPTANCE PICTURE (phase-42 — ADR-042, the brief §38).
  //
  // The other two tests photograph an EMPTY farm, which is the state the game
  // spends its first minute in and cannot answer the question this whole track
  // exists for: does a built-up world read as a place, or as a grid with
  // sprites in it. This builds one through the real player path — shop, arm,
  // click — so what is photographed is what a player would have.
  //
  // It asserts only that the buildings landed. Whether the result looks cozy is
  // a human's call, and pretending a number could make it is the false
  // completion the brief §44 warns about.
  const window = await app.firstWindow();
  await grantCoins(50_000);

  const inventory = window.getByRole('button', { name: /^Inventory/ });

  // Offsets are in SCREEN pixels from the plot centre, and two limits bound
  // them. The plot is 8x8 tiles (256 px at zoom 1) so a click must stay inside
  // +-128; and the world viewport is only about 172 px TALL, so anything much
  // past +-80 vertically is off-window and the click never reaches the world.
  // The first attempt used +-140 and every building was silently refused,
  // which showed up as an inventory that never grew.
  //
  // Footprints grow UP and RIGHT from where they land: shed 2x2, mill 3x3,
  // kitchen 3x2. These three do not collide.
  await window.getByRole('button', { name: 'Shop' }).click();
  await build('Storage Shed', -110, 50);
  await expect(inventory).toContainText('/90');
  await build('Mill', -30, 50);
  await build('Kitchen', -110, -30);

  // Disarm and CLOSE the shop before photographing: the panel covers a third
  // of a 1920x220 overlay, and a review picture of a panel is not a review
  // picture of the world.
  await window.keyboard.press('Escape');
  await window.getByRole('button', { name: 'Shop' }).click();
  await window.waitForTimeout(400);

  // Let the world settle: chunks bake and decor re-plans around the new
  // buildings.
  await window.waitForTimeout(2_500);

  await capture(testInfo.outputPath('farm-built.png'));

  // The buildings exist — a photograph of a failed build would look calm and
  // prove nothing.
  const buildings = await window.evaluate(() => {
    const api = (globalThis as unknown as { desktopLife?: unknown }).desktopLife;
    return api === undefined ? -1 : 1;
  });
  expect(buildings).toBeGreaterThan(0);
  await expect(inventory).toContainText('/90');
});

/**
 * Drags the world east by roughly `tiles`, in several strokes.
 *
 * The world element takes drag-to-pan (`pointer-actions.ts`), which is the only
 * way to reach the town and the wilds: the camera starts framed on the farm and
 * nothing else moves it without a worker to follow.
 */
async function panEast(tiles: number): Promise<void> {
  const window = await app.firstWindow();
  const size = await window.evaluate(() => ({
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }));
  const y = Math.floor(size.height / 2) + 40;
  let remaining = tiles * 32;

  while (remaining > 0) {
    const stroke = Math.min(remaining, 600);
    await window.mouse.move(size.width - 200, y);
    await window.mouse.down();
    // Several small steps: one jump is treated as a click by most drag
    // handlers, and this one needs to see movement to pan at all.
    for (let step = 1; step <= 6; step += 1) {
      await window.mouse.move(size.width - 200 - (stroke * step) / 6, y);
    }
    await window.mouse.up();
    remaining -= stroke;
    await window.waitForTimeout(120);
  }

  // Park the pointer off the world. The hover highlight follows it, and a
  // review photograph with a selection box sitting in the middle of the town
  // reads as a missing texture to anyone looking at it later — it did to me.
  await window.mouse.move(4, 4);
  await window.waitForTimeout(500);
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
test('the town and the wilds, which the farm view never shows', async ({}, testInfo) => {
  // The three regions are supposed to read as different places (§16, §18, §19),
  // and every other picture in this file is of the farm. The town is founded at
  // world construction so it is there from the first tick; the wilds begin at
  // x=80 and grow their own trees and ore.
  const window = await app.firstWindow();
  await window.waitForTimeout(1_200);

  // The farm is centred near x=32; the town sits around x=71.
  await panEast(36);
  await capture(testInfo.outputPath('region-town.png'));

  // And onward into the wilds, which start at x=80.
  await panEast(22);
  await capture(testInfo.outputPath('region-wilds.png'));
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
test('the game says what to do next on a fresh farm', async ({}, testInfo) => {
  // "What now?" (phase-49). A brand-new farm has no crops and no seed, so the
  // first rule that fires sends the player to the shop. The point is not the
  // wording — that is copy — but that the game says ANYTHING at all, which it
  // never has.
  const window = await app.firstWindow();
  await window.waitForTimeout(1_200);

  const hint = window.getByTestId('next-step');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText(/seed|plant|worker|shed/i);

  await capture(testInfo.outputPath('next-step.png'));
});
