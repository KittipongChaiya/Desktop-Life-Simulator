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
import { StatusBar } from './hud/StatusBar';
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
      // Space toggles collapse (GAME_DESIGN.md §8.3). Ignored while a control
      // has focus so it does not hijack the button it is meant to activate.
      if (event.code !== 'Space') return;
      if (document.activeElement instanceof HTMLButtonElement) return;

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

      {/*
        Expanded content (world view, panels) arrives in phase-02 and phase-05.
        Deliberately absent rather than stubbed — AI_RULES.md §1.6.
      */}
    </div>
  );
}
