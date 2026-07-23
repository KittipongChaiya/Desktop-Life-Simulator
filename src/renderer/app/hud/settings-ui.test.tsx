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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OPACITY_MAX_PERCENT,
  OPACITY_MIN_PERCENT,
  OPACITY_STEP_PERCENT,
} from '../../../shared/constants';
import { createCompanionController, type CompanionBridge } from '../companion-controller';
import { AppProviders } from '../store-context';

import { SettingsPanel } from './SettingsPanel';

interface Harness {
  readonly setOpacityCalls: number[];
}

function mount(
  initial = { opacityPercent: 100, workMode: false, clickThrough: false, hidden: false },
): Harness {
  const setOpacityCalls: number[] = [];
  const bridge: CompanionBridge = {
    setOpacity(percent) {
      setOpacityCalls.push(percent);
      return Promise.resolve({
        opacityPercent: percent,
        workMode: false,
        clickThrough: false,
        hidden: false,
      });
    },
    getState: () => Promise.resolve(initial),
    onStateChanged: () => () => undefined,
  };

  render(
    <StrictMode>
      <AppProviders
        store={undefined as never}
        overlay={undefined as never}
        player={undefined as never}
        selection={undefined as never}
        placement={undefined as never}
        seeds={undefined as never}
        companion={createCompanionController(bridge)}
      >
        <SettingsPanel />
      </AppProviders>
    </StrictMode>,
  );

  return { setOpacityCalls };
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
    expect(screen.getByText('100%')).toBeDefined();
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

    expect(screen.getByText('F11')).toBeDefined();
    expect(screen.getByText('F12')).toBeDefined();
    expect(screen.getByText('Ctrl+Shift+C')).toBeDefined();
    expect(screen.getByText('Work mode')).toBeDefined();
    expect(screen.getByText('Quick hide')).toBeDefined();
    expect(screen.getByText('Click-through')).toBeDefined();
  });
});
