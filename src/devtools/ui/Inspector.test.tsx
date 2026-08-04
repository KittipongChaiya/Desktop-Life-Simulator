/**
 * @vitest-environment jsdom
 *
 * The world inspector panel. Phase-07.8c — pinning, and the sampling that
 * makes a pinned reading honest.
 *
 * The panel used to read only on `pointermove`, which made every value a
 * SCREENSHOT of the instant the pointer last moved: hold still over a ripening
 * crop and it stays "growing" forever. Pinning would have made that permanent,
 * so pinning fixes WHICH tile is read, not WHAT it said — the sampler keeps
 * running, and the values keep moving.
 *
 * The cost of that is bounded the way ADR-018 §8 requires: the panel commits a
 * reading only when it differs from the last one, so a still world re-renders
 * nothing at all.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createInspectorRegistry,
  sectionsEqual,
  type InspectorRegistry,
  type InspectSection,
} from '../inspector/registry';

import { Inspector } from './Inspector';

const TICK_MS = 250;

function section(value: string): InspectSection {
  return { title: 'Tile', fields: [{ label: 'State', value }] };
}

/** A registry that records what it was asked about, and answers what it is told. */
function probeRegistry(answer: () => string): {
  readonly registry: InspectorRegistry;
  readonly asked: Array<{ x: number; y: number }>;
} {
  const asked: Array<{ x: number; y: number }> = [];
  const registry = createInspectorRegistry();
  registry.register({
    id: 'probe',
    inspect: (target) => {
      asked.push({ x: target.x, y: target.y });
      return section(answer());
    },
  });
  return { registry, asked };
}

function advance(ms = TICK_MS): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function movePointer(x: number, y: number): void {
  act(() => {
    fireEvent.pointerMove(window, { clientX: x, clientY: y });
  });
}

function pressPin(): void {
  act(() => {
    fireEvent.keyDown(window, { key: 'p' });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Inspector', () => {
  it('costs nothing while hidden — no sampling, no listeners', () => {
    const { registry, asked } = probeRegistry(() => 'empty');
    render(<Inspector visible={false} registry={registry} />);

    movePointer(10, 20);
    advance(TICK_MS * 8);

    expect(screen.queryByTestId('inspector')).toBeNull();
    expect(asked).toHaveLength(0);
  });

  it('follows the pointer', () => {
    const { registry, asked } = probeRegistry(() => 'empty');
    render(<Inspector visible registry={registry} />);

    movePointer(10, 20);
    advance();

    expect(screen.getByTestId('inspector-heading').textContent).toContain('10,20');
    expect(asked.at(-1)).toEqual({ x: 10, y: 20 });
  });

  it('pins the target, so the pointer can leave the tile being read', () => {
    const { registry, asked } = probeRegistry(() => 'empty');
    render(<Inspector visible registry={registry} />);

    movePointer(10, 20);
    advance();
    pressPin();

    movePointer(400, 400);
    advance();

    expect(screen.getByTestId('inspector-heading').textContent).toContain('10,20');
    expect(asked.at(-1)).toEqual({ x: 10, y: 20 });
  });

  it('keeps reading the pinned tile, so a pin is not a screenshot', () => {
    let state = 'growing';
    const { registry } = probeRegistry(() => state);
    render(<Inspector visible registry={registry} />);

    movePointer(10, 20);
    advance();
    pressPin();

    state = 'harvestReady';
    advance();

    expect(screen.getByTestId('inspector').textContent).toContain('harvestReady');
  });

  it('says it is pinned, because a panel that has stopped following must show it', () => {
    const { registry } = probeRegistry(() => 'empty');
    render(<Inspector visible registry={registry} />);

    advance();
    expect(screen.getByTestId('inspector-heading').textContent).not.toContain('PINNED');

    pressPin();
    advance();
    expect(screen.getByTestId('inspector-heading').textContent).toContain('PINNED');
  });

  it('unpins and follows again', () => {
    const { registry, asked } = probeRegistry(() => 'empty');
    render(<Inspector visible registry={registry} />);

    movePointer(10, 20);
    advance();
    pressPin();
    pressPin();

    movePointer(400, 400);
    advance();

    expect(asked.at(-1)).toEqual({ x: 400, y: 400 });
  });

  it('ignores the pin key while a field has focus', () => {
    // The developer console is a text input one keypress away (F1). A global
    // "p" would be swallowed from it — the defect App.tsx records for Space.
    const { registry } = probeRegistry(() => 'empty');
    render(<Inspector visible registry={registry} />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      fireEvent.keyDown(input, { key: 'p' });
    });
    advance();

    expect(screen.getByTestId('inspector-heading').textContent).not.toContain('PINNED');
    input.remove();
  });

  it('leaves the panel alone while nothing changes (ADR-018 §8)', () => {
    const { registry, asked } = probeRegistry(() => 'empty');
    const { container } = render(<Inspector visible registry={registry} />);

    movePointer(10, 20);
    advance();
    const painted = container.innerHTML;

    advance(TICK_MS * 8);

    // Still reading — a stopped sampler would be the other defect.
    expect(asked.length).toBeGreaterThan(8);
    expect(container.innerHTML).toBe(painted);
  });

  it('reports an empty world plainly', () => {
    render(<Inspector visible registry={createInspectorRegistry()} />);
    advance();

    expect(screen.getByTestId('inspector').textContent).toContain('Nothing inspectable');
  });
});

describe('sectionsEqual', () => {
  it('holds for the same reference', () => {
    const sections = [section('empty')];
    expect(sectionsEqual(sections, sections)).toBe(true);
  });

  it('compares by value, not identity', () => {
    expect(sectionsEqual([section('empty')], [section('empty')])).toBe(true);
  });

  it('sees a changed value', () => {
    expect(sectionsEqual([section('empty')], [section('tilled')])).toBe(false);
  });

  it('sees a changed title, count, and label', () => {
    expect(sectionsEqual([section('a')], [{ ...section('a'), title: 'Other' }])).toBe(false);
    expect(sectionsEqual([section('a')], [section('a'), section('a')])).toBe(false);
    expect(
      sectionsEqual([section('a')], [{ title: 'Tile', fields: [{ label: 'Kind', value: 'a' }] }]),
    ).toBe(false);
    expect(sectionsEqual([section('a')], [{ title: 'Tile', fields: [] }])).toBe(false);
  });

  it('holds for two empties', () => {
    expect(sectionsEqual([], [])).toBe(true);
  });
});
