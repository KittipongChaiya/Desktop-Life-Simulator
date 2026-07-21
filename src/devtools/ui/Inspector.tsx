/**
 * World inspector (F4). Phase-01.5 deliverable 4.
 *
 * Renders whatever providers return for whatever is under the pointer. It knows
 * nothing about tiles or entities — phase-02 and phase-04 register providers and
 * this component picks them up with no change.
 */

import { useEffect, useState, type ReactNode } from 'react';

import type { InspectorRegistry, InspectSection } from '../inspector/registry';

import styles from './Inspector.module.css';

export interface InspectorProps {
  readonly visible: boolean;
  readonly registry: InspectorRegistry;
}

export function Inspector({ visible, registry }: InspectorProps): ReactNode {
  const [sections, setSections] = useState<readonly InspectSection[]>([]);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!visible) return;

    const onPointerMove = (event: PointerEvent): void => {
      setPosition({ x: event.clientX, y: event.clientY });
      setSections(registry.inspect({ kind: 'pointer', x: event.clientX, y: event.clientY }));
    };

    window.addEventListener('pointermove', onPointerMove);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [visible, registry]);

  if (!visible) return null;

  return (
    <div className={styles['inspector']} data-testid="inspector">
      <h2 className={styles['heading']}>
        Inspector · {position.x},{position.y}
      </h2>

      {sections.length === 0 ? (
        <p className={styles['empty']}>Nothing inspectable under the pointer.</p>
      ) : (
        sections.map((section) => (
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
    </div>
  );
}
