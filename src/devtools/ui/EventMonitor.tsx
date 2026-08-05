/**
 * Event monitor (F2). Phase-07.8e, ADR-018 §10.
 *
 * SUBSCRIBES, never polls. `useSyncExternalStore` over the ring's own listener
 * means this re-renders exactly when an event is observed and at no other time
 * — the ring's entries change identity only when its contents do. A timer here
 * would repaint four times a second through an idle farm, which is the defect
 * ADR-018 §8 names and criterion 9 forbids.
 *
 * The panel only READS. Filtering hides rows; it does not stop the observer, so
 * turning a type off never costs you the history you were about to want.
 *
 * `data-interactive` IS LOAD-BEARING, not decoration. Two systems ask the DOM
 * that question: the window's hit test keeps the mouse over such an element
 * rather than passing it to the desktop (`app/hit-test.ts`), and the world's
 * pointer handling refuses to treat a press that started over one as a tile
 * action (`bootstrap/pointer-actions.ts`). Without it, clicking a filter chip
 * with a tool armed TILLS THE TILE BEHIND THE PANEL — a debug tool changing
 * the world by accident, which is the whole of what ADR-018 §2 forbids.
 */

import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';

import { OBSERVED_EVENTS } from '../events/observer';
import type { EventRing } from '../events/ring';

import styles from './EventMonitor.module.css';
import { PanelFrame } from './PanelFrame';

/** Where it opens the first time. Moved and remembered thereafter (07.8n). */
const INITIAL = { x: 8, y: 34, width: 430, height: 180 };

export interface EventMonitorProps {
  readonly visible: boolean;
  readonly ring: EventRing;
  readonly onClose?: () => void;
}

export function EventMonitor({ visible, ring, onClose }: EventMonitorProps): ReactNode {
  const [muted, setMuted] = useState<readonly string[]>([]);
  const [query, setQuery] = useState('');

  const subscribe = useCallback((onChange: () => void) => ring.subscribe(onChange), [ring]);
  const getEntries = useCallback(() => ring.entries(), [ring]);
  const entries = useSyncExternalStore(subscribe, getEntries, getEntries);

  const toggle = (name: string): void => {
    setMuted((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name],
    );
  };

  const needle = query.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      !muted.includes(entry.name) &&
      (needle === '' ||
        entry.name.toLowerCase().includes(needle) ||
        entry.summary.toLowerCase().includes(needle)),
  );

  return (
    <PanelFrame
      id="events"
      title="Events"
      visible={visible}
      initial={INITIAL}
      status={`${String(ring.observed())} observed · ${String(entries.length)} kept · ${String(shown.length)} shown`}
      onSearch={setQuery}
      {...(onClose === undefined ? {} : { onClose })}
    >
      <div className={styles['monitor']} data-testid="event-monitor">
        <div className={styles['filters']}>
          {OBSERVED_EVENTS.map((name) => (
            <button
              key={name}
              type="button"
              className={muted.includes(name) ? styles['chipMuted'] : styles['chip']}
              onClick={() => {
                toggle(name);
              }}
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            className={styles['chip']}
            onClick={() => {
              ring.clear();
            }}
          >
            Clear
          </button>
        </div>

        {shown.length === 0 ? (
          <p className={styles['empty']}>No events observed yet.</p>
        ) : (
          <ol className={styles['list']}>
            {[...shown].reverse().map((entry) => (
              <li key={entry.seq} className={styles['row']} data-testid="event-row">
                <span className={styles['tick']}>t{entry.tick}</span>
                <span className={styles['name']}>{entry.name}</span>
                <span className={styles['summary']}>{entry.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </PanelFrame>
  );
}
