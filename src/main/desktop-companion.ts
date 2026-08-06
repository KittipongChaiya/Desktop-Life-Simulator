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
 * Re-attaches the render widget to the window, by changing its geometry and
 * changing it straight back.
 *
 * THE BUG THIS FIXES (07.9). On Windows, `hide()` tears down the render
 * widget's child window — the `Chrome_RenderWidgetHostHWND` that actually owns
 * hit-testing inside the frame — and `showInactive()` does not recreate it.
 * After one quick-hide round trip the overlay came back looking perfect and was
 * completely unusable: it painted, the world animated, the simulation ticked,
 * and forwarded mouse MOVES still reached the renderer, so nothing looked
 * broken. But `WM_LBUTTONDOWN` arrived at a top-level window with no widget
 * beneath it to route to, so no press ever became a click. Every button in the
 * HUD was dead, permanently, with the tray the only way out.
 *
 * A real size change is the only thing that brings the widget back. Six other
 * repairs were measured against a live window and every one of them left it
 * dead: re-applying the mouse state, always-on-top, focusable, `moveTop`,
 * `webContents.invalidate`, a second `showInactive`, and even a focus-stealing
 * `show`. `setBounds` to the SAME rectangle is a no-op and does not work
 * either, and `setSize` does nothing at all because the window is not
 * resizable — it has to be `setBounds` with a genuinely different height.
 *
 * BEFORE the window is shown, deliberately: the poke happens while it is still
 * hidden, so the intermediate height is never on screen and the restore has no
 * flicker. The rectangle is put back the way it was found, which keeps
 * ADR-014 §2's "restoration is exact by construction" literally true.
 */
function reattachRenderWidget(window: BrowserWindow): void {
  const bounds = window.getBounds();
  window.setBounds({ ...bounds, height: bounds.height - 1 });
  window.setBounds(bounds);
}

/**
 * Quick hide / restore (fix/0.1/1.8.md §2). Hiding changes no other state —
 * not opacity, not position, not mode — so restoration is exact by
 * construction rather than by bookkeeping (ADR-014 §2). `showInactive`, never
 * `show`: restoring must not steal focus any more than launching does.
 *
 * The restore leg is not the bare `showInactive()` it reads as: see
 * `reattachRenderWidget` for the one thing `showInactive` does not do.
 */
export function applyHidden(window: BrowserWindow, hidden: boolean): void {
  if (window.isDestroyed()) return;
  if (hidden) {
    window.hide();
    return;
  }

  reattachRenderWidget(window);
  window.showInactive();
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
