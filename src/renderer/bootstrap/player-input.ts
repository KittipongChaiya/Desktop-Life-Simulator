/**
 * Player input — intent, not rules. Phase-03.6.
 *
 * This layer answers exactly one question: WHAT DOES THE PLAYER WANT? It maps
 * (selected tool + clicked tile) to a command and submits it. It does not ask
 * whether the tile is owned, tilled, empty, or ripe.
 *
 * That restraint is the point. Those checks live in command validation, which
 * worker AI and automation also go through (ADR-010 §6). Duplicating them here
 * would mean two rule sets that agree today and diverge at the first change —
 * and the divergence would show up as automation reaching states the player
 * cannot, which is precisely what ADR-010 exists to prevent.
 *
 * INTERACTION STATE IS PRESENTATION STATE. Tool, hover, and selection live
 * here and never enter `World`. Hover changes at pointer rate; if it reached
 * the simulation, mouse movement would be an input to the tick and determinism
 * would be gone (ADR-007 §1).
 *
 * DOM wiring is deliberately absent: this module is a state machine over plain
 * tile indices, so it is fully testable with no DOM. `attachPlayerInput`
 * translates events into these calls.
 */

import type { ContentId, TileIndex } from '../../shared/ids';
import type { PlayerInputSource } from '../../sim/commands/sources';
import type { Command, CommandResult } from '../../sim/commands/types';
import type { ToolSelection } from '../app/tool-selection';
import { Tool } from '../app/tools';

/*
 * The tool vocabulary moved to `app/tools.ts` in 07.5h so the UI layer could
 * reach it: `app` may not import `bootstrap` (`CODE_STYLE.md` §8.1), which is
 * why the tool bar `GAME_DESIGN.md` §10.2 specifies could not be built here.
 * Re-exported so existing call sites and tests keep one import path.
 */
export { Tool, toolForKey, TOOLS, type ToolInfo } from '../app/tools';

export function commandFor(tool: Tool, tile: TileIndex, seed: ContentId): Command {
  switch (tool) {
    case Tool.Hoe:
      return { type: 'tillTile', tile };
    case Tool.Seed:
      return { type: 'plantCrop', tile, cropId: seed };
    case Tool.Hand:
      return { type: 'harvestCrop', tile };
  }
}

/** What the view needs to draw. Presentation only. */
export interface InteractionState {
  readonly tool: Tool | null;
  readonly hovered: TileIndex | null;
  readonly selected: TileIndex | null;
  /** Tile whose command was just rejected, for transient feedback. */
  readonly rejected: TileIndex | null;
}

export interface PlayerInput {
  state(): InteractionState;
  selectTool(tool: Tool | null): void;
  hover(tile: TileIndex | null): void;
  /**
   * Acts on a tile with the current tool.
   *
   * Returns `null` when no tool is held — an empty hand is not an error, it is
   * simply not an action. Otherwise returns the dispatcher's verdict.
   */
  click(tile: TileIndex): CommandResult | null;
}

export interface PlayerInputOptions {
  readonly source: PlayerInputSource;
  /**
   * Crop the seed tool plants, read AT CLICK TIME — a getter, because the
   * selection lives in the shop panel's `SeedSelection` store (06e) and may
   * change between clicks. Presentation state end to end (ADR-007 §1).
   */
  readonly seed: () => ContentId;
  /**
   * The held tool. A SHARED store (07.5h), not private state: the tool bar
   * displays and sets the same value this mapping reads, so there is exactly
   * one answer to "what am I holding".
   */
  readonly tools: ToolSelection;
  /** Notified whenever presentation state changes, so the view can redraw. */
  readonly onChange?: (state: InteractionState) => void;
}

export function createPlayerInput(options: PlayerInputOptions): PlayerInput {
  let state: InteractionState = {
    tool: options.tools.selected(),
    hovered: null,
    selected: null,
    rejected: null,
  };

  const update = (next: Partial<InteractionState>): void => {
    const merged = { ...state, ...next };
    // Skip the notify when nothing moved: hover fires at pointer rate, and a
    // redraw per event would defeat render-on-demand (ADR-001 §1).
    if (
      merged.tool === state.tool &&
      merged.hovered === state.hovered &&
      merged.selected === state.selected &&
      merged.rejected === state.rejected
    ) {
      return;
    }

    state = merged;
    options.onChange?.(state);
  };

  // The store is the owner, so a change from the TOOL BAR reaches the world
  // view's highlight exactly as a keypress does — one path, not two.
  options.tools.subscribe(() => {
    const tool = options.tools.selected();
    // Clearing the tool also clears the selection: `Esc` means "deselect"
    // (`GAME_DESIGN.md` §8.3), and a lingering highlight with no tool implies
    // an action that is no longer available.
    update(tool === null ? { tool: null, selected: null, rejected: null } : { tool });
  });

  return {
    state: () => state,

    selectTool(tool) {
      options.tools.select(tool);
    },

    hover(tile) {
      update({ hovered: tile });
    },

    click(tile) {
      const { tool } = state;
      if (tool === null) return null;

      const result = options.source.submit(commandFor(tool, tile, options.seed()));
      update({ selected: tile, rejected: result.ok ? null : tile });
      return result;
    },
  };
}
