/**
 * "Something just went up" — the shared feedback primitive. Phase-07.5b.
 *
 * Two surfaces need the same answer: the coin readout wants to show `+12`
 * when a sale lands, and the inventory button wants to flash when goods
 * arrive. Both are the question "how much did this value just increase, and
 * was it recently enough to still be showing?" — asked once, here, rather
 * than reimplemented per panel with its own subtly different timing.
 *
 * Returns the SIZE of the increase, not a boolean, so a caller can render the
 * number (the coin popup) or ignore it and render a flash (the inventory
 * button) without a second hook.
 *
 * Decreases are deliberately silent. Spending coins and consuming seeds are
 * things the player did on purpose; the feedback here is for value ARRIVING,
 * which is the part that happens while they are looking elsewhere.
 */

import { useEffect, useRef, useState } from 'react';

/** How long a gain stays visible. Matches the world effects' register. */
export const GAIN_VISIBLE_MS = 1_400;

/**
 * The most recent increase in `value`, or 0 when nothing recent.
 *
 * The timer restarts on each new gain, so a run of sales reads as one
 * continuous acknowledgement rather than a stutter of restarts.
 */
export function useGain(value: number): number {
  const previous = useRef(value);
  const [gain, setGain] = useState(0);

  useEffect(() => {
    const delta = value - previous.current;
    previous.current = value;
    if (delta <= 0) return undefined;

    setGain(delta);
    const timer = setTimeout(() => setGain(0), GAIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return gain;
}
