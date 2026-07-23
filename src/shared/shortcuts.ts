/**
 * Desktop-companion shortcut actions and their default bindings.
 * fix/0.1/1.8a.md; ADR-014 §5 (amended).
 *
 * Actions are STABLE IDENTIFIERS — the names any future rebinding
 * configuration keys on; they never change once shipped. Bindings are
 * replaceable configuration; v0.1 ships these defaults fixed, with no
 * rebinding UI.
 *
 * THIS TABLE IS THE ONLY PLACE PHYSICAL KEYS EXIST. The main process
 * registers from it (shortcut-manager.ts), the settings panel renders its
 * shortcut reference from it, and nothing anywhere checks a key code
 * directly. Shared because both layers hold an end of it — exactly the
 * `PROJECT_STRUCTURE.md` §2.1 placement rule.
 */

export const ShortcutAction = {
  WorkMode: 'workMode',
  QuickHide: 'quickHide',
  ClickThrough: 'clickThrough',
} as const;

export type ShortcutAction = (typeof ShortcutAction)[keyof typeof ShortcutAction];

/** Registration and display order. */
export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  ShortcutAction.WorkMode,
  ShortcutAction.QuickHide,
  ShortcutAction.ClickThrough,
];

/**
 * v0.1's fixed default bindings, in Electron accelerator syntax.
 *
 * `Ctrl` rather than `CommandOrControl` deliberately: the product is
 * Windows-first (`VISION.md` §5.1), and pretending otherwise here would be
 * untested cross-platform surface.
 */
export const DEFAULT_BINDINGS: Readonly<Record<ShortcutAction, string>> = {
  [ShortcutAction.WorkMode]: 'F11',
  [ShortcutAction.QuickHide]: 'F12',
  [ShortcutAction.ClickThrough]: 'Ctrl+Shift+C',
};
