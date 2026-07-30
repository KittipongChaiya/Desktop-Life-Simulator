/**
 * The tool bar. Phase-07.5h — the `[tools]` affordance `GAME_DESIGN.md` §10.2
 * has specified since the design was written.
 *
 * WHY THIS EXISTS. Clicking the ground does nothing unless a tool is armed, and
 * arming one was possible only by pressing `1`, `2`, or `4` — a fact stated in
 * no interface anywhere. A player who bought seeds, found them in the
 * inventory, and clicked the ground got silence, with nothing to suggest what
 * was missing. That is a failure of `fix/0.1/7.5.md`'s first acceptance
 * criterion ("a first-time player should immediately understand how to farm"),
 * and it was reported from a real session twice before it was found.
 *
 * The bar adds no gameplay: it drives the same `ToolSelection` the keyboard
 * does, which the same click mapping has always read. It makes an existing
 * mechanic visible — which is the whole job of a vertical slice.
 *
 * Each button states the verb, shows its key, and shows whether it is armed.
 * The keys come from the one `TOOLS` table, so a rebind reaches this bar for
 * free (the pattern the companion shortcut list already follows).
 */

import { useSyncExternalStore, type ReactNode } from 'react';

import { useToolSelection } from '../store-context';
import { TOOLS } from '../tools';

import styles from './ToolBar.module.css';

export function ToolBar(): ReactNode {
  const tools = useToolSelection();

  const held = useSyncExternalStore(
    (listener) => tools.subscribe(listener),
    () => tools.selected(),
    () => tools.selected(),
  );

  return (
    <div className={styles['bar']} role="group" aria-label="Tools" data-testid="tool-bar">
      {TOOLS.map((info) => {
        const armed = held === info.tool;
        return (
          <button
            key={info.tool}
            type="button"
            className={styles['tool']}
            // `aria-pressed` rather than a disabled state: the bar is a set of
            // modes, and a screen reader must hear which one is active.
            aria-pressed={armed}
            data-armed={armed || undefined}
            title={`${info.hint} (${info.key})`}
            onClick={() => {
              // Clicking the armed tool disarms it, so the bar is also the way
              // OUT of a mode — `Esc` does the same, but the mouse should not
              // need the keyboard to undo what the mouse did.
              tools.select(armed ? null : info.tool);
            }}
          >
            {info.label}
            <kbd className={styles['key']}>{info.key}</kbd>
          </button>
        );
      })}
    </div>
  );
}
