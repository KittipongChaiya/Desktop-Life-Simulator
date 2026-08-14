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
import {
  MOTION_INTENSITY_MAX_PERCENT,
  MOTION_INTENSITY_MIN_PERCENT,
  MOTION_INTENSITY_STEP_PERCENT,
} from '../../../shared/motion';
import { DEFAULT_BINDINGS, SHORTCUT_ACTIONS, ShortcutAction } from '../../../shared/shortcuts';
import type { SaveState } from '../save-controller';
import { sourceReport } from '../source-report';
import { useCompanion, usePlayer, useSave, useUpdate } from '../store-context';

import styles from './SettingsPanel.module.css';
import { SourcesSection } from './SourcesSection';

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
  const player = usePlayer();
  const update = useUpdate();

  // Mirrors `world.disabledSources` for the controls above. Seeded from the
  // set this session LOADED with, so a source switched off in an earlier
  // session shows as off — and updated from accepted commands after that.
  //
  // A snapshot slice would be the orthodox source, but nothing else mutates
  // this set: it is written only by `setSourceEnabled`, and every acceptance
  // is applied below. Adding a slice to publish a value with one writer is
  // machinery for an imagined need (`AI_RULES.md` §1.5).
  const [disabledSources, setDisabledSources] = useState<ReadonlySet<string>>(
    () => new Set(sourceReport().disabled),
  );
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

  // The STORED settings, not the resolved ones: these controls edit what the
  // player chose, and must keep showing it while work mode or Reduced Motion
  // temporarily overrides the effect (ADR-017 §7 — override without erasure).
  const motion = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.storedMotion(),
    () => companion.storedMotion(),
  );

  // ADR-023 §5 condition 1: a fresh profile is silent and STAYS silent after
  // unmuting, until the player asks for ambience specifically. This dial is
  // that asking — until it existed the level could only be changed by hand
  // editing settings.json, which is not an affordance.
  const ambience = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.categoryPercent('ambient'),
    () => companion.categoryPercent('ambient'),
  );

  const muted = useSyncExternalStore(
    (listener) => companion.subscribe(listener),
    () => companion.muted(),
    () => companion.muted(),
  );

  const currentVersion = useSyncExternalStore(
    (listener) => update.subscribe(listener),
    () => update.currentVersion(),
    () => update.currentVersion(),
  );

  const pinnedVersion = useSyncExternalStore(
    (listener) => update.subscribe(listener),
    () => update.pinnedVersion(),
    () => update.pinnedVersion(),
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
          <SourcesSection
            report={sourceReport()}
            disabled={disabledSources}
            onSetEnabled={(source, enabled) => {
              // A command, not a state write (ADR-010 §1). The dispatcher
              // validates it and may refuse — an unknown source, or core.
              const result = player.submit({ type: 'setSourceEnabled', source, enabled });

              // The control follows the WORLD, not the click: a refused command
              // leaves the box where it was, rather than showing a change that
              // did not happen.
              if (!result.ok) return;

              setDisabledSources((previous) => {
                const next = new Set(previous);
                if (enabled) next.delete(source);
                else next.add(source);
                return next;
              });
            }}
          />

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

          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="companion-ambience">
              Ambience
            </label>
            <input
              id="companion-ambience"
              className={styles['slider']}
              type="range"
              min={VOLUME_MIN_PERCENT}
              max={VOLUME_MAX_PERCENT}
              step={VOLUME_STEP_PERCENT}
              value={ambience}
              disabled={muted}
              title="Weather you can hear. Off by default; stops when you look away."
              onChange={(event) => {
                companion.setCategoryPercent('ambient', Number(event.target.value));
              }}
            />
            <span className={styles['value']}>{ambience}%</span>
          </div>
          <div className={styles['hint']}>
            Rain you can hear while you are watching. Off by default, and it stops on its own when
            you are away.
          </div>

          {/* ACCESSIBILITY (07.7L). Every control here is a PRESENTATION
              preference: none of them changes a tick, a save, or a replay, so
              two players with opposite settings still have identical farms
              (ADR-017 §7). The six existed and gated real effects from 07.7a
              onward — until now nothing in the app could reach them, and a
              player could only change them by hand-editing settings.json. */}
          <div className={styles['section']}>Accessibility</div>

          {/* Reduced Motion sits FIRST and disables the rest, because it is a
              master switch rather than a seventh option. It overrides without
              overwriting: the five controls below keep their stored values and
              come back exactly as they were when it is cleared. */}
          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="motion-reduced">
              Reduced motion
            </label>
            <button
              id="motion-reduced"
              type="button"
              className={styles['action']}
              aria-pressed={motion.reducedMotion}
              title="Stops all animation. Overrides the settings below without erasing them."
              onClick={() => {
                companion.setMotion({ reducedMotion: !motion.reducedMotion });
              }}
            >
              {motion.reducedMotion ? 'On' : 'Off'}
            </button>
          </div>
          <div className={styles['hint']}>
            Stops every animation at once. Your other choices are kept.
          </div>

          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="motion-intensity">
              Animation
            </label>
            <input
              id="motion-intensity"
              className={styles['slider']}
              type="range"
              min={MOTION_INTENSITY_MIN_PERCENT}
              max={MOTION_INTENSITY_MAX_PERCENT}
              step={MOTION_INTENSITY_STEP_PERCENT}
              value={motion.intensityPercent}
              disabled={motion.reducedMotion}
              title="How much movement each effect carries. 0% leaves everything still."
              onChange={(event) => {
                companion.setMotion({ intensityPercent: Number(event.target.value) });
              }}
            />
            <span className={styles['value']}>{motion.intensityPercent}%</span>
          </div>
          <div className={styles['hint']}>How far things move when they react. 0% is still.</div>

          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="motion-particles">
              Particles
            </label>
            <button
              id="motion-particles"
              type="button"
              className={styles['action']}
              aria-pressed={motion.particles}
              disabled={motion.reducedMotion}
              title="Dust, leaves, sparkles, and coin bursts."
              onClick={() => {
                companion.setMotion({ particles: !motion.particles });
              }}
            >
              {motion.particles ? 'On' : 'Off'}
            </button>
          </div>
          <div className={styles['hint']}>Dust when you till, leaves when you harvest.</div>

          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="motion-shake">
              Camera shake
            </label>
            <button
              id="motion-shake"
              type="button"
              className={styles['action']}
              aria-pressed={motion.cameraShake}
              disabled={motion.reducedMotion}
              title="A brief rattle on a large harvest or a placed building. Off by default."
              onClick={() => {
                companion.setMotion({ cameraShake: !motion.cameraShake });
              }}
            >
              {motion.cameraShake ? 'On' : 'Off'}
            </button>
          </div>
          <div className={styles['hint']}>A short rattle on big moments. Off by default.</div>

          {/* The two UNBOUNDED settings. Both are off by default and say so:
              they never finish, so they keep the renderer drawing for as long
              as they are on and someone is watching (ADR-017 §2). */}
          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="motion-ambient">
              Ambient animation
            </label>
            <button
              id="motion-ambient"
              type="button"
              className={styles['action']}
              aria-pressed={motion.environmental}
              disabled={motion.reducedMotion}
              title="Plants sway while you are looking. Stops on its own when you are away, and never runs in work mode."
              onClick={() => {
                companion.setMotion({ environmental: !motion.environmental });
              }}
            >
              {motion.environmental ? 'On' : 'Off'}
            </button>
          </div>
          <div className={styles['hint']}>
            Plants sway while you watch. Uses a little power; stops when you are away.
          </div>

          <div className={styles['row']}>
            <label className={styles['name']} htmlFor="motion-creatures">
              Living details
            </label>
            <button
              id="motion-creatures"
              type="button"
              className={styles['action']}
              aria-pressed={motion.decorativeCreatures}
              disabled={motion.reducedMotion}
              title="Workers breathe and fidget when idle. Uses a little power while you are watching."
              onClick={() => {
                companion.setMotion({ decorativeCreatures: !motion.decorativeCreatures });
              }}
            >
              {motion.decorativeCreatures ? 'On' : 'Off'}
            </button>
          </div>
          <div className={styles['hint']}>Workers breathe and stretch when they have a moment.</div>

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

          {/* Updating (15, ADR-025 §6). The pin is a preference exactly like
              the ones above and lives with them — but it is the only control
              here that waits for main: `UNKNOWN_VERSION` is the empty string,
              and a panel that rendered "Version" beside nothing for a frame
              would be reporting a fact it does not have yet. */}
          {currentVersion !== '' && (
            <div data-testid="update-section">
              <div className={styles['section']}>Updates</div>
              <div className={styles['row']}>
                <span className={styles['name']}>Version</span>
                <span className={styles['value']}>{currentVersion}</span>
              </div>

              {/* A button, not a text field. ADR-025 §6 pins a VERSION, and
                  §5's other half is that a player protecting a working farm is
                  saying "not past here" — the version they mean is the one they
                  are on. A free-text box would invite exactly the unparseable
                  pin `update-policy.ts` has to hold on, from the one person
                  least able to tell it went wrong. */}
              <div className={styles['row']}>
                <label className={styles['name']} htmlFor="update-pin">
                  Stay on this version
                </label>
                <button
                  id="update-pin"
                  type="button"
                  className={styles['action']}
                  aria-pressed={pinnedVersion !== null}
                  title="Holds you at this version. Updates resume when you turn it off."
                  onClick={() => {
                    update.setPinnedVersion(pinnedVersion === null ? currentVersion : null);
                  }}
                >
                  {pinnedVersion === null ? 'Off' : 'On'}
                </button>
              </div>
              <div className={styles['hint']}>
                {pinnedVersion === null || pinnedVersion === currentVersion
                  ? 'You will not be moved past the version you are on.'
                  : // A pin is a CEILING, not a freeze. This control can only
                    // ever set it to the running version, so a pin ahead of the
                    // build came from somewhere else — a hand-edited
                    // settings.json, or a rollback — and an unexplained "On"
                    // would misdescribe what is actually holding.
                    `Held at ${pinnedVersion}. Anything up to that version may still install.`}
              </div>
            </div>
          )}

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
