import { writeFileSync } from 'node:fs';

import type { ElectronApplication } from '@playwright/test';

/**
 * Where the camera frames the owned plot, on screen. Phase-07.9.
 *
 * The plot centre is NOT the viewport centre. The overlay's top strip is the
 * opaque status bar, and a tile under it cannot be clicked at all — the HUD
 * takes the press first — so the camera centres on the band BELOW the bar
 * (`camera.ts`, `viewportTopInset`).
 *
 * Expressed once, here, because three specs need to click the plot centre and
 * each previously hardcoded `size.h / 2` with a comment asserting the old rule.
 * A shared derivation means the next framing change breaks one line, not three
 * specs that quietly click the wrong tile.
 */

import type { Page } from '@playwright/test';

import { OVERLAY_HEIGHT_COLLAPSED } from '../../src/shared/constants';

/** Screen point the owned plot's centre is framed at. */
export async function plotCentreOnScreen(window: Page): Promise<{ x: number; y: number }> {
  const size = await window.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  return { x: size.w / 2, y: (size.h + OVERLAY_HEIGHT_COLLAPSED) / 2 };
}

/**
 * Photographs the overlay through ELECTRON rather than through Playwright.
 *
 * `page.screenshot()` waits for the compositor to produce a frame, and this
 * renderer draws ON DEMAND (ADR-001 §1): once the world settles it stops
 * producing frames at all, which is the entire point of the idle budget. So on
 * a quiet overlay the call waits thirty seconds for a frame that is never
 * coming and reports a timeout that looks like a rendering fault while being
 * the exact opposite — proof the frame loop stopped as designed.
 *
 * `BrowserWindow.capturePage()` returns the LAST COMPOSITED image instead, so a
 * still world photographs instantly. Diagnostic screenshots should use this.
 */
export async function shoot(app: ElectronApplication, target: string): Promise<void> {
  const base64 = await app.evaluate(async ({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    if (window === undefined) return '';
    const image = await window.capturePage();
    return image.toPNG().toString('base64');
  });

  if (base64.length > 0) writeFileSync(target, Buffer.from(base64, 'base64'));
}
