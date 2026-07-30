/**
 * The held tool — presentation state. Phase-07.5h.
 *
 * Exactly the shape of `SeedSelection` and `PlacementController`, and for the
 * same reason: the tool is shared between a panel that sets it (the tool bar)
 * and the click mapping that reads it, so it lives in one small observable both
 * can see. It never enters `World` (ADR-007 §1).
 *
 * It became a shared store in 07.5h. Before that the held tool was private to
 * `createPlayerInput`, so React could not display it — which is how the game
 * shipped with no way to discover that clicking the ground requires arming a
 * tool first, and a player who bought seeds could not plant them.
 */

import { type Tool } from './tools';

export interface ToolSelection {
  /** The held tool, or null when nothing is armed. */
  selected(): Tool | null;
  select(tool: Tool | null): void;
  subscribe(listener: () => void): () => void;
}

export function createToolSelection(): ToolSelection {
  // Nothing is armed at launch. A tool held by default would make the first
  // stray click on the world a command the player did not ask for.
  let selected: Tool | null = null;
  const listeners = new Set<() => void>();

  return {
    selected: () => selected,

    select(tool) {
      if (tool === selected) return; // no change: don't wake subscribers
      selected = tool;
      for (const listener of listeners) listener();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
