/**
 * The day and its phase, in the status bar. Phase-10b — ADR-020 §3.
 *
 * The `time` slice's consumer. It exists in the same commit as the slice
 * because a slice nothing reads is the projection equivalent of an event with
 * no subscriber — machinery for an imagined need (`AI_RULES.md` §1.5), and the
 * republish discipline it is built around would be untested in practice.
 *
 * Its own component rather than markup inside `StatusBar` for the reason the
 * slice is its own slice: `StatusBar` re-renders every second on the uptime
 * readout, and subscribing to `time` from here means the phase label re-renders
 * four times a day instead of 86,400.
 *
 * THE LABEL LIVES HERE, NOT IN THE SIMULATION. The sim publishes `'dusk'`; what
 * a player reads is presentation, and ADR-020 §4 keeps that mapping on this
 * side of the boundary — the same rule that keeps the phase→tint mapping out of
 * `src/sim`.
 */

import { DayPhase } from '../../../sim/time/game-clock';
import { useSlice } from '../hooks/use-slice';

import styles from './StatusBar.module.css';

const PHASE_LABELS: Record<DayPhase, string> = {
  [DayPhase.Dawn]: 'Dawn',
  [DayPhase.Day]: 'Day',
  [DayPhase.Dusk]: 'Dusk',
  [DayPhase.Night]: 'Night',
};

export function DayReadout(): React.JSX.Element {
  const time = useSlice('time');

  return (
    <span className={styles['readout']} title="In-game day and time of day">
      {/* Days count from zero internally — the tick is the source of truth
          (ADR-020 §1) — and are shown from one, because no player has ever
          spent a "day 0" on a farm. */}
      Day {time.day + 1} · {PHASE_LABELS[time.phase]}
    </span>
  );
}
