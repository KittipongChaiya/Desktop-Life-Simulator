/**
 * The centralized shortcut manager. fix/0.1/1.8a.md; ADR-014 §5 (amended).
 *
 * The acceptance criteria, as tests: physical keys exist in exactly one place
 * (the bindings config), all resolution passes through the manager, and
 * rebinding is a configuration replacement — never a code change.
 */

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BINDINGS, SHORTCUT_ACTIONS, ShortcutAction } from '../shared/shortcuts';

import { createShortcutManager, type ShortcutRegistrar } from './shortcut-manager';

interface StubRegistrar extends ShortcutRegistrar {
  /** Accelerators registered, in order. */
  readonly registered: string[];
  /** Simulates the OS delivering a keypress for a registered accelerator. */
  press(accelerator: string): void;
  readonly unregisterAllCalls: () => number;
}

function stubRegistrar(failFor: readonly string[] = []): StubRegistrar {
  const registered: string[] = [];
  const callbacks = new Map<string, () => void>();
  let unregisterAll = 0;

  return {
    registered,
    press(accelerator) {
      callbacks.get(accelerator)?.();
    },
    unregisterAllCalls: () => unregisterAll,
    register(accelerator, callback) {
      if (failFor.includes(accelerator)) return false;
      registered.push(accelerator);
      callbacks.set(accelerator, callback);
      return true;
    },
    unregisterAll() {
      unregisterAll += 1;
      callbacks.clear();
    },
  };
}

function handlers(): Record<ShortcutAction, ReturnType<typeof vi.fn>> {
  return {
    [ShortcutAction.WorkMode]: vi.fn(),
    [ShortcutAction.QuickHide]: vi.fn(),
    [ShortcutAction.ClickThrough]: vi.fn(),
  };
}

describe('the default bindings', () => {
  it('carry the directive’s v0.1 keys, and nothing else defines them', () => {
    // Pinned: these are DEFAULTS, not identity — actions are the stable names.
    expect(DEFAULT_BINDINGS[ShortcutAction.WorkMode]).toBe('F11');
    expect(DEFAULT_BINDINGS[ShortcutAction.QuickHide]).toBe('F12');
    expect(DEFAULT_BINDINGS[ShortcutAction.ClickThrough]).toBe('Ctrl+Shift+C');
    expect(SHORTCUT_ACTIONS).toHaveLength(3);
  });
});

describe('createShortcutManager', () => {
  it('registers every action against its configured binding, exactly once', () => {
    const registrar = stubRegistrar();
    createShortcutManager(DEFAULT_BINDINGS, registrar).registerAll(handlers());

    expect(registrar.registered).toEqual(['F11', 'F12', 'Ctrl+Shift+C']);
  });

  it('resolves a keypress to its action’s handler — resolution lives here only', () => {
    const registrar = stubRegistrar();
    const bound = handlers();
    createShortcutManager(DEFAULT_BINDINGS, registrar).registerAll(bound);

    registrar.press('F12');
    expect(bound[ShortcutAction.QuickHide]).toHaveBeenCalledTimes(1);
    expect(bound[ShortcutAction.WorkMode]).not.toHaveBeenCalled();
    expect(bound[ShortcutAction.ClickThrough]).not.toHaveBeenCalled();
  });

  it('reports failed registrations and keeps the rest working (ADR-014 §5.2)', () => {
    const registrar = stubRegistrar(['F12']); // F12 already claimed by another app
    const bound = handlers();
    const failed = createShortcutManager(DEFAULT_BINDINGS, registrar).registerAll(bound);

    expect(failed).toEqual([ShortcutAction.QuickHide]);
    registrar.press('F11');
    expect(bound[ShortcutAction.WorkMode]).toHaveBeenCalledTimes(1);
  });

  it('a replaced bindings config re-keys actions with no other change', () => {
    // The future rebinding path: swap the configuration source, touch nothing
    // else (fix/0.1/1.8a.md acceptance 3).
    const registrar = stubRegistrar();
    const bound = handlers();
    const rebound = { ...DEFAULT_BINDINGS, [ShortcutAction.QuickHide]: 'F9' };
    createShortcutManager(rebound, registrar).registerAll(bound);

    expect(registrar.registered).toEqual(['F11', 'F9', 'Ctrl+Shift+C']);
    registrar.press('F9');
    expect(bound[ShortcutAction.QuickHide]).toHaveBeenCalledTimes(1);
  });

  it('dispose unregisters everything', () => {
    const registrar = stubRegistrar();
    const manager = createShortcutManager(DEFAULT_BINDINGS, registrar);
    manager.registerAll(handlers());
    manager.dispose();

    expect(registrar.unregisterAllCalls()).toBe(1);
    registrar.press('F11'); // cleared — nothing fires
  });
});
