/**
 * Inventory panel. Phase-05d — the first substantial React panel.
 *
 * Reads the change-gated `inventory` slice (ADR-005 §2): a grid of stacks with
 * icons and counts, a used/total capacity readout, an empty state, and a sort
 * toggle. Because the slice republishes only when holdings change, an open panel
 * over a static inventory does zero React work (crit 17/18) — the property the
 * throttled snapshot bridge exists to give, tested here for the first time.
 *
 * Open state is local UI state; it never touches the simulation.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';

import styles from './InventoryPanel.module.css';
import { ItemIcon } from './ItemIcon';

type SortMode = 'name' | 'quantity';

/** A display label from an item id: `core:turnip` → `Turnip`. */
function label(item: string): string {
  const name = item.includes(':') ? item.slice(item.indexOf(':') + 1) : item;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function InventoryPanel(): ReactNode {
  const inventory = useSlice('inventory');
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<SortMode>('name');

  const stacks = useMemo(() => {
    if (sort === 'name') return inventory.stacks; // the slice is already name-sorted
    return [...inventory.stacks].sort(
      (a, b) => b.quantity - a.quantity || (a.item < b.item ? -1 : 1),
    );
  }, [inventory.stacks, sort]);

  return (
    <div className={styles['container']} data-interactive data-testid="inventory">
      <button
        type="button"
        className={styles['toggle']}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Inventory · {inventory.usedSlots}/{inventory.capacity}
      </button>

      {open && (
        <div className={styles['panel']}>
          <div className={styles['header']}>
            <span>
              {inventory.usedSlots} / {inventory.capacity} slots
            </span>
            <button
              type="button"
              className={styles['sort']}
              onClick={() => setSort((mode) => (mode === 'name' ? 'quantity' : 'name'))}
            >
              Sort: {sort}
            </button>
          </div>

          {stacks.length === 0 ? (
            <div className={styles['empty']}>Nothing stored yet.</div>
          ) : (
            <div className={styles['grid']}>
              {stacks.map((stack) => (
                <div key={stack.item} className={styles['stack']} title={label(stack.item)}>
                  <ItemIcon item={stack.item} />
                  <span className={styles['count']}>{stack.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
