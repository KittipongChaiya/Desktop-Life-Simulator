/**
 * Collapsed-mode status bar.
 *
 * `VISION.md` §2.4 makes collapsed the default state — the game spends roughly
 * 85% of its life here (PERFORMANCE.md §3), so this view has to be genuinely
 * useful rather than a stub.
 *
 * Phase-01 shows uptime and tick count, which prove the simulation is running
 * at rate. Coins, worker count, and next-harvest replace them as those systems
 * land (GAME_DESIGN.md §10.2).
 */

import type { ReactNode } from 'react';

import { useSlice } from '../hooks/use-slice';
import { useOverlay } from '../store-context';

import { CoinCounter } from './CoinCounter';
import styles from './StatusBar.module.css';
import { ToolBar } from './ToolBar';

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => n.toString().padStart(2, '0');

  return hours > 0
    ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export interface StatusBarProps {
  /**
   * The HUD panel toggles — workers, shop, inventory, settings.
   *
   * They live IN the bar rather than floating over it (07.9). Each used to
   * carry its own absolute coordinates, and they collided with each other and
   * with this bar; as flex items they simply cannot. Passed as children rather
   * than imported here so the bar keeps knowing nothing about what a shop is,
   * and so `App` keeps the one rule the bar must not own: panels exist only
   * while the overlay is expanded, and this bar exists either way.
   */
  readonly children?: ReactNode;
}

export function StatusBar({ children }: StatusBarProps): ReactNode {
  const status = useSlice('status');
  const workers = useSlice('workers');
  const overlay = useOverlay();
  const collapsed = overlay.isCollapsed();

  return (
    <div className={styles['bar']}>
      <span className={styles['readout']} title="Simulation uptime">
        {formatUptime(status.uptimeSeconds)}
      </span>

      <span className={styles['muted']} title="Simulation ticks elapsed">
        {status.tick.toLocaleString()} ticks
      </span>

      <CoinCounter />

      {/* GAME_DESIGN.md §10.2's `[tools]` slot (07.5h). Inside the status bar,
          which is already pointer-interactive, and before the collapse toggle
          so the toggle stays the rightmost control. */}
      <ToolBar />

      <span className={styles['muted']} title="Workers hired">
        {workers.length} {workers.length === 1 ? 'worker' : 'workers'}
      </span>

      {/* The panel toggles. Between the readouts and the collapse chevron, in
          the 1,334px this bar had spare. */}
      <div className={styles['panels']}>{children}</div>

      <button
        type="button"
        className={styles['toggle']}
        onClick={() => {
          overlay.toggle();
        }}
        aria-label={collapsed ? 'Expand overlay' : 'Collapse overlay'}
      >
        {collapsed ? '▴' : '▾'}
      </button>
    </div>
  );
}
