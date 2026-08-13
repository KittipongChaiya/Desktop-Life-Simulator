/**
 * @vitest-environment jsdom
 *
 * The settings panel: the Desktop Companion section. Phase-01.8a (ADR-014).
 *
 * Opacity is an app preference, not game state — so unlike the economy panels
 * these tests assert a bridge conversation, not a command stream: the slider
 * renders the shared dial bounds, hydrates from main, and every change goes to
 * `setOpacity` while the readout answers instantly.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OPACITY_MAX_PERCENT,
  OPACITY_DEFAULT_PERCENT,
  OPACITY_MIN_PERCENT,
  OPACITY_STEP_PERCENT,
} from '../../../shared/constants';
import type { UpdateState } from '../../../shared/ipc/contract';
import {
  DEFAULT_MOTION_SETTINGS,
  MOTION_INTENSITY_MAX_PERCENT,
  MOTION_INTENSITY_MIN_PERCENT,
  MOTION_INTENSITY_STEP_PERCENT,
  type MotionSettings,
} from '../../../shared/motion';
import { createActionFeedback } from '../action-feedback';
import { createCompanionController, type CompanionBridge } from '../companion-controller';
import { createSaveController } from '../save-controller';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';
import { createUpdateController, type UpdateBridge } from '../update-controller';

import { SettingsPanel } from './SettingsPanel';

interface Harness {
  readonly setOpacityCalls: number[];
  /** Writes the manual save button actually caused. */
  readonly saveWrites: () => number;
  /** Volume values the dial pushed to main (07.5a). */
  readonly setVolumeCalls: number[];
  readonly muteToggles: () => number;
  /** Motion patches the accessibility controls pushed to main (07.7L). */
  readonly setMotionCalls: Partial<MotionSettings>[];
  /** Pins the control pushed to main (15, ADR-025 §6). */
  readonly pinCalls: (string | null)[];
}

const RUNNING: UpdateState = { currentVersion: '0.2.0', pinnedVersion: null };

function mount(
  initial = {
    opacityPercent: 100,
    workMode: false,
    clickThrough: false,
    hidden: false,
    volumePercent: 60,
    muted: true,
    motion: DEFAULT_MOTION_SETTINGS,
  },
  update: UpdateState = RUNNING,
): Harness {
  const setOpacityCalls: number[] = [];
  const pinCalls: (string | null)[] = [];
  const setVolumeCalls: number[] = [];
  const setMotionCalls: Partial<MotionSettings>[] = [];
  let muteToggles = 0;
  // A real save controller over a counting write: the button must reach the
  // ONE save path, not a shortcut of its own (07e).
  let saveWrites = 0;
  const save = createSaveController({
    write: () => {
      saveWrites += 1;
      return Promise.resolve({ ok: true });
    },
    defer: (run) => run(),
  });
  const bridge: CompanionBridge = {
    setOpacity(percent) {
      setOpacityCalls.push(percent);
      return Promise.resolve({ ...initial, opacityPercent: percent });
    },
    setVolume(percent) {
      setVolumeCalls.push(percent);
      return Promise.resolve({ ...initial, volumePercent: percent });
    },
    toggleMuted() {
      muteToggles += 1;
      return Promise.resolve({ ...initial, muted: !initial.muted });
    },
    setMotion(patch) {
      setMotionCalls.push(patch);
      return Promise.resolve({ ...initial, motion: { ...initial.motion, ...patch } });
    },
    getState: () => Promise.resolve(initial),
    onStateChanged: () => () => undefined,
  };

  const updateBridge: UpdateBridge = {
    getState: () => Promise.resolve(update),
    setPinnedVersion(version) {
      pinCalls.push(version);
      return Promise.resolve({ ...update, pinnedVersion: version });
    },
    apply: () => Promise.resolve('started'),
    onAnnouncement: () => () => undefined,
  };

  render(
    <StrictMode>
      <AppProviders
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={undefined as never}
        overlay={undefined as never}
        player={undefined as never}
        selection={undefined as never}
        placement={undefined as never}
        seeds={undefined as never}
        companion={createCompanionController(bridge)}
        update={createUpdateController(updateBridge)}
        save={save}
        returnSummary={undefined as never}
      >
        <SettingsPanel />
      </AppProviders>
    </StrictMode>,
  );

  return {
    setOpacityCalls,
    saveWrites: () => saveWrites,
    setVolumeCalls,
    muteToggles: () => muteToggles,
    setMotionCalls,
    pinCalls,
  };
}

const openPanel = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
};

afterEach(cleanup);

