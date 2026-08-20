/**
 * Companion controller. Phase-01.8a (ADR-014 §3).
 *
 * The controller mirrors the overlay controller's contract: hydrate from main,
 * respond optimistically, stay in sync with externally-driven changes (the
 * global hotkeys arriving in 01.8b/c).
 */

import { describe, expect, it, vi } from 'vitest';

import { OPACITY_DEFAULT_PERCENT } from '../../shared/constants';
import { DEFAULT_MOTION_SETTINGS, type MotionSettings } from '../../shared/motion';

import { createCompanionController, type CompanionBridge } from './companion-controller';

interface BridgeState {
  readonly opacityPercent: number;
  readonly workMode: boolean;
  readonly clickThrough: boolean;
  readonly hidden: boolean;
  readonly motion: MotionSettings;
}

interface StubBridge extends CompanionBridge {
  readonly setOpacityCalls: number[];
  emit(state: BridgeState): void;
}

const state = (overrides: Partial<BridgeState> = {}): BridgeState => ({
  opacityPercent: 60,
  workMode: false,
  clickThrough: false,
  hidden: false,
  motion: DEFAULT_MOTION_SETTINGS,
  ...overrides,
});

function stubBridge(initial = state()): StubBridge {
  const setOpacityCalls: number[] = [];
  let listener: ((next: BridgeState) => void) | null = null;

  return {
    setOpacityCalls,
    emit(next) {
      listener?.(next);
    },
    setOpacity(percent) {
      setOpacityCalls.push(percent);
      return Promise.resolve(state({ opacityPercent: percent }));
    },
    getState() {
      return Promise.resolve(initial);
    },
    onStateChanged(next) {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };
}

/** Lets the hydration promise from `getState` settle. */
const settle = (): Promise<void> => Promise.resolve().then(() => undefined);

describe('createCompanionController', () => {
  it('starts on the default and hydrates from main', async () => {
    const controller = createCompanionController(
      stubBridge(state({ opacityPercent: 45, workMode: true })),
    );
    expect(controller.opacityPercent()).toBe(OPACITY_DEFAULT_PERCENT);
    expect(controller.clickThrough()).toBe(false);
    expect(controller.hidden()).toBe(false);

    await settle();
    expect(controller.opacityPercent()).toBe(45);
    expect(controller.workMode()).toBe(true);
  });

  it('notifies subscribers on hydration', async () => {
    const listener = vi.fn();
    const controller = createCompanionController(stubBridge(state({ opacityPercent: 45 })));
    controller.subscribe(listener);

    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('follows the runtime toggle states (quick hide, click-through)', async () => {
    const bridge = stubBridge();
    const listener = vi.fn();
    const controller = createCompanionController(bridge);
    await settle();
    controller.subscribe(listener);

    bridge.emit(state({ clickThrough: true }));
    expect(controller.clickThrough()).toBe(true);

    bridge.emit(state({ clickThrough: true, hidden: true }));
    expect(controller.hidden()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('applies opacity optimistically and forwards it to main', async () => {
    const bridge = stubBridge();
    const controller = createCompanionController(bridge);
    await settle();

    controller.setOpacityPercent(35);
    expect(controller.opacityPercent()).toBe(35); // instant, before main confirms
    expect(bridge.setOpacityCalls).toEqual([35]);
  });

  it('follows externally-driven state changes (hotkeys, future modes)', async () => {
    const bridge = stubBridge();
    const listener = vi.fn();
    const controller = createCompanionController(bridge);
    await settle();
    controller.subscribe(listener);

    bridge.emit(state({ workMode: true }));
    expect(controller.workMode()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the state is unchanged', async () => {
    const bridge = stubBridge();
    const listener = vi.fn();
    const controller = createCompanionController(bridge);
    await settle();
    controller.subscribe(listener);

    bridge.emit(state()); // identical to hydrated state
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies when only the motion settings changed', async () => {
    // The whole point of 07.7d-bis: a toggle in the settings panel has to
    // reach the renderer, and it arrives as a nested object rather than a
    // flat field — so a reference-only comparison would drop it.
    const bridge = stubBridge();
    const listener = vi.fn();
    const controller = createCompanionController(bridge);
    await settle();
    controller.subscribe(listener);

    bridge.emit(state({ motion: { ...DEFAULT_MOTION_SETTINGS, reducedMotion: true } }));
    expect(listener).toHaveBeenCalled();
  });

  it('does not notify when an identical motion object arrives rebuilt', async () => {
    // Main rebuilds CompanionState on every broadcast, so a reference check
    // would wake the renderer on every hotkey press for nothing.
    const bridge = stubBridge();
    const listener = vi.fn();
    const controller = createCompanionController(bridge);
    await settle();
    controller.subscribe(listener);

    bridge.emit(state({ motion: { ...DEFAULT_MOTION_SETTINGS } }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('resolves motion through reduced motion and work mode', async () => {
    const bridge = stubBridge(
      state({
        workMode: false,
        motion: { ...DEFAULT_MOTION_SETTINGS, intensityPercent: 100, particles: true },
      }),
    );
    const controller = createCompanionController(bridge);
    await settle();

    expect(controller.motion().intensityPercent).toBe(100);

    bridge.emit(state({ motion: { ...DEFAULT_MOTION_SETTINGS, reducedMotion: true } }));
    expect(controller.motion().intensityPercent).toBe(0);
    expect(controller.motion().particles).toBe(false);
  });

  it('stops ambient motion in work mode without touching the stored choice', async () => {
    const bridge = stubBridge(
      state({ workMode: true, motion: { ...DEFAULT_MOTION_SETTINGS, environmental: true } }),
    );
    const controller = createCompanionController(bridge);
    await settle();

    expect(controller.motion().environmental).toBe(false);
  });

  it('unsubscribe tears down', async () => {
    const bridge = stubBridge();
    const listener = vi.fn();
    const controller = createCompanionController(bridge);
    await settle();

    const unsubscribe = controller.subscribe(listener);
    unsubscribe();
    controller.setOpacityPercent(50);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('a broadcast that arrives after a newer local change (phase-54)', () => {
  /**
   * THE DEFECT, reproduced from the E2E flake that found it.
   *
   * Six ArrowRight presses on the opacity slider landed on 55% instead of 60%,
   * intermittently, and the recorded DOM events showed why: between two
   * presses the input's value went BACKWARDS, from 40 to 35. React had
   * re-rendered the controlled input with a stale value, so the next press
   * incremented from 35 and one step was lost.
   *
   * The stale value came from main. Every `setOpacity` broadcasts the new
   * state, and those broadcasts are asynchronous — so press N's echo can land
   * after press N+1 has already been applied optimistically. `setLocal` then
   * happily moves the state backwards, because it only checks whether the
   * value DIFFERS, never whether it is older.
   *
   * A player holding ArrowRight, or dragging the slider, sees it stick and
   * jump back. That is the bug; the flaky test was the symptom.
   */
  it('keeps the newer value when an older echo arrives late', () => {
    const bridge = stubBridge();
    const controller = createCompanionController(bridge);

    controller.setOpacityPercent(35);
    controller.setOpacityPercent(40);

    // Press 1's echo, arriving after press 2 was applied.
    bridge.emit(state({ opacityPercent: 35 }));

    expect(controller.opacityPercent(), 'a late echo dragged the dial backwards').toBe(40);
  });

  it('accepts the echo once it catches up', () => {
    // The guard must not make the controller deaf: the echo for the value it
    // actually asked for has to land, or the local value would never be
    // reconciled with main again.
    const bridge = stubBridge();
    const controller = createCompanionController(bridge);

    controller.setOpacityPercent(40);
    bridge.emit(state({ opacityPercent: 40 }));

    expect(controller.opacityPercent()).toBe(40);
  });

  it('still follows main when the change did not come from here', () => {
    // THE REGRESSION THIS COULD CAUSE. Opacity also moves by global hotkey and
    // by the tray, and those arrive as broadcasts with no local write in
    // flight. Ignoring them would leave the panel showing a dial the window no
    // longer has.
    const bridge = stubBridge();
    const controller = createCompanionController(bridge);

    bridge.emit(state({ opacityPercent: 45 }));

    expect(controller.opacityPercent()).toBe(45);
  });

  it('lets main overrule the value it was asked for', () => {
    // Main sanitises: an out-of-range request comes back clamped, and that
    // answer is authoritative. The guard waits for an echo of what it SENT, so
    // a clamped echo must still be able to settle the dial rather than being
    // ignored forever.
    const bridge = stubBridge();
    const controller = createCompanionController(bridge);

    controller.setOpacityPercent(200);
    bridge.emit(state({ opacityPercent: 100 }));

    expect(controller.opacityPercent(), 'a clamp from main was ignored').toBe(100);
  });
});
