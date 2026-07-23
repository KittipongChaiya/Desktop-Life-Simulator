/**
 * Companion controller. Phase-01.8a (ADR-014 §3).
 *
 * The controller mirrors the overlay controller's contract: hydrate from main,
 * respond optimistically, stay in sync with externally-driven changes (the
 * global hotkeys arriving in 01.8b/c).
 */

import { describe, expect, it, vi } from 'vitest';

import { OPACITY_DEFAULT_PERCENT } from '../../shared/constants';

import { createCompanionController, type CompanionBridge } from './companion-controller';

interface BridgeState {
  readonly opacityPercent: number;
  readonly workMode: boolean;
  readonly clickThrough: boolean;
  readonly hidden: boolean;
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
