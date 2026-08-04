/**
 * Debug overlay (F3). Phase-01.5 deliverable 1.
 *
 * "Negligible performance impact when hidden" is the binding requirement, and
 * it is met structurally: when hidden this component returns null and NO
 * interval is scheduled, so no metric provider is ever called. Hiding it costs
 * exactly what not having it costs.
 *
 * While visible it samples at 4 Hz rather than per frame — the numbers are for
 * a human to read, and sampling every frame would make the diagnostic tool a
 * source of the very cost it is used to diagnose.
 */

import { useEffect, useState, type ReactNode } from 'react';

import type { MetricRegistry, MetricSample } from '../metrics/registry';
import type { Profiler } from '../profiler/profiler';

import styles from './DebugOverlay.module.css';

const SAMPLE_HZ = 4;

export interface DebugOverlayProps {
  readonly visible: boolean;
  readonly metrics: MetricRegistry;
  readonly profiler: Profiler;
}

export function DebugOverlay({ visible, metrics, profiler }: DebugOverlayProps): ReactNode {
  const [samples, setSamples] = useState<readonly MetricSample[]>([]);
  const [timings, setTimings] = useState<ReturnType<Profiler['stats']>>([]);

  useEffect(() => {
    if (!visible) return;

    const read = (): void => {
      setSamples(metrics.sample());
      setTimings(profiler.stats());
    };

    read();
    const handle = setInterval(read, 1000 / SAMPLE_HZ);
    return () => {
      clearInterval(handle);
    };
  }, [visible, metrics, profiler]);

  if (!visible) return null;

  const groups = [...new Set(samples.map((sample) => sample.group))];

  return (
    <div className={styles['overlay']} data-testid="debug-overlay">
      {groups.map((group) => (
        <section key={group} className={styles['group']}>
          <h2 className={styles['heading']}>{group}</h2>
          {samples
            .filter((sample) => sample.group === group)
            .map((sample) => (
              <div key={sample.id} className={styles['row']}>
                <span className={styles['label']}>{sample.label}</span>
                <span className={styles['value']}>{sample.value}</span>
              </div>
            ))}
        </section>
      ))}

      {timings.length > 0 && (
        <section className={styles['group']}>
          <h2 className={styles['heading']}>Profiler</h2>
          {timings.map((stat) => (
            <div key={stat.name} className={styles['row']}>
              <span className={styles['label']}>{stat.name}</span>
              <span className={styles['value']}>
                {stat.mean.toFixed(2)} / {stat.p95.toFixed(2)} ms
              </span>
            </div>
          ))}
        </section>
      )}

      <p className={styles['hint']}>F3 overlay · F1 console · F4 inspector · F2 events</p>
    </div>
  );
}
