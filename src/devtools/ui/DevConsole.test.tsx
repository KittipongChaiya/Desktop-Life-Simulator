/**
 * @vitest-environment jsdom
 *
 * The developer console's hit-testing. Fixed during phase-07.8e.
 *
 * The console has been unclickable with a real mouse since the overlay learned
 * to pass the pointer through. `app/hit-test.ts` keeps the mouse only while it
 * is over a `[data-interactive]` element; the console carried no such
 * attribute, so moving onto it made the window click-through and the click
 * landed on the desktop. The same omission made a press on the console a
 * candidate TILE ACTION in `bootstrap/pointer-actions.ts`.
 *
 * Neither existing layer could see it, and that is why this test exists rather
 * than an E2E: Playwright synthesises events inside the renderer, where OS-level
 * mouse ignoring does not happen, and the console's own specs reach it by
 * keyboard because F1 autofocuses the input. The attribute is the whole of the
 * contract, so the attribute is what is asserted.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createConsoleEngine } from '../console/engine';
import { createCommandRegistry } from '../console/registry';

import { DevConsole } from './DevConsole';

afterEach(cleanup);

describe('DevConsole', () => {
  it('marks itself interactive, so the window keeps the mouse over it', () => {
    render(
      <DevConsole
        visible
        engine={createConsoleEngine(createCommandRegistry())}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByTestId('dev-console').hasAttribute('data-interactive')).toBe(true);
  });
});
