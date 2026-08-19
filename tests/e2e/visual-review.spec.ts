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

import { expect, test, type ElectronApplication } from '@playwright/test';

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
