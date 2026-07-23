/**
 * Desktop-companion window operations. Phase-01.8 (ADR-014).
 *
 * Platform only: the simulation never learns any of this exists (ADR-014 §3).
 * State lives in `index.ts` beside the collapse flag; this module owns the
 * window calls — the same split `overlay-window.ts` uses. 01.8b adds quick
 * hide and the click-through override here; 01.8c adds work mode's HUD
 * broadcast and the z-order push.
 */

import { globalShortcut, type BrowserWindow } from 'electron';

import { effectiveOpacityPercent, type DesktopSettings } from './settings-schema';
import type { ShortcutRegistrar } from './shortcut-manager';

/**
 * Applies the preference-derived opacity to the window. Instant — no
 * animation, no debounce: the slider change IS the window change (`fix/0.1/
 * 1.8.md` acceptance 1). Precedence (work mode over slider) is the schema's
 * rule, not this module's.
 */
export function applyOpacity(window: BrowserWindow, desktop: DesktopSettings): void {
  if (window.isDestroyed()) return;
  window.setOpacity(effectiveOpacityPercent(desktop) / 100);
}

/**
 * Quick hide / restore (fix/0.1/1.8.md §2). `hide()`/`showInactive()` and
 * NOTHING else: hiding changes no other state — not opacity, not position,
 * not mode — so restoration is exact by construction rather than by
 * bookkeeping (ADR-014 §2). `showInactive`, never `show`: restoring must not
 * steal focus any more than launching does.
 */
export function applyHidden(window: BrowserWindow, hidden: boolean): void {
  if (window.isDestroyed()) return;
  if (hidden) {
    window.hide();
  } else {
    window.showInactive();
  }
}

/**
 * The electron half of the shortcut manager (fix/0.1/1.8a.md): the manager
 * itself is pure and holds the resolution rules; this is the one adapter that
 * touches `globalShortcut`. 01.8b's wiring injects it with the real handlers.
 */
export const globalShortcutRegistrar: ShortcutRegistrar = {
  register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
  unregisterAll: () => {
    globalShortcut.unregisterAll();
  },
};
