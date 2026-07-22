/**
 * Placement mode — presentation state. Phase-05d.
 *
 * WHICH BUILDING the player is placing (or none) is a VIEW concern, exactly
 * like the held tool and the selected worker (ADR-007 §1): it never enters
 * `World`. It is shared between the HUD's build button and the renderer's build
 * ghost, so it lives in one small observable both read — the same shape as
 * `WorkerSelection`.
 *
 * There is no hovered tile here. Hover changes at pointer rate and belongs to
 * the bootstrap wiring that drives the ghost; keeping it out of this store lets
 * React subscribe to placement mode without re-rendering on every mouse move.
 */

import type { ContentId } from '../../shared/ids';

export interface PlacementController {
  /** The building being placed, or null when not in placement mode. */
  active(): ContentId | null;
  /**
   * Toggles a building on or off. A second toggle of the same building exits
   * placement mode; toggling a different one switches to it — the build button
   * is a press-to-arm, press-again-to-cancel control.
   */
  toggle(buildingId: ContentId): void;
  /** Leaves placement mode. Bound to `Esc` and to a successful placement's caller. */
  deactivate(): void;
  subscribe(listener: () => void): () => void;
}

export function createPlacementController(): PlacementController {
  let active: ContentId | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    active: () => active,

    toggle(buildingId) {
      // Every toggle is a state change (arm, switch, or cancel), so it always
      // notifies — there is no no-op branch to guard.
      active = active === buildingId ? null : buildingId;
      notify();
    },

    deactivate() {
      if (active === null) return; // already inactive: don't wake subscribers
      active = null;
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
