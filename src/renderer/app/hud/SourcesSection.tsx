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
 * Read-only for now, and deliberately so: enabling and disabling a source is
 * world state (ADR-019 §7), which means it travels through a command like every
 * other world mutation (ADR-010 §1) rather than being a checkbox that writes
 * directly. That command does not exist yet, and a toggle that silently did
 * nothing would be worse than no toggle.
 */

import type { SourceReport } from '../source-report';

import styles from './SettingsPanel.module.css';

export interface SourcesSectionProps {
  readonly report: SourceReport;
}

export function SourcesSection({ report }: SourcesSectionProps): React.JSX.Element {
  const { installed, refused } = report;

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
          <span className={styles['name']}>{source}</span>
          <span>Loaded</span>
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
