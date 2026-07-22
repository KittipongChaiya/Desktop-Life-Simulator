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

import styles from './StatusBar.module.css';

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => n.toString().padStart(2, '0');

  return hours > 0
    ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export function StatusBar(): ReactNode {
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

      <span className={styles['muted']} title="Workers hired">
        {workers.length} {workers.length === 1 ? 'worker' : 'workers'}
      </span>

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
