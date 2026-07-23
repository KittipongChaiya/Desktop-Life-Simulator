/**
 * The centralized shortcut manager. fix/0.1/1.8a.md; ADR-014 §5 (amended).
 *
 * ALL shortcut resolution passes through here: platform code binds handlers
 * to `ShortcutAction`s, the bindings configuration maps actions to physical
 * keys, and no `if key == F11` exists anywhere in the application. Future
 * rebinding replaces the configuration source; nothing else changes.
 *
 * Pure — no electron import — so vitest covers the resolution rules. The
 * electron-backed registrar lives in `desktop-companion.ts`, injected at the
 * wiring point (01.8b registers the first real handlers).
 */

import { SHORTCUT_ACTIONS, type ShortcutAction } from '../shared/shortcuts';

/** The OS half of registration — `globalShortcut` in production, a stub in tests. */
export interface ShortcutRegistrar {
  /** Returns false when the accelerator is already claimed by another app. */
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

export interface ShortcutManager {
  /**
   * Binds a handler to every action. Returns the actions whose registration
   * failed — a claimed key degrades that one feature, never the app
   * (ADR-014 §5.2); the caller decides how to surface it.
   */
  registerAll(handlers: Readonly<Record<ShortcutAction, () => void>>): readonly ShortcutAction[];
  dispose(): void;
}

export function createShortcutManager(
  bindings: Readonly<Record<ShortcutAction, string>>,
  registrar: ShortcutRegistrar,
): ShortcutManager {
  return {
    registerAll(handlers) {
      const failed: ShortcutAction[] = [];
      for (const action of SHORTCUT_ACTIONS) {
        // The ONE point where an action meets its physical key.
        if (!registrar.register(bindings[action], handlers[action])) failed.push(action);
      }
      return failed;
    },

    dispose() {
      registrar.unregisterAll();
    },
  };
}
