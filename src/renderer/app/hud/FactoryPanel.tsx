/**
 * Factory panel. Phase-25 — ADR-035, ADR-005 §2.
 *
 * Reads the change-gated `factories` slice: what each factory is set to make,
 * how far along it is, what it is holding, and — the part that earns the panel
 * — **why it is not running when it is not running**.
 *
 * That last one is the whole reason this exists rather than a sprite overlay.
 * ADR-035 Rule B says a factory that cannot proceed is idle and never broken:
 * there is no jammed state, no error, and no operator intervention. That is the
 * right simulation behaviour and it is illegible on its own — a player watching
 * a chain that has quietly stopped has nothing to go on. The reason is derived
 * at projection time from the same conditions the production system tests, so
 * the panel and the simulation cannot disagree, and nothing is stored that
 * could go stale.
 *
 * Recipe selection submits an ordinary `setFactoryRecipe` command through the
 * same dispatcher the worker AI uses (ADR-010 §6 — no privileged write path).
 *
 * Open state is local UI state; it never touches the simulation.
 */

import { useState, type ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';
import { usePlayer } from '../store-context';

import styles from './FactoryPanel.module.css';

/** A display label from a content id: `core:grind_flour` → `Grind flour`. */
function label(id: string): string {
  const name = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  const spaced = name.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** What a player is told when nothing is being produced. */
const IDLE_TEXT: Readonly<Record<string, string>> = {
  'no-recipe': 'Choose what to make',
  'missing-inputs': 'Waiting for materials',
  'output-full': 'Output full',
};

function Stacks({ stacks }: { readonly stacks: readonly { item: string; quantity: number }[] }) {
  if (stacks.length === 0) return <span className={styles['empty']}>empty</span>;
  return (
    <>
      {stacks.map((stack) => (
        <span key={stack.item} className={styles['stack']}>
          {label(stack.item)} ×{stack.quantity}
        </span>
      ))}
    </>
  );
}

export function FactoryPanel(): ReactNode {
  const factories = useSlice('factories');
  const player = usePlayer();
  const [open, setOpen] = useState(false);

  // No factories, no toggle. A player who has not built one is not shown a
  // panel for a system they have not met — the same courtesy the board pays.
  if (factories.length === 0) return null;

  const running = factories.filter((factory) => factory.progress !== null).length;

  return (
    <div className={styles['container']}>
      <button
        type="button"
        className={styles['toggle']}
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        Factories · {running}/{factories.length}
      </button>

      {open && (
        <section className={styles['panel']} data-testid="factory-panel">
          {factories.map((factory) => (
            <article key={factory.building} className={styles['row']}>
              <header className={styles['head']}>
                <span className={styles['name']}>
                  {factory.recipeName === '' ? 'Idle factory' : factory.recipeName}
                </span>
                {factory.idleReason === null ? (
                  <span className={styles['status']}>
                    {Math.round((factory.progress ?? 0) * 100)}%
                  </span>
                ) : (
                  // Amber, never red: a stalled factory is an ordinary
                  // condition the player can clear, not a fault (ADR-035 §4).
                  <span className={styles['idle']}>{IDLE_TEXT[factory.idleReason] ?? 'Idle'}</span>
                )}
              </header>

              <div
                className={styles['bar']}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((factory.progress ?? 0) * 100)}
              >
                <div
                  className={styles['fill']}
                  style={{ width: `${String(Math.round((factory.progress ?? 0) * 100))}%` }}
                />
              </div>

              <div className={styles['contents']}>
                <span className={styles['label']}>In</span>
                <Stacks stacks={factory.input} />
                <span className={styles['label']}>Out</span>
                <Stacks stacks={factory.output} />
              </div>

              {factory.recipeId !== null && (
                <button
                  type="button"
                  className={styles['clear']}
                  onClick={() => {
                    player.submit({
                      type: 'setFactoryRecipe',
                      building: factory.building,
                      recipeId: null,
                    });
                  }}
                >
                  Stop
                </button>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