describe('SettingsPanel', () => {
  it('renders the opacity slider on the shared dial bounds with a live readout', () => {
    mount();
    openPanel();

    const slider = screen.getByRole('slider', { name: 'Opacity' });
    expect(slider.min).toBe(String(OPACITY_MIN_PERCENT));
    expect(slider.max).toBe(String(OPACITY_MAX_PERCENT));
    expect(slider.step).toBe(String(OPACITY_STEP_PERCENT));
    // The readout before main hydrates it, which is the dial's default.
    expect(screen.getByText(`${String(OPACITY_DEFAULT_PERCENT)}%`)).toBeDefined();
  });

  it('hydrates the slider from the companion state in main', async () => {
    mount({
      opacityPercent: 60,
      workMode: false,
      clickThrough: false,
      hidden: false,
      volumePercent: 60,
      muted: true,
      motion: DEFAULT_MOTION_SETTINGS,
    });
    openPanel();

    expect(await screen.findByText('60%')).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Opacity' }).value).toBe('60');
  });

  it('a slider change updates the readout instantly and reaches main', () => {
    const { setOpacityCalls } = mount();
    openPanel();

    fireEvent.change(screen.getByRole('slider', { name: 'Opacity' }), {
      target: { value: '45' },
    });

    expect(screen.getByText('45%')).toBeDefined();
    expect(setOpacityCalls).toEqual([45]);
  });

  it('documents the three companion shortcuts (ADR-014 §5)', () => {
    mount();
    openPanel();

    // The reference renders from DEFAULT_BINDINGS, so the F12 → F10 rebind
    // reached this panel with zero component changes — the point of the table.
    expect(screen.getByText('F11')).toBeDefined();
    expect(screen.getByText('F10')).toBeDefined();
    expect(screen.getByText('Ctrl+Shift+C')).toBeDefined();
    expect(screen.getByText('Work mode')).toBeDefined();
    expect(screen.getByText('Quick hide')).toBeDefined();
    expect(screen.getByText('Click-through')).toBeDefined();
  });
});

describe('the manual save button (07e, `SAVE_FORMAT.md` §7.2)', () => {
  it('saves through the ordinary controller', async () => {
    const harness = mount();
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(harness.saveWrites()).toBe(1);
  });

  it('reports the outcome on the button itself', async () => {
    // Feedback belongs here, where the player asked; a toast for a save that
    // worked would be exactly the noise `VISION.md` §5.1 forbids.
    mount();
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Saved' })).toBeDefined();
  });

  it('coalesces a double click into one write', async () => {
    const harness = mount();
    openPanel();

    const button = screen.getByRole('button', { name: 'Save now' });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // One in flight plus its single follow-up — never one write per click.
    expect(harness.saveWrites()).toBeLessThanOrEqual(2);
  });
});

describe('the sound controls (07.5a, ADR-016)', () => {
  it('ships muted — the dial is disabled until the player asks for sound', async () => {
    // The default that matters: an overlay must not make noise unasked.
    mount();
    openPanel();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Off' })).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Sound' }).hasAttribute('disabled')).toBe(true);
  });

  it('the mute button reports state, not the action it would take', async () => {
    // `aria-pressed` and the label must agree, or a screen reader and a glance
    // tell the player opposite things.
    mount();
    openPanel();
    await act(async () => {
      await Promise.resolve();
    });

    const button = screen.getByRole('button', { name: 'Off' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggling mute reaches main', async () => {
    const harness = mount();
    openPanel();
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Off' }));

    expect(harness.muteToggles()).toBe(1);
  });

  it('a volume change updates the readout instantly and reaches main', async () => {
    const harness = mount({
      opacityPercent: 100,
      workMode: false,
      clickThrough: false,
      hidden: false,
      volumePercent: 60,
      muted: false,
    });
    openPanel();
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.change(screen.getByRole('slider', { name: 'Sound' }), { target: { value: '25' } });

    expect(harness.setVolumeCalls).toEqual([25]);
  });
});

/**
 * The Accessibility section. Phase-07.7L.
 *
 * These six settings existed and gated real effects from 07.7a onward, and
 * until this phase nothing in the application could reach them — a player
 * could only change them by hand-editing `settings.json`. So the assertions
 * here are deliberately about REACHABILITY and BINDING: that each control is
 * present, shows the stored value, and pushes a patch to main.
 */
