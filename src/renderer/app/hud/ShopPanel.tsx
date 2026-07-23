/**
 * Shop panel. Phase-06e — where coins leave the farm.
 *
 * Three sections mirroring the §6.4 sinks: seeds (recurring), buildings
 * (one-time), land (escalating). Every price comes from a slice or static
 * content data — never a world reference — and every purchase is an ordinary
 * player command; affordability merely disables buttons the validator would
 * reject anyway (ADR-010 §6).
 *
 * The seed rows double as the SEED SELECTOR: the icon button chooses what the
 * seed tool plants (presentation state — `SeedSelection`), the buy buttons
 * spend coins. Prices for seeds are fixed (§3.1); a depressed PRODUCE price
 * shows in the sell interface, not here — buying never fluctuates.
 */

import { CORE_BUILDINGS } from '@sim/content/buildings';
import { CORE_CARROT, CORE_PUMPKIN, CORE_TURNIP, CORE_WHEAT } from '@sim/content/crops';
import { useState, useSyncExternalStore, type ReactNode } from 'react';

import type { ContentId } from '../../../shared/ids';
import { useSlice } from '../hooks/use-slice';
import { usePlacement, usePlayer, useSeeds } from '../store-context';

import { ItemIcon } from './ItemIcon';
import styles from './ShopPanel.module.css';

/** The §3.1 crops, in table order, with their seed items. */
const CROPS: readonly {
  readonly crop: ContentId;
  readonly seedItem: string;
  readonly name: string;
}[] = [
  { crop: CORE_TURNIP, seedItem: 'core:turnip_seed', name: 'Turnip' },
  { crop: CORE_WHEAT, seedItem: 'core:wheat_seed', name: 'Wheat' },
  { crop: CORE_CARROT, seedItem: 'core:carrot_seed', name: 'Carrot' },
  { crop: CORE_PUMPKIN, seedItem: 'core:pumpkin_seed', name: 'Pumpkin' },
];

export function ShopPanel(): ReactNode {
  const wallet = useSlice('wallet');
  const economy = useSlice('economy');
  const player = usePlayer();
  const placement = usePlacement();
  const seeds = useSeeds();
  const [open, setOpen] = useState(false);

  const armed = useSyncExternalStore(
    (listener) => placement.subscribe(listener),
    () => placement.active(),
    () => placement.active(),
  );
  const selectedSeed = useSyncExternalStore(
    (listener) => seeds.subscribe(listener),
    () => seeds.selected(),
    () => seeds.selected(),
  );

  /** Fixed seed price — the seed item's base price IS the §3.1 cost. */
  const seedPrice = (seedItem: string): number =>
    economy.prices.find((price) => price.item === seedItem)?.basePrice ?? 0;

  return (
    <div className={styles['container']} data-interactive data-testid="shop">
      <button
        type="button"
        className={styles['toggle']}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Shop
      </button>

      {open && (
        <div className={styles['panel']}>
          <div className={styles['section']}>Seeds</div>
          {CROPS.map(({ crop, seedItem, name }) => {
            const price = seedPrice(seedItem);
            const selected = selectedSeed === crop;
            return (
              <div key={crop} className={styles['row']}>
                <button
                  type="button"
                  className={selected ? styles['seedSelected'] : styles['seedSelect']}
                  aria-pressed={selected}
                  title={`Plant ${name.toLowerCase()} with the seed tool`}
                  onClick={() => seeds.select(crop)}
                >
                  <ItemIcon item={seedItem} size={24} />
                </button>
                <span className={styles['name']}>{name}</span>
                <span className={styles['price']}>{price}g</span>
                {[1, 10].map((quantity) => {
                  const cost = price * quantity;
                  const affordable = wallet.coins >= cost;
                  return (
                    <button
                      key={quantity}
                      type="button"
                      className={affordable ? styles['buy'] : styles['buyDisabled']}
                      disabled={!affordable}
                      title={affordable ? `${cost}g` : `Needs ${cost}g`}
                      onClick={() => {
                        player.submit({ type: 'buySeeds', cropId: crop, quantity });
                      }}
                    >
                      +{quantity}
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div className={styles['section']}>Buildings</div>
          {CORE_BUILDINGS.map((building) => {
            const affordable = wallet.coins >= building.cost;
            const placing = armed === building.id;
            return (
              <div key={building.id} className={styles['row']}>
                <span className={styles['name']}>{building.displayName}</span>
                <span className={styles['price']}>{building.cost.toLocaleString()}g</span>
                <button
                  type="button"
                  className={
                    placing
                      ? styles['buildActive']
                      : affordable
                        ? styles['buy']
                        : styles['buyDisabled']
                  }
                  disabled={!affordable && !placing}
                  aria-pressed={placing}
                  // A STABLE accessible name across states: the visible text
                  // flips to "Placing…" when armed, and a name that changed
                  // with it would make the button unfindable mid-flow (found
                  // by the placement E2E re-resolving onto the wrong row).
                  aria-label={`Build ${building.displayName}`}
                  onClick={() => placement.toggle(building.id)}
                >
                  {placing ? 'Placing…' : 'Build'}
                </button>
              </div>
            );
          })}

          <div className={styles['section']}>Land</div>
          <div className={styles['row']}>
            <span className={styles['name']}>
              Expand plot{' '}
              <span className={styles['muted']}>({economy.expansionsPurchased} bought)</span>
            </span>
            {economy.nextExpansionCost === null ? (
              <span className={styles['muted']}>At maximum</span>
            ) : (
              <>
                <span className={styles['price']}>
                  {economy.nextExpansionCost.toLocaleString()}g
                </span>
                <button
                  type="button"
                  className={
                    wallet.coins >= economy.nextExpansionCost
                      ? styles['buy']
                      : styles['buyDisabled']
                  }
                  disabled={wallet.coins < economy.nextExpansionCost}
                  onClick={() => {
                    player.submit({ type: 'expandLand' });
                  }}
                >
                  Expand
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
