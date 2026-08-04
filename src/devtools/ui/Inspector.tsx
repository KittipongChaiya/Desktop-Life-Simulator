/**
 * World inspector (F4). Phase-01.5 deliverable 4; pinning and sampling 07.8c.
 *
 * Renders whatever providers return for whatever is under the pointer. It knows
 * nothing about tiles or entities — phase-02 and phase-04 register providers and
 * this component picks them up with no change.
 *
 * IT SAMPLES ON A TIMER RATHER THAN ON POINTER MOVEMENT. Reading only on
 * `pointermove` made every value a screenshot of the instant the pointer last
 * moved: hold still over a ripening crop and it stayed "growing" forever. The
 * pointer position is now kept in a ref (moving the mouse must not re-render a
 * panel four times a second on its own) and the reading is taken at 4 Hz, the
 * same rate the debug overlay uses and for the same reason — the numbers are
 * for a human to read.
 *
 * THE COST OF THAT IS BOUNDED. A reading is committed only when it differs
 * from the last one (`sectionsEqual`), so a still world re-renders nothing:
 * React bails out when `setState` returns the object it already holds. A panel
 * that repainted regardless would be the defect ADR-018 §8 names.
 *
 * PINNING fixes WHICH tile is read, not WHAT it said — the sampler keeps
 * running, so a pinned tile stays live.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { sectionsEqual, type InspectorRegistry, type InspectSection } from '../inspector/registry';

import styles from './Inspector.module.css';

const SAMPLE_HZ = 4;

/** One reading: the target it was taken at, and what the providers said. */
interface Reading {
  readonly x: number;
  readonly y: number;
  readonly sections: readonly InspectSection[];
}

const NOTHING: Reading = { x: 0, y: 0, sections: [] };

function readingEquals(a: Reading, b: Reading): boolean {
  return a.x === b.x && a.y === b.y && sectionsEqual(a.sections, b.sections);
}

/**
 * True when a keystroke belongs to something being typed into.
 *
 * The developer console is a text input one keypress away (F1), and a global
 * "p" would be swallowed from it — the defect `App.tsx` records for Space,
 * where `tick 40` arrived as `tick40`.
 */
function isTyping(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

export interface InspectorProps {
  readonly visible: boolean;
  readonly registry: InspectorRegistry;
}

export function Inspector({ visible, registry }: InspectorProps): ReactNode {
  const [reading, setReading] = useState<Reading>(NOTHING);
  const [pinned, setPinned] = useState(false);
  const pointer = useRef({ x: 0, y: 0 });

  // Pointer tracking writes to a ref, not to state: the pointer moves far more
  // often than the panel's contents change, and a re-render per move would
  // make the inspector cost more than the thing it is inspecting. While
  // pinned the listener is not attached at all, which is what freezes the
  // target — the sampler below then keeps reading that same tile.
  useEffect(() => {
    if (!visible || pinned) return;

    const onPointerMove = (event: PointerEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };

    window.addEventListener('pointermove', onPointerMove);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [visible, pinned]);

  useEffect(() => {
    if (!visible) return;

    const read = (): void => {
      const { x, y } = pointer.current;
      const next: Reading = { x, y, sections: registry.inspect({ kind: 'pointer', x, y }) };
      setReading((previous) => (readingEquals(previous, next) ? previous : next));
    };

    read();
    const handle = setInterval(read, 1000 / SAMPLE_HZ);
    return () => {
      clearInterval(handle);
    };
  }, [visible, registry]);

  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'p' && event.key !== 'P') return;
      if (isTyping()) return;

      event.preventDefault();
      setPinned((value) => !value);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={styles['inspector']} data-testid="inspector">
      <h2 className={styles['heading']} data-testid="inspector-heading">
        Inspector · {reading.x},{reading.y}
        {pinned && <span className={styles['pin']}> · PINNED</span>}
      </h2>

      {reading.sections.length === 0 ? (
        <p className={styles['empty']}>Nothing inspectable under the pointer.</p>
      ) : (
        reading.sections.map((section) => (
          <section key={section.title} className={styles['section']}>
            <h3 className={styles['sectionTitle']}>{section.title}</h3>
            {section.fields.map((f) => (
              <div key={f.label} className={styles['row']}>
                <span className={styles['label']}>{f.label}</span>
                <span className={styles['value']}>{f.value}</span>
              </div>
            ))}
          </section>
        ))
      )}

      <p className={styles['hint']}>P to {pinned ? 'unpin' : 'pin'}</p>
    </div>
  );
}
