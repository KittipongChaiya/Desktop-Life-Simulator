/**
 * Desktop-companion window operations. Phase-01.8 (ADR-014).
 *
 * Platform only: the simulation never learns any of this exists (ADR-014 §3).
 * State lives in `index.ts` beside the collapse flag; this module owns the
 * window calls — the same split `overlay-window.ts` uses. 01.8b adds quick
 * hide and the click-through override here; 01.8c adds work mode's HUD
 * broadcast and the z-order push.
 */

import type { BrowserWindow } from 'electron';

import { effectiveOpacityPercent, type UiSettings } from './settings-schema';

/**
 * Applies the preference-derived opacity to the window. Instant — no
 * animation, no debounce: the slider change IS the window change (`fix/0.1/
 * 1.8.md` acceptance 1). Precedence (work mode over slider) is the schema's
 * rule, not this module's.
 */
export function applyOpacity(window: BrowserWindow, settings: UiSettings): void {
  if (window.isDestroyed()) return;
  window.setOpacity(effectiveOpacityPercent(settings) / 100);
}
