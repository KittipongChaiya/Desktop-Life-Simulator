/**
 * @vitest-environment jsdom
 *
 * Content sources, as the player sees them. Phase-09f — ADR-019 §6.
 *
 * The property under test is that a refusal is REPORTED. Everything else in the
 * loader already worked: it knew which sources failed and why, and dropped the
 * reasons on the floor. A plugin that vanishes with no explanation is what
 * ADR-019 §6 exists to prevent, and the reason is the whole feature — "not
 * loaded" sends a player to a forum, naming the cause sends them to the fix.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SourceReport } from '../source-report';

import { SourcesSection } from './SourcesSection';

afterEach(cleanup);

const report = (overrides: Partial<SourceReport> = {}): SourceReport => ({
  installed: [],
  refused: [],
  ...overrides,
});

describe('SourcesSection', () => {
  it('names every refused source AND the reason', () => {
    render(
      <SourcesSection
        report={report({
          refused: [{ source: 'moonmelon', reason: 'plugin.json is not valid JSON' }],
        })}
      />,
    );

    expect(screen.getByText('moonmelon')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('plugin.json is not valid JSON');
  });

  it('lists loaded sources', () => {
    render(<SourcesSection report={report({ installed: ['moonmelon'] })} />);

    expect(screen.getByText('moonmelon')).toBeDefined();
    expect(screen.getByText('Loaded')).toBeDefined();
  });

  it('puts refusals BEFORE loaded sources — that is what a player came to read', () => {
    const { container } = render(
      <SourcesSection
        report={report({
          installed: ['works'],
          refused: [{ source: 'broken', reason: 'a cycle' }],
        })}
      />,
    );

    const text = container.textContent ?? '';
    expect(text.indexOf('broken')).toBeLessThan(text.indexOf('works'));
  });

  it('says so plainly when nothing is installed — most players have none', () => {
    render(<SourcesSection report={report()} />);
    expect(screen.getByText('No content sources installed')).toBeDefined();
  });

  it('does not claim a refused source loaded', () => {
    render(
      <SourcesSection report={report({ refused: [{ source: 'broken', reason: 'a cycle' }] })} />,
    );
    expect(screen.queryByText('Loaded')).toBeNull();
  });
});
