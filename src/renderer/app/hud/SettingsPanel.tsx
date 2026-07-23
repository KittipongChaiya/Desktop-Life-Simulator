/**
 * Settings panel. Phase-01.8a — the Desktop Companion section (ADR-014).
 *
 * Opacity is an application preference, not game state: the slider talks to
 * the companion controller (main-process IPC), never to a slice or a command —
 * the one panel whose writes do not go through the dispatcher, because nothing
 * here touches the world (ADR-014 §3).
 *
 * The shortcut reference documents the three global hotkeys (ADR-014 §5).
 * Their handlers live in the main process; this list is the player's map to
 * them, kept minimal per the directive.
 */

import { useState, useSyncExternalStore, type ReactNode } from 'react';

import {
  OPACITY_MAX_PERCENT,
  OPACITY_MIN_PERCENT,
  OPACITY_STEP_PERCENT,
} from '../../../shared/constants';
import { DEFAULT_BINDINGS, SHORTCUT_ACTIONS, ShortcutAction } from '../../../shared/shortcuts';
import { useCompanion } from '../store-context';

import styles from './SettingsPanel.module.css';

/**
 * Display names for the stable action identifiers. The KEYS come from the
 * one bindings table (`shared/shortcuts.ts`, fix/0.1/1.8a.md) — this panel
 * never states a physical key itself, so a future rebind shows up here for
 * free once the configuration source changes.
 */
const ACTION_LABELS: Readonly<Record<ShortcutAction, string>> = {
  [ShortcutAction.WorkMode]: 'Work mode',
  [ShortcutAction.QuickHide]: 'Quick hide',
  [ShortcutAction.ClickThrough]: 'Click-through',
};

export function SettingsPanel(): ReactNode {
  const companion = useCompanion();
  const [open, setOpen] = useState(false);

  const opacity = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.opacityPercent(),
    () => companion.opacityPercent(),
  );

  return (
    <div className={styles['container']} data-interactive data-testid="settings">
      <button
        type="button"
        className={styles['toggle']}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Settings
      </button>

      {open && (
        <div className={styles['panel']}>
          <div className={styles['section']}>Desktop Companion</div>
          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="companion-opacity">
              Opacity
            </label>
            <input
              id="companion-opacity"
              className={styles['slider']}
              type="range"
              min={OPACITY_MIN_PERCENT}
              max={OPACITY_MAX_PERCENT}
              step={OPACITY_STEP_PERCENT}
              value={opacity}
              onChange={(event) => {
                companion.setOpacityPercent(Number(event.target.value));
              }}
            />
            <span className={styles['value']}>{opacity}%</span>
          </div>

          <div className={styles['section']}>Shortcuts</div>
          {SHORTCUT_ACTIONS.map((action) => (
            <div key={action} className={styles['row']}>
              <span className={styles['name']}>{ACTION_LABELS[action]}</span>
              <kbd className={styles['keys']}>{DEFAULT_BINDINGS[action]}</kbd>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
