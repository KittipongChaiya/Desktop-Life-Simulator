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
  VOLUME_MAX_PERCENT,
  VOLUME_MIN_PERCENT,
  VOLUME_STEP_PERCENT,
} from '../../../shared/constants';
import { DEFAULT_BINDINGS, SHORTCUT_ACTIONS, ShortcutAction } from '../../../shared/shortcuts';
import type { SaveState } from '../save-controller';
import { useCompanion, useSave } from '../store-context';

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

/**
 * The manual save button's own label. The failure case deliberately does NOT
 * appear here — a failure gets the `SaveNotice`, which carries the path and
 * does not vanish when the panel is closed.
 */
const SAVE_LABELS: Readonly<Record<SaveState, string>> = {
  idle: 'Save now',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Save now',
};

export function SettingsPanel(): ReactNode {
  const companion = useCompanion();
  const save = useSave();
  const [open, setOpen] = useState(false);

  const opacity = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.opacityPercent(),
    () => companion.opacityPercent(),
  );

  const saveState = useSyncExternalStore(
    (listener) => save.subscribe(listener),
    () => save.status().state,
    () => save.status().state,
  );

  const volume = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.volumePercent(),
    () => companion.volumePercent(),
  );

  const muted = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.muted(),
    () => companion.muted(),
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

          {/* Sound (07.5a, ADR-016). The audible presence dial, sitting with
              the visual one because they are the same kind of decision: how
              much of your attention this thing may take. Muted by default —
              an overlay that starts making noise unasked is the most
              intrusive thing this product could do (`VISION.md` §5.1). */}
          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="companion-volume">
              Sound
            </label>
            <input
              id="companion-volume"
              className={styles['slider']}
              type="range"
              min={VOLUME_MIN_PERCENT}
              max={VOLUME_MAX_PERCENT}
              step={VOLUME_STEP_PERCENT}
              value={volume}
              disabled={muted}
              onChange={(event) => {
                companion.setVolumePercent(Number(event.target.value));
              }}
            />
            <button
              type="button"
              className={styles['action']}
              aria-pressed={muted}
              // The label states the CURRENT state rather than the action, so
              // a screen reader and a glance agree with `aria-pressed`.
              title={muted ? 'Sound is off' : 'Sound is on'}
              onClick={() => {
                companion.toggleMuted();
              }}
            >
              {muted ? 'Off' : 'On'}
            </button>
          </div>

          {/* Manual save (`SAVE_FORMAT.md` §7.2, the last trigger). It rides
              the SAME controller every automatic trigger uses — one
              serialization site, one coalescing rule, no privileged path. */}
          <div className={styles['section']}>Game</div>
          <div className={styles['row']}>
            <span className={styles['name']}>Save</span>
            <button
              type="button"
              className={styles['action']}
              onClick={() => {
                save.requestSave();
              }}
            >
              {SAVE_LABELS[saveState]}
            </button>
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
