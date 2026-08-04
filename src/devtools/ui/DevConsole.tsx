/**
 * Developer console (F1). Phase-01.5 deliverable 2.
 *
 * A thin view over `ConsoleEngine` — history, auto-complete, and dispatch all
 * live in the engine so they are testable without a DOM. This component only
 * translates keystrokes into engine calls and renders the result.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type { ConsoleEngine } from '../console/engine';
import { OutputKind } from '../console/registry';

import styles from './DevConsole.module.css';

export interface DevConsoleProps {
  readonly visible: boolean;
  readonly engine: ConsoleEngine;
  readonly onClose: () => void;
}

export function DevConsole({ visible, engine, onClose }: DevConsoleProps): ReactNode {
  const [input, setInput] = useState('');
  const [, forceRender] = useState(0);
  const [hint, setHint] = useState<readonly string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    forceRender((n) => n + 1);
  }, []);

  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    // Keep the newest output in view.
    if (visible && outputRef.current !== null) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  });

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'Enter': {
        event.preventDefault();
        engine.execute(input);
        setInput('');
        setHint([]);
        refresh();
        break;
      }

      case 'ArrowUp': {
        event.preventDefault();
        const previous = engine.historyPrevious();
        if (previous !== null) setInput(previous);
        break;
      }

      case 'ArrowDown': {
        event.preventDefault();
        const next = engine.historyNext();
        if (next !== null) setInput(next);
        break;
      }

      case 'Tab': {
        event.preventDefault();
        const { completed, candidates } = engine.complete(input);
        setInput(completed);
        setHint(candidates.length > 1 ? candidates : []);
        break;
      }

      case 'Escape': {
        event.preventDefault();
        onClose();
        break;
      }

      default:
        break;
    }
  };

  if (!visible) return null;

  return (
    <div className={styles['console']} data-interactive data-testid="dev-console">
      <div className={styles['output']} ref={outputRef}>
        {engine.output().map((line, index) => (
          <div
            // Output is append-only and never reordered, so index is a stable
            // identity here.
            key={`${String(index)}-${line.text}`}
            className={styles[kindClass(line.kind)]}
          >
            {line.text}
          </div>
        ))}
      </div>

      {hint.length > 0 && <div className={styles['hint']}>{hint.join('   ')}</div>}

      <div className={styles['inputRow']}>
        <span className={styles['prompt']}>&gt;</span>
        <input
          ref={inputRef}
          className={styles['input']}
          value={input}
          spellCheck={false}
          autoComplete="off"
          aria-label="Developer console input"
          onChange={(event) => {
            setInput(event.target.value);
            engine.resetHistoryCursor();
          }}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}

function kindClass(kind: OutputKind): string {
  switch (kind) {
    case OutputKind.Input:
      return 'lineInput';
    case OutputKind.Error:
      return 'lineError';
    case OutputKind.Info:
      return 'lineInfo';
    default:
      return 'lineResult';
  }
}
