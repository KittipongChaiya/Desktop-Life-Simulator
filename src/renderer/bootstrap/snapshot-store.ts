/**
 * The snapshot bridge. ADR-005 §2.
 *
 * This is the piece that decouples React from the 20 Hz tick. Without it, a UI
 * subscribed to world state would re-render 20 times a second, forever, for a
 * farm where nothing visible changed — not a performance nitpick but a product
 * failure, since idle cost is the product's defining constraint (VISION.md §2.1).
 *
 * Three properties, all load-bearing:
 *
 *   SLICED       — subscribers register per slice, so a change to one slice
 *                  never re-renders consumers of another.
 *   CHANGE-GATED — the sim bumps a slice version only when content actually
 *                  changes (see src/sim/snapshot/state.ts). Most ticks bump
 *                  nothing, so most ticks notify nobody.
 *   THROTTLED    — notifications are coalesced to at most UI_UPDATE_HZ and
 *                  delivered inside requestAnimationFrame, so React never
 *                  renders between paints.
 *
 * Built in phase-01 BEFORE any panel exists. Retrofitting throttling once
 * components subscribe directly is a rewrite of every component.
 */

import { UI_UPDATE_HZ } from '../../shared/constants';
import type { SliceMap, SliceName } from '../../sim/snapshot/slices';
import type { SnapshotState } from '../../sim/snapshot/state';
import type { SnapshotStore } from '../../sim/snapshot/store-contract';

type Listener = () => void;

export type { SnapshotStore };

const MIN_INTERVAL_MS = 1000 / UI_UPDATE_HZ;

export function createSnapshotStore(state: SnapshotState): SnapshotStore {
  const listeners = new Map<SliceName, Set<Listener>>();
  const deliveredVersion = new Map<SliceName, number>();
  let lastFlushMs = Number.NEGATIVE_INFINITY;

  const versionOf = (slice: SliceName): number => state[slice].version;

  return {
    subscribe(slice, listener) {
      let set = listeners.get(slice);
      if (set === undefined) {
        set = new Set();
        listeners.set(slice, set);
        // Seed the baseline so a fresh subscriber is not notified about a
        // change that happened before it existed.
        deliveredVersion.set(slice, versionOf(slice));
      }
      set.add(listener);

      return () => {
        set.delete(listener);
        if (set.size === 0) {
          listeners.delete(slice);
          deliveredVersion.delete(slice);
        }
      };
    },

    get<K extends SliceName>(slice: K): SliceMap[K] {
      // `state` is keyed by the same names as `SliceMap`, and each entry holds a
      // `VersionedSlice<SliceMap[thatKey]>`, so the value is `SliceMap[K]` by
      // construction. A generic indexed access cannot express that invariant
      // through the union, exactly as the command dispatcher's registry cannot
      // (CODE_STYLE.md §1.2). The cast is sound, not an assertion about data.
      return state[slice].value as SliceMap[K];
    },

    pump(nowMs) {
      if (listeners.size === 0) return;
      if (nowMs - lastFlushMs < MIN_INTERVAL_MS) return;

      let flushed = false;

      for (const [slice, set] of listeners) {
        const current = versionOf(slice);
        if (deliveredVersion.get(slice) === current) continue;

        deliveredVersion.set(slice, current);
        flushed = true;
        for (const listener of set) listener();
      }

      // Advance the clock only when something was actually delivered, so a
      // quiet period never delays the first real update.
      if (flushed) lastFlushMs = nowMs;
    },

    activeSubscriptions() {
      return listeners.size;
    },
  };
}
