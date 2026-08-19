/**
 * @vitest-environment jsdom
 *
 * Pointer and key handling. Phase-08.0c — the module was at 0%.
 *
 * THIS LAYER DECIDES NOTHING. It converts DOM events into calls on
 * `PlayerInput` and nothing else, which is what these tests pin: every case is
 * "given this gesture, which intent was raised, and which were not".
 *
 * Four behaviours here are invisible in the code and expensive in play, and
 * each has a test that fails if it regresses:
 *
 *   • click-versus-drag — without the 4px slop, ordinary trackpad jitter turns
 *     every click into a drag and the farm stops responding;
 *   • presses over the HUD — arming one fires a tool command on the tile
 *     BEHIND the control the player was aiming at;
 *   • placement mode — a click must place a building and do nothing else, or
 *     the same click also tills the ground it lands on;
 *   • worker selection — likewise, selecting a worker and tilling under it are
 *     different intents that share a gesture.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';
import type { WorldView } from '../render/world-view';

import { Tool, type InteractionState, type PlayerInput } from './player-input';
import { attachPointerActions, toHighlight } from './pointer-actions';

const TILE = toIndexUnchecked(30, 30);

/** Records intents instead of running them — this layer's whole output. */
function recordingInput(): PlayerInput & {
  readonly hovers: (TileIndex | null)[];
  readonly clicks: TileIndex[];
  readonly tools: (Tool | null)[];
} {
  const hovers: (TileIndex | null)[] = [];
  const clicks: TileIndex[] = [];
  const tools: (Tool | null)[] = [];
  return {
    hovers,
    clicks,
    tools,
    state: (): InteractionState => ({ tool: null, hovered: null, selected: null, rejected: null }),
    selectTool: (tool) => tools.push(tool),
    hover: (tile) => hovers.push(tile),
    click: (tile) => {
      clicks.push(tile);
      return null;
    },
  };
}

/** A view that maps every screen point to one tile, or to nothing. */
function viewAt(position: { x: number; y: number } | null): WorldView {
  return { tileAt: () => position } as unknown as WorldView;
}

const teardowns: (() => void)[] = [];

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
  document.body.innerHTML = '';
});

interface Harness {
  readonly target: HTMLElement;
  readonly input: ReturnType<typeof recordingInput>;
}

function attach(options: Partial<Parameters<typeof attachPointerActions>[0]> = {}): Harness {
  const target = document.createElement('div');
  document.body.append(target);
  const input = recordingInput();
  teardowns.push(
    attachPointerActions({
      target,
      input,
      view: () => viewAt({ x: 30, y: 30 }),
      ...options,
    }),
  );
  return { target, input };
}

/** jsdom has no PointerEvent, and this layer reads only button and position. */
function pointer(type: string, init: { x?: number; y?: number; button?: number } = {}): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
    button: init.button ?? 0,
  });
  return event;
}

function click(target: HTMLElement, x = 0, y = 0): void {
  target.dispatchEvent(pointer('pointerdown', { x, y }));
  target.dispatchEvent(pointer('pointerup', { x, y }));
}

describe('toHighlight', () => {
  const base: InteractionState = { tool: null, hovered: null, selected: null, rejected: null };

  it('carries the interaction tiles through unchanged', () => {
    const state = { ...base, hovered: TILE, selected: TILE, rejected: TILE };
    expect(toHighlight(state)).toMatchObject({ hovered: TILE, selected: TILE, rejected: TILE });
  });

  it('gives every tool its own tint, and an empty hand a neutral one', () => {
    const tints = [Tool.Hoe, Tool.Seed, Tool.Hand].map(
      (tool) => toHighlight({ ...base, tool }).tint,
    );
    expect(new Set(tints).size).toBe(3); // no two tools read alike
    expect(tints).not.toContain(toHighlight(base).tint); // nor does an empty hand
  });
});

