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
import { ReturnSummary } from './hud/ReturnSummary';
import { SaveNotice } from './hud/SaveNotice';
import { SettingsPanel } from './hud/SettingsPanel';
import { ShopPanel } from './hud/ShopPanel';
import { StatusBar } from './hud/StatusBar';
import { WorkerInfo } from './hud/WorkerInfo';
import { WorkerPanel } from './hud/WorkerPanel';
import { Sound } from './sounds';
import { useCompanion, useOverlay, useSound } from './store-context';

export function App(): ReactNode {
  const overlay = useOverlay();
  const companion = useCompanion();
  const sound = useSound();

  const collapsed = useSyncExternalStore(
    (listener) => overlay.subscribe(listener),
    () => overlay.isCollapsed(),
    () => overlay.isCollapsed(),
  );

  // Work mode strips React entirely (fix/0.1/1.8.md §5): the world is PixiJS,
  // so keeping "world, workers, crops, buildings" means this tree's job is to
  // get out of the way — fewer mounted components, structurally fewer commits.
  const workMode = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.workMode(),
    () => companion.workMode(),
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
    // ONE delegated listener rather than a sound call in every button (07.5a).
    // Buttons are added by every future panel, and a per-button call is a
    // rule that gets forgotten; this cannot be. Bubble phase, so a handler
    // that stops propagation has genuinely opted out.
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('button') !== null) {
        sound.play(Sound.UiClick);
      }
    };

    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('click', onClick);
    };
  }, [sound]);

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
    <div className={styles['root']} data-collapsed={collapsed} data-testid="app-root">
      {/* The status bar is HUD too: work mode hides it with everything else.
          The exits stay reachable — F11 is global, and the tray never leaves. */}
      {!workMode && (
        <div className={styles['statusBar']} data-interactive>
          <StatusBar />
        </div>
      )}

      {/* Companion toasts show in EVERY presence mode — a mode confirmation
          must reach the player whether the world is up, collapsed, or muted
          (resolved interpretation 6: the work-mode toast itself still shows). */}
      <CompanionToast />

      {/* A save failure shows in EVERY presence mode, work mode included
          (07e, `SAVE_FORMAT.md` §7.3): withholding "your game is not being
          saved" to keep the desktop quiet is not quiet, it is misleading. */}
      <SaveNotice />

      {/* The worker panel (count, hire, list), the shop, the selected-worker
          panel, the inventory, and settings show over the world when expanded. */}
      {!collapsed && !workMode && (
        <>
          <WorkerPanel />
          <ShopPanel />
          <WorkerInfo />
          <InventoryPanel />
          <SettingsPanel />
        </>
      )}

      {/* The return summary sits OUTSIDE the work-mode gate deliberately: its
          mode rule is different from the HUD's. The HUD is hidden and gone;
          the summary DEFERS (ADR-014 — "a summary suppressed by a hidden HUD
          must defer, not vanish"), which only the component and its controller
          can express, so they own that decision rather than this gate. */}
      {!collapsed && <ReturnSummary />}
    </div>
  );
}
