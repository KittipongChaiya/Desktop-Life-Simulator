/**
 * @vitest-environment jsdom
 *
 * The tool bar. Phase-07.5h — `GAME_DESIGN.md` §10.2's `[tools]` slot.
 *
 * This exists because of a defect reported from a real session: clicking the
 * ground does nothing unless a tool is armed, and arming one was possible only
 * by pressing `1`, `2`, or `4` — stated in no interface anywhere. A player who
 * bought seeds, saw them in the inventory, and clicked the ground got silence.
 *
 * So the assertions are about DISCOVERABILITY as much as behaviour: the verbs
 * are visible, the keys are visible, and the armed state is visible.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { createActionFeedback } from '../action-feedback';
import { AppProviders } from '../store-context';
import { createToolSelection, type ToolSelection } from '../tool-selection';
import { Tool, TOOLS } from '../tools';

import { ToolBar } from './ToolBar';

function mount(): ToolSelection {
  const tools = createToolSelection();
  render(
    <StrictMode>
      <AppProviders
        actionFeedback={createActionFeedback()}
        store={undefined as never}
        overlay={undefined as never}
        player={undefined as never}
        selection={undefined as never}
        placement={undefined as never}
        seeds={undefined as never}
        companion={undefined as never}
        save={undefined as never}
        returnSummary={undefined as never}
        sound={undefined as never}
        tools={tools}
      >
        <ToolBar />
      </AppProviders>
    </StrictMode>,
  );
  return tools;
}

afterEach(cleanup);

describe('discoverability — the whole point of the bar', () => {
  it('names what each tool DOES, in verbs a first-time player reads', () => {
    mount();

    expect(screen.getByRole('button', { name: /Till/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Plant/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Harvest/ })).toBeDefined();
  });

  it('shows the keyboard shortcut beside each tool', () => {
    // The keys were the secret. They come from the one `TOOLS` table, so a
    // rebind reaches this bar for free.
    mount();

    for (const info of TOOLS) {
      expect(screen.getByText(info.key)).toBeDefined();
    }
  });

  it('offers exactly the tools that do something', () => {
    // `GAME_DESIGN.md` §8.3 also lists a watering can; moisture is deferred, and
    // a tool that silently does nothing is worse than one not offered.
    mount();

    expect(screen.getAllByRole('button')).toHaveLength(TOOLS.length);
  });
});

describe('arming a tool with the mouse', () => {
  it('arms the tool the player clicked', () => {
    // The fix, in one assertion: the mouse can now do what only `2` could.
    const tools = mount();

    fireEvent.click(screen.getByRole('button', { name: /Plant/ }));

    expect(tools.selected()).toBe(Tool.Seed);
  });

  it('shows which tool is armed', () => {
    const tools = mount();

    fireEvent.click(screen.getByRole('button', { name: /Till/ }));

    expect(screen.getByRole('button', { name: /Till/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Plant/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(tools.selected()).toBe(Tool.Hoe);
  });

  it('clicking the armed tool disarms it — the mouse can undo itself', () => {
    // `Esc` does this too, but the mouse should not need the keyboard to
    // reverse what the mouse did.
    const tools = mount();
    const plant = screen.getByRole('button', { name: /Plant/ });

    fireEvent.click(plant);
    fireEvent.click(plant);

    expect(tools.selected()).toBeNull();
  });

  it('switching tools replaces rather than accumulates', () => {
    const tools = mount();

    fireEvent.click(screen.getByRole('button', { name: /Till/ }));
    fireEvent.click(screen.getByRole('button', { name: /Harvest/ }));

    expect(tools.selected()).toBe(Tool.Hand);
    expect(screen.getByRole('button', { name: /Till/ }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('one store, two inputs', () => {
  it('reflects a tool armed from outside the bar — the keyboard path', () => {
    // The bar and the `1`/`2`/`4` keys drive the SAME store, so the display can
    // never disagree with what the click mapping will do.
    const tools = mount();

    // Wrapped: the store lives outside React, so the subscription flush is
    // what makes the display agree with it — which is the property under test.
    act(() => {
      tools.select(Tool.Hand);
    });

    expect(screen.getByRole('button', { name: /Harvest/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('starts with nothing armed', () => {
    // A tool held by default would make the first stray click on the world a
    // command the player never asked for.
    const tools = mount();

    expect(tools.selected()).toBeNull();
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
  });
});
