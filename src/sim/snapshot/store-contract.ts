/**
 * The read-side contract for snapshot consumption.
 *
 * The INTERFACE lives in sim; the IMPLEMENTATION lives in
 * `src/renderer/bootstrap/snapshot-store.ts`.
 *
 * That split is deliberate. The UI layer needs the contract, but `ui` may not
 * import `bootstrap` (CODE_STYLE.md §8.1) — bootstrap is what wires the UI
 * together, so a dependency the other way inverts the layering. Both `ui` and
 * `bootstrap` may import `sim`, so the contract belongs here.
 *
 * The boundary linter caught this; it is not a hypothetical.
 */

import type { SliceMap, SliceName } from './slices';

export interface SnapshotStore {
  /** Subscribes to one slice. Returns an unsubscribe function. */
  subscribe(slice: SliceName, listener: () => void): () => void;

  /**
   * Current value of a slice.
   *
   * Referentially stable between changes — required by `useSyncExternalStore`,
   * which would otherwise loop forever.
   */
  get<K extends SliceName>(slice: K): SliceMap[K];

  /** Feeds elapsed time and flushes due notifications. Called once per frame. */
  pump(nowMs: number): void;

  /** Number of slices with at least one subscriber. Used by tests. */
  activeSubscriptions(): number;
}
