/**
 * Content sources, as the player sees them. Phase-09f — ADR-019 §6.
 *
 * The loader has always known why a source did not load; this is the first
 * place that says so out loud. A plugin that vanishes with no explanation is
 * the outcome ADR-019 §6 exists to prevent, and until this existed the reasons
 * were produced, tested, and then dropped on the floor.
 *
 * **Refused sources come first.** A player opening this panel is far more
 * likely to be asking "why is my mod not working" than admiring the list of
 * ones that are, and the answer should not be below a scroll.
 *
 * The toggle DISPATCHES A COMMAND rather than writing state (ADR-010 §1):
 * enablement is world state (ADR-019 §7), so it goes through the same path as
 * every other world mutation and is validated, rejectable, and replayable.
 *
 * `core` has no toggle at all, because it may not be disabled — a world with no
 * crops, items or tile kinds is not a state a player could undo from the very
 * UI that caused it. Rendering a disabled control would invite the click and
 * then refuse it; rendering none says the same thing without the dead end.
 */

import type { SourceReport } from '../source-report';

import styles from './SettingsPanel.module.css';

export interface SourcesSectionProps {
  readonly report: SourceReport;
  /** Sources currently switched off, from world state. */
  readonly disabled?: ReadonlySet<string>;
  /** Dispatches the enablement change. Absent renders the list read-only. */
  readonly onSetEnabled?: (source: string, enabled: boolean) => void;
}

/** Sources the engine refuses to disable, so no toggle is offered for them. */
const UNDISABLEABLE = new Set(['core']);

export function SourcesSection({
  report,
  disabled,
  onSetEnabled,
}: SourcesSectionProps): React.JSX.Element {
  const { installed, refused } = report;
  const off = disabled ?? new Set<string>();

  return (
    <>
      <div className={styles['section']}>Content Sources</div>

      {refused.map((refusal) => (
        <div className={styles['row']} key={`refused-${refusal.source}`}>
          <span className={styles['name']}>{refusal.source}</span>
          {/* The reason IS the feature. "Not loaded" alone sends the player to
              a forum; naming the cause sends them to the fix. */}
          <span role="alert">Not loaded — {refusal.reason}</span>
        </div>
      ))}

      {installed.map((source) => (
        <div className={styles['row']} key={`installed-${source}`}>
          <label className={styles['name']} htmlFor={`source-${source}`}>
            {source}
          </label>
          {onSetEnabled === undefined || UNDISABLEABLE.has(source) ? (
            <span>Loaded</span>
          ) : (
            <input
              id={`source-${source}`}
              type="checkbox"
              checked={!off.has(source)}
              onChange={(event) => {
                onSetEnabled(source, event.target.checked);
              }}
            />
          )}
        </div>
      ))}

      {installed.length === 0 && refused.length === 0 && (
        <div className={styles['row']}>
          <span>No content sources installed</span>
        </div>
      )}
    </>
  );
}
