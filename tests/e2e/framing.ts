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
