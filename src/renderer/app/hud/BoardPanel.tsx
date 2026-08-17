/**
 * The notice board panel. Phase-20 — ADR-032.
 *
 * Where the world asks. Today's offers with Accept, the active docket with
 * live "held / wanted" progress and Deliver, and the two counters. Every
 * number comes from the `contracts` slice; every action is an ordinary
 * player command — buttons disable where the validator would reject anyway
 * (ADR-010 §6), and a full docket says so in words rather than a dead
 * button alone.
 */

import { useState, type ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';
import { usePlayer } from '../store-context';

import styles from './BoardPanel.module.css';
import { ItemIcon } from './ItemIcon';

export function BoardPanel(): ReactNode {
  const contracts = useSlice('contracts');
  const player = usePlayer();
  const [open, setOpen] = useState(false);

  const badge = contracts.active.length > 0 ? ` · ${String(contracts.active.length)}` : '';

  return (
    <div className={styles['container']} data-interactive data-testid="board">
      <button
        type="button"
        className={styles['toggle']}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Board{badge}
      </button>

      {open && (
        <div className={styles['panel']}>
          <div className={styles['section']}>Today’s requests</div>
          {contracts.offers.length === 0 && <div className={styles['muted']}>A quiet day.</div>}
          {contracts.offers.map((offer) => (
            <div key={offer.offerId} className={styles['row']}>
              <ItemIcon item={offer.item} size={24} />
              <span className={styles['name']}>
                {offer.requesterName} asks for {offer.quantity} {offer.itemName.toLowerCase()}
                <span className={styles['muted']}> · by day {offer.dueDay}</span>
              </span>
              {offer.accepted ? (
                <span className={styles['muted']}>accepted</span>
              ) : (
                <button
                  type="button"
                  className={contracts.docketFull ? styles['buyDisabled'] : styles['buy']}
                  disabled={contracts.docketFull}
                  onClick={() => player.submit({ type: 'acceptContract', offerId: offer.offerId })}
                >
                  Accept · {offer.rewardCoins}g
                </button>
              )}
            </div>
          ))}
          {contracts.docketFull && (
            <div className={styles['muted']}>Your docket is full — deliver one first.</div>
          )}

          <div className={styles['section']}>Promised</div>
          {contracts.active.length === 0 && (
            <div className={styles['muted']}>Nothing promised yet.</div>
          )}
          {contracts.active.map((contract) => {
            const ready = contract.held >= contract.quantity;
            return (
              <div key={contract.offerId} className={styles['row']}>
                <ItemIcon item={contract.item} size={24} />
                <span className={styles['name']}>
                  {contract.held} / {contract.quantity} {contract.itemName.toLowerCase()}
                  <span className={styles['muted']}>
                    {' '}
                    · {contract.requesterName} · by day {contract.dueDay}
                  </span>
                </span>
                {contract.fulfilled ? (
                  <span className={styles['muted']}>delivered ✓</span>
                ) : (
                  <button
                    type="button"
                    className={ready ? styles['buy'] : styles['buyDisabled']}
                    disabled={!ready}
                    onClick={() =>
                      player.submit({ type: 'deliverContract', offerId: contract.offerId })
                    }
                  >
                    Deliver · {contract.rewardCoins}g
                  </button>
                )}
              </div>
            );
          })}

          {(contracts.fulfilled > 0 || contracts.expired > 0) && (
            <div className={styles['muted']}>
              {contracts.fulfilled} fulfilled · {contracts.expired} missed
            </div>
          )}
        </div>
      )}
    </div>
  );
}