describe('the accessibility controls (07.7L, ADR-017 §7)', () => {
  it('shows all six controls', () => {
    mount();
    openPanel();

    expect(screen.getByRole('slider', { name: 'Animation' })).toBeDefined();
    for (const name of [
      'Particles',
      'Camera shake',
      'Ambient animation',
      'Living details',
      'Reduced motion',
    ]) {
      expect(screen.getByLabelText(name)).toBeDefined();
    }
  });

  it('renders the animation dial on the shared bounds with a live readout', () => {
    mount();
    openPanel();

    const slider = screen.getByRole('slider', { name: 'Animation' });
    expect(slider.min).toBe(String(MOTION_INTENSITY_MIN_PERCENT));
    expect(slider.max).toBe(String(MOTION_INTENSITY_MAX_PERCENT));
    expect(slider.step).toBe(String(MOTION_INTENSITY_STEP_PERCENT));
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('pushes a dial change to main and updates the readout at once', () => {
    const { setMotionCalls } = mount();
    openPanel();

    fireEvent.change(screen.getByRole('slider', { name: 'Animation' }), {
      target: { value: '40' },
    });

    expect(screen.getByText('40%')).toBeDefined();
    expect(setMotionCalls).toEqual([{ intensityPercent: 40 }]);
  });

  it('sends a PARTIAL patch, so one control cannot overwrite another', () => {
    // Six independent controls: sending the whole object from each would let
    // two rapid toggles race, the second carrying a stale copy of the first.
    const { setMotionCalls } = mount();
    openPanel();

    fireEvent.click(screen.getByLabelText('Particles'));
    expect(setMotionCalls).toEqual([{ particles: false }]);
  });

  it('shows the current state of each toggle, not the action it would take', () => {
    mount();
    openPanel();

    // Defaults: particles on, the rest off (ADR-017 §2 — unbounded motion and
    // camera shake are opt-in).
    expect(screen.getByLabelText('Particles').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Ambient animation').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText('Camera shake').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText('Living details').getAttribute('aria-pressed')).toBe('false');
  });

  it('every control carries a tooltip and a description', () => {
    mount();
    openPanel();

    expect(screen.getByLabelText('Ambient animation').getAttribute('title')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Animation' }).getAttribute('title')).toBeTruthy();
    // The description the brief asks for, beside the control rather than in it.
    expect(screen.getByText(/stops when you are away/i)).toBeDefined();
  });

  it('Reduced Motion disables the other five without erasing them', async () => {
    // The master-switch property: the controls grey out, but the stored values
    // are untouched, so clearing it restores exactly what the player chose.
    mount({
      opacityPercent: 100,
      workMode: false,
      clickThrough: false,
      hidden: false,
      volumePercent: 60,
      muted: true,
      motion: { ...DEFAULT_MOTION_SETTINGS, reducedMotion: true, particles: true },
    });
    openPanel();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('slider', { name: 'Animation' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Particles').hasAttribute('disabled')).toBe(true);
    // Still ON underneath — the switch overrides, it does not overwrite.
    expect(screen.getByLabelText('Particles').getAttribute('aria-pressed')).toBe('true');
  });

  it('hydrates from what main already had stored', async () => {
    mount({
      opacityPercent: 100,
      workMode: false,
      clickThrough: false,
      hidden: false,
      volumePercent: 60,
      muted: true,
      motion: { ...DEFAULT_MOTION_SETTINGS, intensityPercent: 55, environmental: true },
    });
    openPanel();

    expect(await screen.findByText('55%')).toBeDefined();
    expect(screen.getByLabelText('Ambient animation').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the update section (15, ADR-025 §6)', () => {
  const COMPANION = {
    opacityPercent: 100,
    workMode: false,
    clickThrough: false,
    hidden: false,
    volumePercent: 60,
    muted: true,
    motion: DEFAULT_MOTION_SETTINGS,
  };

  it('says nothing until main answers with a version', () => {
    // `UNKNOWN_VERSION` is the empty string, and a panel that rendered
    // "Version" beside nothing for one frame would be reporting a fact it
    // does not have yet.
    mount(COMPANION, { currentVersion: '', pinnedVersion: null });
    openPanel();

    expect(screen.queryByTestId('update-section')).toBeNull();
  });

  it('shows the version that is running', async () => {
    mount();
    openPanel();

    expect((await screen.findByTestId('update-section')).textContent).toContain('0.2.0');
  });

  it('pins the running version, so "hold me here" needs no typing', async () => {
    // The pin is a VERSION (ADR-025 §6), but the control is not a text field:
    // a player protecting a working farm is saying "not past here", and the
    // version they mean is the one they are on. A free-text box would invite
    // exactly the unparseable pin `update-policy.ts` has to hold on.
    const { pinCalls } = mount();
    openPanel();

    const control = await screen.findByLabelText('Stay on this version');
    expect(control.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(control);

    expect(pinCalls).toEqual(['0.2.0']);
    expect(control.getAttribute('aria-pressed')).toBe('true');
  });

  it('clears the pin when pressed again', async () => {
    const { pinCalls } = mount(COMPANION, { currentVersion: '0.2.0', pinnedVersion: '0.2.0' });
    openPanel();

    const control = await screen.findByLabelText('Stay on this version');
    expect(control.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(control);

    expect(pinCalls).toEqual([null]);
    expect(control.getAttribute('aria-pressed')).toBe('false');
  });

  it('names a pin that is not the running version, rather than showing a bare On', async () => {
    // A pin is a CEILING, not a freeze: `0.2.2` still lets `0.2.1` through.
    // The control can only ever set it to the running version, so a pin ahead
    // of the build came from somewhere else — a hand-edited settings.json, or
    // a rollback — and hiding it behind an On would misdescribe the state.
    mount(COMPANION, { currentVersion: '0.2.0', pinnedVersion: '0.2.2' });
    openPanel();

    const section = await screen.findByTestId('update-section');
    expect(section.textContent).toContain('0.2.2');
  });
});
