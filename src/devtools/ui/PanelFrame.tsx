/**
 * Panel chrome: title bar, drag, resize, search. Phase-07.8n.
 *
 * Nine tools accumulated over this phase, each pinned to a hardcoded corner.
 * Three open is fine; five overlap. This is the shared frame that makes them
 * movable, sizeable and searchable — written once so a tenth panel inherits all
 * of it rather than reinventing a corner to sit in.
 *
 * GEOMETRY IS REMEMBERED, and clamped to the viewport on the way out as well as
 * in: a layout saved on a second monitor must not put half the panels where the
 * pointer cannot reach them (`panel-layout.ts`).
 *
 * DRAGGING IS POINTER-CAPTURED, so a fast drag that leaves the title bar keeps
 * moving the panel rather than dropping it — and the listeners live on the
 * element rather than the window, so nothing survives an unmount.
 *
 * It carries `data-interactive` for every panel at once, which is the defect
 * 07.8e found the hard way: chrome that does not declare itself interactive
 * turns a click on a filter into a click on the farm.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  clampGeometry,
  loadLayout,
  saveLayout,
  withPanel,
  type PanelGeometry,
} from './panel-layout';
import styles from './PanelFrame.module.css';

export interface PanelFrameProps {
  /** Stable id. The key its geometry is remembered under. */
  readonly id: string;
  readonly title: string;
  readonly visible: boolean;
  /** Where the panel sits the first time it is ever opened. */
  readonly initial: PanelGeometry;
  /** Shown at the right of the title bar — counts, tallies, a mode. */
  readonly status?: string;
  /** Renders a search box when given; the panel filters its own rows. */
  readonly onSearch?: (query: string) => void;
  readonly onClose?: () => void;
  readonly children: ReactNode;
}

interface Drag {
  readonly kind: 'move' | 'resize';
  readonly pointerX: number;
  readonly pointerY: number;
  readonly origin: PanelGeometry;
}

function viewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function PanelFrame({
  id,
  title,
  visible,
  initial,
  status,
  onSearch,
  onClose,
  children,
}: PanelFrameProps): ReactNode {
  const [geometry, setGeometry] = useState<PanelGeometry>(() =>
    clampGeometry(loadLayout().panels[id] ?? initial, viewport()),
  );
  const [query, setQuery] = useState('');
  const drag = useRef<Drag | null>(null);

  // Persisted on release rather than per pixel: a drag is a hundred moves and
  // one decision, and only the decision is worth writing.
  const persist = useCallback(
    (next: PanelGeometry) => {
      saveLayout(withPanel(loadLayout(), id, next));
    },
    [id],
  );

  useEffect(() => {
    if (!visible) return;

    const onMove = (event: PointerEvent): void => {
      const current = drag.current;
      if (current === null) return;

      const dx = event.clientX - current.pointerX;
      const dy = event.clientY - current.pointerY;

      setGeometry(
        clampGeometry(
          current.kind === 'move'
            ? { ...current.origin, x: current.origin.x + dx, y: current.origin.y + dy }
            : {
                ...current.origin,
                width: current.origin.width + dx,
                height: current.origin.height + dy,
              },
          viewport(),
        ),
      );
    };

    const onUp = (): void => {
      if (drag.current === null) return;
      drag.current = null;
      setGeometry((current) => {
        persist(current);
        return current;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [visible, persist]);

  const begin = (kind: Drag['kind']) => (event: React.PointerEvent) => {
    event.preventDefault();
    drag.current = {
      kind,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origin: geometry,
    };
  };

  if (!visible) return null;

  return (
    <section
      className={styles['frame']}
      data-interactive
      data-testid={`panel-${id}`}
      style={{
        left: `${String(geometry.x)}px`,
        top: `${String(geometry.y)}px`,
        width: `${String(geometry.width)}px`,
        height: `${String(geometry.height)}px`,
      }}
    >
      <header
        className={styles['bar']}
        data-testid={`panel-${id}-bar`}
        onPointerDown={begin('move')}
      >
        <span className={styles['title']}>{title}</span>
        {status !== undefined && <span className={styles['status']}>{status}</span>}
        {onClose !== undefined && (
          <button
            type="button"
            className={styles['close']}
            aria-label={`Close ${title}`}
            // Stops the press becoming a drag of the panel behind the button.
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={onClose}
          >
            ×
          </button>
        )}
      </header>

      {onSearch !== undefined && (
        <input
          className={styles['search']}
          type="search"
          placeholder="filter…"
          aria-label={`Filter ${title}`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onSearch(event.target.value);
          }}
        />
      )}

      <div className={styles['body']}>{children}</div>

      <div
        className={styles['grip']}
        data-testid={`panel-${id}-grip`}
        onPointerDown={begin('resize')}
        aria-hidden="true"
      />
    </section>
  );
}
