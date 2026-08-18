/**
 * React root.
 *
 * Owns the UI tree only. The world canvas is a SIBLING in the DOM, not a child
 * (ADR-005 §1) — React never renders game entities and PixiJS never renders
 * controls.
 *
 * Hit-testing lives here because click-through depends on it. The DECISION
 * itself lives in `hit-test.ts` — this file only supplies the DOM half of the
 * question ("is the pointer over a `data-interactive` element?") and applies
 * the answer.
 *
 * That split was made in 07.5g, when asking only the DOM half turned out to be
 * the whole bug: the world is not a `data-interactive` element, so an expanded
 * overlay passed every click on a tile through to the desktop and the game
 * could not be played with a mouse at all.
 */

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import styles from './App.module.css';
import { shouldCaptureMouse } from './hit-test';
import { ActionNotice } from './hud/ActionNotice';
import { BoardPanel } from './hud/BoardPanel';
import { CompanionToast } from './hud/CompanionToast';
import { FactoryPanel } from './hud/FactoryPanel';
import { InventoryPanel } from './hud/InventoryPanel';
import { MapPanel } from './hud/MapPanel';
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
    // Whether the overlay KEEPS the mouse, by the `hit-test.ts` rule. The
    // controller de-duplicates, so pointer movement does not spam IPC.
    //
    // The rule is not "over a control": an expanded world is the interface,
    // and asking only about `data-interactive` is what made every click on a
    // tile go to the desktop instead of the game (07.5g).
    const apply = (overInteractiveElement: boolean): void => {
      overlay.setPointerOverUi(shouldCaptureMouse({ overInteractiveElement, collapsed, workMode }));
    };

    const onPointerMove = (event: PointerEvent): void => {
      const target = event.target;
      apply(target instanceof Element && target.closest('[data-interactive]') !== null);
    };

    // The pointer has left the window entirely: nothing here wants the mouse,
    // whatever mode the overlay is in.
    const onPointerLeave = (): void => {
      overlay.setPointerOverUi(false);
    };

    // Collapsing, expanding, or toggling work mode changes the answer for a
    // pointer that has not moved. Without this, collapsing while hovering the
    // world would leave the overlay holding the mouse over a status bar.
    apply(false);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [overlay, collapsed, workMode]);

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
          {/* The panel toggles live IN the bar (07.9). They used to float over
              it on their own absolute coordinates and collided — the worker
              container overlapped the shop toggle, and all four sat on top of
              the bar. As flex items in a row they cannot, and each reserves its
              panel's width so two open panels cannot reach each other either.

              The collapse rule stays here rather than moving into the bar: the
              bar shows in BOTH presence modes, the panels only when expanded
              (ADR-001 §2 — collapsed is a status bar, not a game board). */}
          <StatusBar>
            {!collapsed && (
              <>
                <WorkerPanel />
                <ShopPanel />
                <BoardPanel />
                <MapPanel />
                <FactoryPanel />
                <InventoryPanel />
                <SettingsPanel />
              </>
            )}
          </StatusBar>
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

      {/* Why the last action was refused (07.5i). Before this, a rejected
          click produced only a brief tile outline and read as a dead click. */}
      <ActionNotice />

      {/* The selected-worker panel. Still floating rather than a bar slot: it
          has no toggle — it appears when a worker is selected and goes when the
          selection clears — so there is nothing to host in the bar. */}
      {!collapsed && !workMode && <WorkerInfo />}

      {/* The return summary sits OUTSIDE the work-mode gate deliberately: its
          mode rule is different from the HUD's. The HUD is hidden and gone;
          the summary DEFERS (ADR-014 — "a summary suppressed by a hidden HUD
          must defer, not vanish"), which only the component and its controller
          can express, so they own that decision rather than this gate. */}
      {!collapsed && <ReturnSummary />}
    </div>
  );
}