describe('attachPointerActions — clicks', () => {
  it('a press and release on one spot clicks the tile under it', () => {
    const { target, input } = attach();
    click(target, 100, 100);
    expect(input.clicks).toEqual([TILE]);
  });

  it('ignores a press that moved further than the slop — that is a drag, not a click', () => {
    const { target, input } = attach();
    target.dispatchEvent(pointer('pointerdown', { x: 100, y: 100 }));
    target.dispatchEvent(pointer('pointermove', { x: 120, y: 100 }));
    target.dispatchEvent(pointer('pointerup', { x: 120, y: 100 }));
    expect(input.clicks).toEqual([]);
  });

  it('still clicks after jitter within the slop — a trackpad never holds still', () => {
    const { target, input } = attach();
    target.dispatchEvent(pointer('pointerdown', { x: 100, y: 100 }));
    target.dispatchEvent(pointer('pointermove', { x: 102, y: 101 }));
    target.dispatchEvent(pointer('pointerup', { x: 102, y: 101 }));
    expect(input.clicks).toEqual([TILE]);
  });

  it('ignores every button but the primary one', () => {
    const { target, input } = attach();
    target.dispatchEvent(pointer('pointerdown', { button: 2 }));
    target.dispatchEvent(pointer('pointerup', { button: 2 }));
    expect(input.clicks).toEqual([]);
  });

  it('does not act on a press that began over the HUD', () => {
    // Otherwise the command lands on the tile BEHIND the control being clicked.
    const { target, input } = attach();
    const control = document.createElement('button');
    control.setAttribute('data-interactive', '');
    target.append(control);

    control.dispatchEvent(pointer('pointerdown'));
    control.dispatchEvent(pointer('pointerup'));
    expect(input.clicks).toEqual([]);
  });

  it('does not act when the pointer is outside the world', () => {
    const { target, input } = attach({ view: () => viewAt(null) });
    click(target);
    expect(input.clicks).toEqual([]);
  });

  it('does not act while the overlay is collapsed and the view is gone', () => {
    const { target, input } = attach({ view: () => null });
    click(target);
    expect(input.clicks).toEqual([]);
  });

  it('forgets a press that was cancelled', () => {
    const { target, input } = attach();
    target.dispatchEvent(pointer('pointerdown'));
    target.dispatchEvent(pointer('pointercancel'));
    target.dispatchEvent(pointer('pointerup'));
    expect(input.clicks).toEqual([]);
  });

  it('selects a worker instead of acting on the tile it stands on', () => {
    const selectWorkerAt = vi.fn(() => true);
    const { target, input } = attach({ selectWorkerAt });
    click(target);
    expect(selectWorkerAt).toHaveBeenCalledWith(TILE);
    expect(input.clicks).toEqual([]); // the tile is NOT tilled under the worker
  });

  it('acts on the tile when no worker is there', () => {
    const { target, input } = attach({ selectWorkerAt: () => false });
    click(target);
    expect(input.clicks).toEqual([TILE]);
  });
});

describe('attachPointerActions — hover', () => {
  it('reports the tile under the pointer', () => {
    const { target, input } = attach();
    target.dispatchEvent(pointer('pointermove', { x: 10, y: 10 }));
    expect(input.hovers).toEqual([TILE]);
  });

  it('clears the hover when the pointer leaves', () => {
    const { target, input } = attach();
    target.dispatchEvent(pointer('pointerleave'));
    expect(input.hovers).toEqual([null]);
  });

  it('clears the build ghost too when the pointer leaves', () => {
    const placement = { active: () => true, hover: vi.fn(), place: vi.fn(), cancel: vi.fn() };
    const { target } = attach({ placement });
    target.dispatchEvent(pointer('pointerleave'));
    expect(placement.hover).toHaveBeenCalledWith(null);
  });
});

describe('attachPointerActions — building placement', () => {
  const placementHarness = (): {
    harness: Harness;
    placement: {
      active: () => boolean;
      hover: ReturnType<typeof vi.fn>;
      place: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
    };
  } => {
    const placement = { active: () => true, hover: vi.fn(), place: vi.fn(), cancel: vi.fn() };
    return { harness: attach({ placement }), placement };
  };

  it('drives the ghost and suppresses the tool highlight, so the two never stack', () => {
    const { harness, placement } = placementHarness();
    harness.target.dispatchEvent(pointer('pointermove', { x: 10, y: 10 }));
    expect(placement.hover).toHaveBeenCalledWith(TILE);
    expect(harness.input.hovers).toEqual([null]);
  });

  it('places the building and does nothing else', () => {
    const selectWorkerAt = vi.fn(() => true);
    const placement = { active: () => true, hover: vi.fn(), place: vi.fn(), cancel: vi.fn() };
    const target = document.createElement('div');
    document.body.append(target);
    const input = recordingInput();
    teardowns.push(
      attachPointerActions({
        target,
        input,
        view: () => viewAt({ x: 30, y: 30 }),
        placement,
        selectWorkerAt,
      }),
    );

    click(target);
    expect(placement.place).toHaveBeenCalledWith(TILE);
    expect(input.clicks).toEqual([]); // not a tool action
    expect(selectWorkerAt).not.toHaveBeenCalled(); // not a worker selection
  });

  it('acts normally once placement is no longer active', () => {
    const placement = { active: () => false, hover: vi.fn(), place: vi.fn(), cancel: vi.fn() };
    const { target, input } = attach({ placement });
    click(target);
    expect(placement.place).not.toHaveBeenCalled();
    expect(input.clicks).toEqual([TILE]);
  });
});

