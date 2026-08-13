/**
 * The renderer's view of updating. Phase-15 — ADR-025 §5, §6.
 *
 * The bridge is injected for the same reason every other controller injects
 * one: React never touches `window.desktopLife`, so this is testable without
 * Electron (`CODE_STYLE.md` §8.1).
 */

import { describe, expect, it, vi } from 'vitest';

import type { UpdateAnnouncement } from '../../shared/ipc/contract';

import { createUpdateController, type UpdateBridge } from './update-controller';

const OFFER: UpdateAnnouncement = { kind: 'offer', version: '0.2.1' };

function bridge(overrides: Partial<UpdateBridge> = {}) {
  let announce: (announcement: UpdateAnnouncement) => void = () => undefined;

  const base: UpdateBridge = {
    getState: () => Promise.resolve({ currentVersion: '0.2.0', pinnedVersion: null }),
    setPinnedVersion: (version) =>
      Promise.resolve({ currentVersion: '0.2.0', pinnedVersion: version }),
    onAnnouncement: (listener) => {
      announce = listener;
      return () => undefined;
    },
    ...overrides,
  };

  return {
    bridge: base,
    fire: (a: UpdateAnnouncement) => {
      announce(a);
    },
  };
}

describe('an announcement stays until it is dismissed', () => {
  it('has nothing to show before one arrives', () => {
    const { bridge: b } = bridge();

    expect(createUpdateController(b).announcement()).toBeNull();
  });

  it('shows what main announced, and tells its subscribers', () => {
    const { bridge: b, fire } = bridge();
    const controller = createUpdateController(b);
    const listener = vi.fn();
    controller.subscribe(listener);

    fire(OFFER);

    expect(controller.announcement()).toEqual(OFFER);
    expect(listener).toHaveBeenCalled();
  });

  it('does not expire on its own — this is a prompt, not a confirmation', () => {
    // The whole reason for a second toast variant. A player who looked away
    // for three seconds must not have silently declined an update; ADR-025 §5
    // calls the announcement "dismissible", which only means something if it
    // is still there to dismiss.
    vi.useFakeTimers();
    const { bridge: b, fire } = bridge();
    const controller = createUpdateController(b);

    fire(OFFER);
    vi.advanceTimersByTime(600_000);

    expect(controller.announcement()).toEqual(OFFER);
    vi.useRealTimers();
  });

  it('clears on dismiss', () => {
    const { bridge: b, fire } = bridge();
    const controller = createUpdateController(b);
    fire(OFFER);

    controller.dismiss();

    expect(controller.announcement()).toBeNull();
  });

  it('does not tell main about a dismissal', () => {
    // Nothing to tell. Main's announcer already recorded that this version was
    // announced, so it will not offer it again; dismissing is a view concern
    // and a round trip would only add a way for the two to disagree.
    const setPinnedVersion = vi.fn();
    const { bridge: b, fire } = bridge({ setPinnedVersion });
    const controller = createUpdateController(b);
    fire(OFFER);

    controller.dismiss();

    expect(setPinnedVersion).not.toHaveBeenCalled();
  });

  it('replaces an undismissed announcement rather than queueing', () => {
    // One slot, exactly as the companion toast has. Two stacked update
    // prompts is the notification spam this product refuses to become.
    const { bridge: b, fire } = bridge();
    const controller = createUpdateController(b);

    fire(OFFER);
    fire({ kind: 'refusal', message: 'cannot open your farm' });

    expect(controller.announcement()).toEqual({
      kind: 'refusal',
      message: 'cannot open your farm',
    });
  });
});

describe('the pin', () => {
  it('hydrates from main', async () => {
    const { bridge: b } = bridge({
      getState: () => Promise.resolve({ currentVersion: '0.2.0', pinnedVersion: '0.2.2' }),
    });

    const controller = createUpdateController(b);
    await Promise.resolve();

    expect(controller.pinnedVersion()).toBe('0.2.2');
    expect(controller.currentVersion()).toBe('0.2.0');
  });

  it('applies optimistically, so the control does not lag the click', async () => {
    const { bridge: b } = bridge();
    const controller = createUpdateController(b);

    controller.setPinnedVersion('0.2.2');

    expect(controller.pinnedVersion()).toBe('0.2.2');
    await Promise.resolve();
  });

  it('takes the answer from main over its own guess', async () => {
    // Main re-parses through the settings schema, which trims. The renderer
    // must not keep showing a pin main did not store.
    const { bridge: b } = bridge({
      setPinnedVersion: () => Promise.resolve({ currentVersion: '0.2.0', pinnedVersion: '0.2.2' }),
    });
    const controller = createUpdateController(b);

    controller.setPinnedVersion('  0.2.2  ');
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.pinnedVersion()).toBe('0.2.2');
  });

  it('clears with null', async () => {
    const { bridge: b } = bridge();
    const controller = createUpdateController(b);
    controller.setPinnedVersion('0.2.2');

    controller.setPinnedVersion(null);

    expect(controller.pinnedVersion()).toBeNull();
    await Promise.resolve();
  });
});

describe('subscription', () => {
  it('stops notifying after teardown', () => {
    const { bridge: b, fire } = bridge();
    const controller = createUpdateController(b);
    const listener = vi.fn();

    controller.subscribe(listener)();
    fire(OFFER);

    expect(listener).not.toHaveBeenCalled();
  });
});
