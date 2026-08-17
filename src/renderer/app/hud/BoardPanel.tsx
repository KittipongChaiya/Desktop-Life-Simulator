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

/** The tiers, worded for the panel (ADR-034 §1). */
const STANDING_LABEL = {
  newcomer: 'Newcomer',
  friend: 'Friend of the town',
  pillar: 'Pillar of the town',
} as const;

/** What a locked slot says instead of Accept (ADR-034 §2). */
const LOCKED_LABEL = {
  newcomer: '',
  friend: 'for friends of the town',
  pillar: 'for pillars of the town',
} as const;

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
          <div className={styles['muted']} data-testid="standing">
            Your name in town: {STANDING_LABEL[contracts.standing]}
            {contracts.nextStandingAt !== null &&
              ` · next at ${String(contracts.nextStandingAt)} delivered`}
          </div>

          <div className={styles['section']}>Today’s requests</div>
          {contracts.offers.length === 0 && <div className={styles['muted']}>A quiet day.</div>}
          {contracts.offers.map((offer) => (
            <div key={offer.offerId} className={styles['row']}>
              <ItemIcon item={offer.item} size={24} />
              <span className={styles['name']}>
                {offer.requesterName} asks for {offer.quantity} {offer.itemName.toLowerCase()}
                <span className={styles['muted']}> · by day {offer.dueDay}</span>
              </span>
              {offer.locked ? (
                // Visible but not acceptable (ADR-034 §2): the player sees
                // what the town would ask of a proven name.
                <span
                  className={styles['lock']}
                  title="Deliver more contracts and the town will trust you with this."
                >
                  {LOCKED_LABEL[offer.requiredStanding]}
                </span>
              ) : offer.accepted ? (
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

          <div className={styles['section']}>Town milestones</div>
          {contracts.questChains.map((chain) => (
            <div key={chain.id} className={styles['row']}>
              <span className={styles['name']}>
                {chain.displayName}
                {chain.objective === null ? (
                  <span className={styles['muted']}> · all done ✓</span>
                ) : (
                  <span className={styles['muted']}>
                    {' '}
                    · {chain.objective} — {chain.progress}/{chain.threshold} · {chain.rewardCoins}g
                  </span>
                )}
              </span>
            </div>
          ))}

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
