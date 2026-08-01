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
import { createActionFeedback } from '../action-feedback';
import { createCompanionController, type CompanionBridge } from '../companion-controller';
import { createSaveController } from '../save-controller';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';

import { SettingsPanel } from './SettingsPanel';

interface Harness {
  readonly setOpacityCalls: number[];
  /** Writes the manual save button actually caused. */
  readonly saveWrites: () => number;
  /** Volume values the dial pushed to main (07.5a). */
  readonly setVolumeCalls: number[];
  readonly muteToggles: () => number;
}

function mount(
  initial = {
    opacityPercent: 100,
    workMode: false,
    clickThrough: false,
    hidden: false,
    volumePercent: 60,
    muted: true,
  },
): Harness {
  const setOpacityCalls: number[] = [];
  const setVolumeCalls: number[] = [];
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
    getState: () => Promise.resolve(initial),
    onStateChanged: () => () => undefined,
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
    mount({ opacityPercent: 60, workMode: false, clickThrough: false, hidden: false });
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
