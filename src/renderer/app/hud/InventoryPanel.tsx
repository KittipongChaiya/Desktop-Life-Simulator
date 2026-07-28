/**
 * Inventory panel. Phase-05d; the sell interface since 06e.
 *
 * Reads the change-gated `inventory` slice (ADR-005 §2): a grid of stacks with
 * icons and counts, a used/total capacity readout, an empty state, and a sort
 * toggle. Because the slice republishes only when holdings change, an open panel
 * over a static inventory does zero React work (crit 17/18) — the property the
 * throttled snapshot bridge exists to give, tested here for the first time.
 *
 * SELLING (06e): each stack row shows its live price from the economy slice —
 * with a quiet amber "down" mark while the price is depressed (§6.2), never
 * red — and Sell 1 / Sell all buttons that submit ordinary `sellItems`
 * commands. The preview is exact: a batch prices at the pre-sale multiplier,
 * so quantity × unit price is precisely what the sale credits.
 *
 * Open state is local UI state; it never touches the simulation.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { useGain } from '../hooks/use-gain';
import { useSlice } from '../hooks/use-slice';
import { usePlayer } from '../store-context';

import styles from './InventoryPanel.module.css';
import { ItemIcon } from './ItemIcon';

type SortMode = 'name' | 'quantity';

/** A display label from an item id: `core:turnip_seed` → `Turnip seed`. */
function label(item: string): string {
  const name = item.includes(':') ? item.slice(item.indexOf(':') + 1) : item;
  const spaced = name.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function InventoryPanel(): ReactNode {
  const inventory = useSlice('inventory');
  const economy = useSlice('economy');
  // Goods arriving is the one inventory change the player did not initiate —
  // a worker deposited while they were reading something else. The button
  // flashes so the panel does not have to be open to notice (07.5b).
  const arrived = useGain(inventory.stacks.reduce((total, stack) => total + stack.quantity, 0));
  const player = usePlayer();
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
        data-arrived={arrived > 0 || undefined}
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
            <div className={styles['rows']}>
              {stacks.map((stack) => {
                const market = economy.prices.find((price) => price.item === stack.item);
                const price = market?.price ?? 0;
                const depressed = market !== undefined && market.price < market.basePrice;
                return (
                  <div key={stack.item} className={styles['sellRow']} title={label(stack.item)}>
                    <div className={styles['stack']}>
                      <ItemIcon item={stack.item} size={24} />
                      <span className={styles['count']}>{stack.quantity}</span>
                    </div>
                    <span className={styles['itemName']}>{label(stack.item)}</span>
                    <span
                      className={depressed ? styles['priceDown'] : styles['price']}
                      title={
                        depressed
                          ? `Price recovering — normally ${market.basePrice}g`
                          : `${price}g each`
                      }
                    >
                      {price}g{depressed ? ' ↓' : ''}
                    </span>
                    <button
                      type="button"
                      className={styles['sell']}
                      title={`Sell one for ${price}g`}
                      onClick={() => {
                        player.submit({ type: 'sellItems', itemId: stack.item, quantity: 1 });
                      }}
                    >
                      Sell 1
                    </button>
                    <button
                      type="button"
                      className={styles['sell']}
                      title={`Sell all for ${(price * stack.quantity).toLocaleString()}g`}
                      onClick={() => {
                        player.submit({
                          type: 'sellItems',
                          itemId: stack.item,
                          quantity: stack.quantity,
                        });
                      }}
                    >
                      All
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
