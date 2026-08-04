/**
 * Time controls (F6). Phase-07.8g, ADR-018 §8.
 *
 * DELIBERATELY THIN. Pause, resume, step and a validated time scale all live on
 * the loop and always have; the scale simply was not declared on
 * `SimulationControl`, so no panel could reach it. This adds no scheduling of
 * its own — every button calls the control the loop already exposes, so a
 * scaled run visits exactly the same tick states as an unscaled one.
 *
 * IT SAMPLES, because something else can change what it displays: the console
 * has had `pause` and `resume` since phase-01.5, and a panel showing "running"
 * because it was not the one that pressed the button is worse than no panel.
 * 4 Hz while OPEN, the overlay's rate, and a reading is committed only when it
 * differs — so a paused world leaves the panel completely still.
 */

import { useEffect, useState, type ReactNode } from 'react';

import type { SimulationControl } from '../../shared/simulation-control';

import styles from './TimeControls.module.css';

const SAMPLE_HZ = 4;

/** The scales the panel offers. `GAME_DESIGN`-free: a development range only. */
const SCALES: readonly number[] = [1, 2, 4, 8, 16];

/** Step sizes: one tick to inspect a transition, ten to cross a short action. */
const STEPS: readonly number[] = [1, 10];

interface Reading {
  readonly paused: boolean;
  readonly scale: number;
  readonly tick: number;
}

function readingEquals(a: Reading, b: Reading): boolean {
  return a.paused === b.paused && a.scale === b.scale && a.tick === b.tick;
}

export interface TimeControlsProps {
  readonly visible: boolean;
  readonly simulation: SimulationControl;
}

export function TimeControls({ visible, simulation }: TimeControlsProps): ReactNode {
  const [reading, setReading] = useState<Reading>({ paused: false, scale: 1, tick: 0 });

  useEffect(() => {
    if (!visible) return;

    const read = (): void => {
      const next: Reading = {
        paused: simulation.isPaused(),
        scale: simulation.timeScale(),
        tick: simulation.tick(),
      };
      setReading((previous) => (readingEquals(previous, next) ? previous : next));
    };

    read();
    const handle = setInterval(read, 1000 / SAMPLE_HZ);
    return () => {
      clearInterval(handle);
    };
  }, [visible, simulation]);

  if (!visible) return null;

  return (
    <div className={styles['panel']} data-interactive data-testid="time-controls">
      <h2 className={styles['heading']} data-testid="time-controls-heading">
        Time · {reading.paused ? 'paused' : 'running'} · {reading.scale}× · tick{' '}
        {reading.tick.toLocaleString()}
      </h2>

      <div className={styles['row']}>
        <button
          type="button"
          className={styles['button']}
          onClick={() => {
            if (reading.paused) simulation.resume();
            else simulation.pause();
          }}
        >
          {reading.paused ? 'Resume' : 'Pause'}
        </button>

        {STEPS.map((count) => (
          <button
            key={count}
            type="button"
            className={styles['button']}
            onClick={() => {
              simulation.step(count);
            }}
          >
            +{count}
          </button>
        ))}
      </div>

      <div className={styles['row']}>
        {SCALES.map((scale) => (
          <button
            key={scale}
            type="button"
            aria-pressed={reading.scale === scale}
            className={reading.scale === scale ? styles['buttonActive'] : styles['button']}
            onClick={() => {
              simulation.setTimeScale(scale);
            }}
          >
            {scale}×
          </button>
        ))}
      </div>
    </div>
  );
}
