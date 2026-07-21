/**
 * Slice subscription hook. ADR-005 §2.
 *
 * `useSyncExternalStore` is the correct primitive for an external mutable
 * source: no tearing, no `useEffect` subscription races, and no extra library.
 *
 * A component MUST subscribe through this hook, never to the world directly.
 * Subscribing to the world would re-render at 20 Hz forever — the failure mode
 * ADR-005 exists to prevent, and one the idle-cost test will catch.
 */

import { useCallback, useSyncExternalStore } from 'react';

import type { SliceMap, SliceName } from '../../../sim/snapshot/slices';
import type { SnapshotStore } from '../../../sim/snapshot/store-contract';
import { useSnapshotStore } from '../store-context';

export function useSlice<K extends SliceName>(slice: K): SliceMap[K] {
  const store: SnapshotStore = useSnapshotStore();

  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(slice, onChange),
    [store, slice],
  );

  const getSnapshot = useCallback(() => store.get(slice), [store, slice]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
