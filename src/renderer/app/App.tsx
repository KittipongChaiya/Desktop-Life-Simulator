/**
 * React root.
 *
 * Owns the UI tree only. The world canvas is a SIBLING in the DOM, not a child
 * (ADR-005 §1) — React never renders game entities and PixiJS never renders
 * controls.
 *
 * Hit-testing lives here because click-through depends on it: the overlay must
 * pass clicks through to whatever is underneath EXCEPT over real controls. The
 * root is pointer-transparent; individual controls opt back in via CSS.
 */

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import styles from './App.module.css';
import { CompanionToast } from './hud/CompanionToast';
import { InventoryPanel } from './hud/InventoryPanel';
import { SettingsPanel } from './hud/SettingsPanel';
import { ShopPanel } from './hud/ShopPanel';
import { StatusBar } from './hud/StatusBar';
import { WorkerInfo } from './hud/WorkerInfo';
import { WorkerPanel } from './hud/WorkerPanel';
import { useOverlay } from './store-context';

export function App(): ReactNode {
  const overlay = useOverlay();

  const collapsed = useSyncExternalStore(
    (listener) => overlay.subscribe(listener),
    () => overlay.isCollapsed(),
    () => overlay.isCollapsed(),
  );

  useEffect(() => {
    // Report whether the pointer sits over interactive UI. The controller
    // de-duplicates, so pointer movement does not spam IPC.
    const onPointerMove = (event: PointerEvent): void => {
      const target = event.target;
      const overUi = target instanceof Element && target.closest('[data-interactive]') !== null;
      overlay.setPointerOverUi(overUi);
    };

    const onPointerLeave = (): void => {
      overlay.setPointerOverUi(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [overlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Space toggles collapse (GAME_DESIGN.md §8.3).
      //
      // Ignored whenever focus is in an editable field or on a control:
      // otherwise a space typed into the developer console (or any future text
      // input) collapses the overlay and never reaches the field. Found by
      // driving the real console — `tick 40` arrived as `tick40`.
      if (event.code !== 'Space') return;

      const active = document.activeElement;
      const isEditable =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active instanceof HTMLButtonElement ||
        (active instanceof HTMLElement && active.isContentEditable);

      if (isEditable) return;

      event.preventDefault();
      overlay.toggle();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [overlay]);

  return (
    <div className={styles['root']} data-collapsed={collapsed}>
      <div className={styles['statusBar']} data-interactive>
        <StatusBar />
      </div>

      {/* Companion toasts show in BOTH presence modes — a mode confirmation
          must reach the player whether the world is up or collapsed. */}
      <CompanionToast />

      {/* The worker panel (count, hire, list), the shop, the selected-worker
          panel, the inventory, and settings show over the world when expanded. */}
      {!collapsed && (
        <>
          <WorkerPanel />
          <ShopPanel />
          <WorkerInfo />
          <InventoryPanel />
          <SettingsPanel />
        </>
      )}
    </div>
  );
}
