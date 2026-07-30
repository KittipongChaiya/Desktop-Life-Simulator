/**
 * Why nothing happened. Phase-07.5i.
 *
 * THE DEFECT THIS FIXES. A rejected action produced exactly one signal: a brief
 * amber outline on the clicked tile. On a 220-pixel overlay that is easy to miss
 * entirely, and it never said WHY. Execution-time rejections were worse — they
 * went to a devtools metric with a comment admitting they had "nowhere to
 * surface until the HUD arrives in phase-05". The HUD arrived; they never
 * surfaced.
 *
 * The result was a game that answered every wrong move with silence. A player
 * who armed Plant and clicked untilled ground, or who had no seeds of the
 * selected crop, saw nothing at all and reasonably concluded the click had not
 * registered. It was reported three times before it was found, each time as
 * "nothing happens".
 *
 * The rule this establishes: **a rejected action always says why, in one short
 * sentence, in the player's words.** `GAME_DESIGN.md` §10.1 rule 1 — failures
 * are inline and transient, never modal.
 */

import { ErrorCode, type AppError } from '../../shared/errors';

/** How long a message stays before it fades. */
export const FEEDBACK_VISIBLE_MS = 2_600;

export interface ActionFeedback {
  /** The current message, or null. */
  message(): string | null;
  /** Reports a rejection. A newer message replaces an older one. */
  report(error: AppError): void;
  /** Clears immediately — used by the view's own timer. */
  clear(): void;
  subscribe(listener: () => void): () => void;
}

/**
 * A rejection in the player's words.
 *
 * Every message names the FIX, not the rule: "till this ground first" rather
 * than "tile is the wrong kind". A player does not need the validator's
 * vocabulary, they need the next action.
 *
 * Pure and total, so a new error code cannot silently produce silence — the
 * fallback still says something true.
 */
export function messageForRejection(error: AppError): string {
  switch (error.code) {
    case ErrorCode.TileNotOwned:
      return 'That land is not yours yet — expand your plot in the shop.';
    case ErrorCode.TileWrongKind:
      // The overwhelmingly common case: Plant on ground that is not tilled, or
      // Till on water or stone.
      return 'That ground is not ready — till it first, and only on soil.';
    case ErrorCode.MissingItem:
      return 'You have none of those seeds — buy some in the shop.';
    case ErrorCode.InventoryFull:
      return 'Your storage is full — sell something or build a shed.';
    case ErrorCode.InsufficientFunds:
      return 'Not enough coins for that.';
    case ErrorCode.TileOutOfBounds:
      return 'That is outside the world.';
    case ErrorCode.UnknownContent:
      return 'That item is not something this version knows about.';
    case ErrorCode.InvalidIntent:
      // Reached by clicking an empty tile with the harvest tool, or a grown
      // crop with the hoe — the action does not apply here.
      return 'Nothing to do there with that tool.';
    default:
      // Never a dead end. A message the player can act on beats a code.
      return 'That did not work here.';
  }
}

export function createActionFeedback(): ActionFeedback {
  let message: string | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    message: () => message,

    report(error) {
      // One slot, newest wins — the same rule the companion toast follows.
      // A queue would leave the player reading stale complaints.
      message = messageForRejection(error);
      notify();
    },

    clear() {
      if (message === null) return;
      message = null;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
