/**
 * The coin readout. Phase-06e, crit 18.
 *
 * React renders this component ONLY when the wallet slice changes — a handful
 * of times a minute at most. The count-up between old and new balance is one
 * rAF tween writing `textContent` directly, so the animation never re-renders
 * the tree per frame (the phase doc's "CSS or one rAF component — never a
 * 20 Hz re-render", chosen as the rAF form because a numeric tween cannot be
 * expressed in CSS alone).
 */

import { useEffect, useRef, type ReactNode } from 'react';

import { useGain } from '../hooks/use-gain';
import { useSlice } from '../hooks/use-slice';

import { AtlasSprite } from './ItemIcon';
import styles from './StatusBar.module.css';

/** Tween length. Short enough to feel immediate, long enough to read as motion. */
const TWEEN_MS = 400;

export function CoinCounter(): ReactNode {
  const wallet = useSlice('wallet');
  // The §7.5 coin popup: sales happen while the player is looking elsewhere,
  // so the amount is worth stating once rather than leaving them to infer it
  // from a balance that quietly moved.
  const gain = useGain(wallet.coins);
  const readout = useRef<HTMLSpanElement>(null);
  /** The value currently painted, which the next tween starts from. */
  const shown = useRef(wallet.coins);

  useEffect(() => {
    const target = wallet.coins;
    const from = shown.current;
    if (from === target) return undefined;

    const started = performance.now();
    let handle = 0;
    const step = (now: number): void => {
      const progress = Math.min(1, (now - started) / TWEEN_MS);
      // Ease-out: fast start, settling landing — reads as "counting", not "sliding".
      const eased = 1 - (1 - progress) * (1 - progress);
      const value = Math.round(from + (target - from) * eased);
      shown.current = value;
      if (readout.current !== null) readout.current.textContent = value.toLocaleString();
      if (progress < 1) handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(handle);
      // Land exactly on the target so an interrupted tween never lies.
      shown.current = target;
      if (readout.current !== null) readout.current.textContent = target.toLocaleString();
    };
  }, [wallet.coins]);

  return (
    <>
      <span className={styles['coins']} title="Coins">
        <AtlasSprite frameName="icon_status_coin.png" size={16} />
        <span ref={readout} className={styles['coinValue']}>
          {shown.current.toLocaleString()}
        </span>
      </span>
      {/*
        A SIBLING of the readout, not a child of it, for two reasons that both
        turned up as real failures:

        - Nested, its text joined the coin element's, so anything reading the
          balance saw "1,240+12".
        - It is a visual echo of a number already on screen and already
          updating, so `aria-hidden` is correct — announcing the delta as well
          is duplicate chatter, and it collided with the companion toast's
          own `role="status"`.

        Absolutely positioned and pointer-transparent, so it can neither
        reflow the bar nor intercept a click on it.
      */}
      {gain > 0 && (
        <span className={styles['coinGain']} aria-hidden="true" data-testid="coin-gain">
          +{gain.toLocaleString()}
        </span>
      )}
    </>
  );
}
