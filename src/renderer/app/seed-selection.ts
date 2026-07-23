/**
 * Seed selection — presentation state. Phase-06e.
 *
 * WHICH CROP the player's seed tool plants is a VIEW concern, exactly like the
 * held tool and the armed building (ADR-007 §1): it never enters `World`, and
 * workers never read it — their fallback is the worker default crop (phase doc,
 * resolved interpretation 4). It is shared between the shop panel's selector
 * and the player-input click mapping, so it lives in one small observable both
 * read — the same shape as `PlacementController`.
 */

import type { ContentId } from '../../shared/ids';
import { CORE_TURNIP } from '../../sim/content/crops';

export interface SeedSelection {
  /** The crop the seed tool currently plants. Always a valid crop id. */
  selected(): ContentId;
  select(cropId: ContentId): void;
  subscribe(listener: () => void): () => void;
}

export function createSeedSelection(): SeedSelection {
  // The starter crop is the default — the cheapest seed, the first thing a
  // new farm can afford (§3.1).
  let selected: ContentId = CORE_TURNIP;
  const listeners = new Set<() => void>();

  return {
    selected: () => selected,

    select(cropId) {
      if (cropId === selected) return; // no change: don't wake subscribers
      selected = cropId;
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