describe('attachPointerActions — keys', () => {
  it('arms the tool bound to a key, and ignores keys bound to nothing', () => {
    const { input } = attach();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    expect(input.tools).toEqual([Tool.Hoe]);
  });

  it('Escape drops the tool, the selection, and any placement together', () => {
    const placement = { active: () => true, hover: vi.fn(), place: vi.fn(), cancel: vi.fn() };
    const clearSelection = vi.fn();
    const { input } = attach({ placement, clearSelection });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(placement.cancel).toHaveBeenCalled();
    expect(input.tools).toEqual([null]);
    expect(clearSelection).toHaveBeenCalled();
  });

  it('Escape works when no placement or selection handler was supplied', () => {
    const { input } = attach();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(input.tools).toEqual([null]);
  });
});

describe('attachPointerActions — teardown', () => {
  it('removes every listener, including the one on window', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const input = recordingInput();
    const detach = attachPointerActions({
      target,
      input,
      view: () => viewAt({ x: 30, y: 30 }),
    });

    detach();

    click(target);
    target.dispatchEvent(pointer('pointermove', { x: 10, y: 10 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect([input.clicks, input.hovers, input.tools]).toEqual([[], [], []]);
  });
});

describe('zone painting takes the pointer while armed (phase-48)', () => {
  /** Records what the zone port is asked to do. */
  function recordingZone(active = true) {
    const calls: string[] = [];
    return {
      calls,
      port: {
        active: () => active,
        begin: (tile: TileIndex, erasing: boolean) => {
          calls.push(`begin:${String(tile)}:${String(erasing)}`);
        },
        hover: (tile: TileIndex | null) => {
          calls.push(`hover:${tile === null ? 'null' : String(tile)}`);
        },
        end: (tile: TileIndex) => {
          calls.push(`end:${String(tile)}`);
        },
        cancel: () => calls.push('cancel'),
        exit: () => calls.push('exit'),
      },
    };
  }

  it('begins on the press and ends on the release', () => {
    // THE WHOLE POINT: a zone is a rectangle, so both ends of the gesture
    // matter. Every other pointer action in this game happens on release
    // alone, which is why this needed its own branch rather than reusing one.
    const zone = recordingZone();
    const { target } = attach({ zone: zone.port });

    target.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    target.dispatchEvent(pointer('pointermove', { x: 60, y: 40 }));
    target.dispatchEvent(pointer('pointerup', { x: 60, y: 40 }));

    expect(zone.calls[0]).toBe(`begin:${String(TILE)}:false`);
    expect(zone.calls.at(-1)).toBe(`end:${String(TILE)}`);
  });

  it('ends a one-tile drag that never moved', () => {
    // A single square is a legitimate zone, and it arrives as a plain click.
    const zone = recordingZone();
    const { target } = attach({ zone: zone.port });

    target.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    target.dispatchEvent(pointer('pointerup', { x: 10, y: 10 }));

    expect(zone.calls).toContain(`end:${String(TILE)}`);
  });

  it('takes the pointer entirely — no tool action and no tile click', () => {
    // A player painting a field and a player tilling one are making
    // incompatible requests, and the armed mode wins.
    const zone = recordingZone();
    const { target, input } = attach({ zone: zone.port });

    target.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    target.dispatchEvent(pointer('pointermove', { x: 20, y: 20 }));
    target.dispatchEvent(pointer('pointerup', { x: 20, y: 20 }));

    expect(input.clicks).toEqual([]);
    expect(input.hovers.filter((tile) => tile !== null)).toEqual([]);
  });

  it('leaves the whole mode on Escape, not merely the drag', () => {
    // These were one call at first, and Escape left the mode armed with the
    // button still reading "Painting…". A pointer wandering off abandons a
    // drag; a player pressing Escape is finished.
    const zone = recordingZone();
    const { target } = attach({ zone: zone.port });

    target.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(zone.calls).toContain('exit');
  });

  it('does nothing at all when the mode is not armed', () => {
    const zone = recordingZone(false);
    const { target, input } = attach({ zone: zone.port });

    target.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    target.dispatchEvent(pointer('pointerup', { x: 10, y: 10 }));

    expect(zone.calls).toEqual([]);
    expect(input.clicks).toEqual([TILE]);
  });
});
